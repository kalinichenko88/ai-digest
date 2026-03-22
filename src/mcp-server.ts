import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadSourcesConfig } from './config.js';
import { log } from './logger.js';
import { fetchGithubReleases } from './tools/fetch-github-releases.js';
import { fetchAllRss, fetchRss } from './tools/fetch-rss.js';
import {
  checkReachability,
  validateStructure,
} from './tools/validate-sources.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, '..', 'config');

function jsonResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

log('mcp', 'Initializing MCP server');

const server = new McpServer({
  name: 'ai-digest-mcp',
  version: '0.1.0',
});

server.registerTool(
  'fetch_rss',
  {
    description:
      'Fetch items from an RSS feed configured in sources.yml by name',
    inputSchema: {
      name: z.string().describe('Source name from sources.yml rss section'),
    },
  },
  async ({ name }) => {
    log('fetch_rss', `Called for source: "${name}"`);
    const config = loadSourcesConfig(join(CONFIG_DIR, 'sources.yml'));
    const source = config.rss.find((s) => s.name === name);
    if (!source) {
      log('fetch_rss', `Source "${name}" not found in config`);
      return jsonResponse({
        items: [],
        warnings: [`RSS source "${name}" not found in sources.yml`],
      });
    }
    const result = await fetchRss(source.name, source.url, source.limit);
    log(
      'fetch_rss',
      `"${name}": ${result.items.length} items collected${result.warnings ? `, warnings: ${result.warnings.join('; ')}` : ''}`,
    );
    return jsonResponse(result);
  },
);

server.registerTool(
  'fetch_all_rss',
  {
    description:
      'Fetch items from ALL RSS feeds configured in sources.yml in parallel',
  },
  async () => {
    const config = loadSourcesConfig(join(CONFIG_DIR, 'sources.yml'));
    log(
      'fetch_all_rss',
      `Fetching all ${config.rss.length} RSS feeds in parallel`,
    );
    const result = await fetchAllRss(config.rss);
    log(
      'fetch_all_rss',
      `${result.items.length} items collected${result.warnings ? `, warnings: ${result.warnings.join('; ')}` : ''}`,
    );
    return jsonResponse(result);
  },
);

server.registerTool(
  'fetch_github_releases',
  {
    description:
      'Fetch latest releases for all repos configured in sources.yml',
  },
  async () => {
    const config = loadSourcesConfig(join(CONFIG_DIR, 'sources.yml'));
    log(
      'fetch_github',
      `Fetching releases for ${config.github_releases.repos.length} repos: ${config.github_releases.repos.join(', ')}`,
    );
    const result = await fetchGithubReleases(config.github_releases.repos);
    log(
      'fetch_github',
      `${result.items.length} releases collected${result.warnings ? `, warnings: ${result.warnings.join('; ')}` : ''}`,
    );
    return jsonResponse(result);
  },
);

server.registerTool(
  'validate_sources',
  {
    description:
      'Validate sources.yml structure and check that all source URLs are reachable',
  },
  async () => {
    const config = loadSourcesConfig(join(CONFIG_DIR, 'sources.yml'));
    log('validation', 'Starting sources validation');

    const structureErrors = validateStructure(config);
    const reachability = await checkReachability(config);

    let passed = 0;
    let failed = 0;
    let unverifiable = 0;
    for (const r of reachability) {
      if (r.status === 'ok') passed++;
      else if (r.status === 'failed') failed++;
      else unverifiable++;
    }

    log(
      'validation',
      `Sources validation: ${passed} passed, ${failed} failed, ${unverifiable} unable to verify`,
    );

    for (const r of reachability) {
      if (r.status === 'failed') {
        log('validation', `✗ ${r.type}: ${r.name} — ${r.detail}`);
      } else if (r.status === 'unverifiable') {
        log('validation', `⚠ ${r.type}: ${r.name} — unable to verify`);
      }
    }

    if (structureErrors.length > 0) {
      log('validation', `Structure errors: ${structureErrors.join('; ')}`);
    }

    return jsonResponse({
      structure: {
        valid: structureErrors.length === 0,
        errors: structureErrors,
      },
      reachability: reachability.map((r) => ({
        type: r.type,
        name: r.name,
        status: r.status,
        detail: r.detail,
      })),
      summary: { passed, failed, unverifiable },
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('mcp', 'Server connected and ready');
}

main().catch((err) => {
  log('mcp', `Fatal error: ${err}`);
  console.error(err);
});
