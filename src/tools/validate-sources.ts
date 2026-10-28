import { loadSourcesConfig } from '../config.js';
import { log } from '../logger.js';
import type { SourcesConfig } from '../types.js';

export async function validateSources(path: string) {
  const config = loadSourcesConfig(path);
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

  return {
    structure: {
      valid: structureErrors.length === 0,
      errors: structureErrors,
    },
    reachability,
    summary: { passed, failed, unverifiable },
  };
}

export interface ReachabilityResult {
  type: 'rss' | 'github';
  name: string;
  status: 'ok' | 'failed' | 'unverifiable';
  detail?: string;
}

export function validateStructure(config: SourcesConfig): string[] {
  const errors: string[] = [];

  const rssNames = new Set<string>();
  for (const [i, src] of config.rss.entries()) {
    if (!src.name || src.name.trim() === '') {
      errors.push(`rss[${i}]: empty name`);
    } else if (rssNames.has(src.name)) {
      errors.push(`rss[${i}]: duplicate name "${src.name}"`);
    } else {
      rssNames.add(src.name);
    }

    if (!src.url?.startsWith('http://') && !src.url?.startsWith('https://')) {
      errors.push(
        `rss[${i}] "${src.name}": url must start with http:// or https://`,
      );
    }

    if (!Number.isInteger(src.limit) || src.limit < 1) {
      errors.push(`rss[${i}] "${src.name}": limit must be a positive integer`);
    }
  }

  const repoSet = new Set<string>();
  for (const repo of config.github_releases.repos) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      errors.push(`github: "${repo}" must match owner/repo format`);
    }
    if (repoSet.has(repo)) {
      errors.push(`github: duplicate repo "${repo}"`);
    } else {
      repoSet.add(repo);
    }
  }

  return errors;
}

export async function checkReachability(
  config: SourcesConfig,
): Promise<ReachabilityResult[]> {
  const checks: Promise<ReachabilityResult>[] = [];

  for (const src of config.rss) {
    checks.push(checkUrl('rss', src.name, src.url));
  }

  for (const repo of config.github_releases.repos) {
    checks.push(checkUrl('github', repo, `https://github.com/${repo}`));
  }

  return Promise.all(checks);
}

async function checkUrl(
  type: 'rss' | 'github',
  name: string,
  url: string,
): Promise<ReachabilityResult> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
    }
    if (res.ok) {
      return { type, name, status: 'ok' };
    }
    return { type, name, status: 'failed', detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      type,
      name,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
