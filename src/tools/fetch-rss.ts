import Parser from 'rss-parser';

import { log } from '../logger.js';
import type { DigestItem, RssSource, ToolResult } from '../types.js';

const parser = new Parser({ timeout: 15_000 });

export async function fetchRss(
  name: string,
  url: string,
  limit: number,
): Promise<ToolResult> {
  const start = Date.now();
  log('rss', `Fetching "${name}" from ${url} (limit: ${limit})`);
  try {
    const feed = await parser.parseURL(url);
    log(
      'rss',
      `"${name}": feed parsed, ${feed.items.length} total entries (${Date.now() - start}ms)`,
    );
    const items: DigestItem[] = feed.items.slice(0, limit).map((item) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      source: name,
      timestamp: item.pubDate ?? new Date().toISOString(),
      description: item.contentSnippet ?? item.content ?? undefined,
      author: item.creator ?? item.author ?? undefined,
    }));
    log(
      'rss',
      `"${name}": returning ${items.length} items (${Date.now() - start}ms)`,
    );
    return { items };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown RSS error';
    log('rss', `"${name}": error after ${Date.now() - start}ms — ${message}`);
    return { items: [], warnings: [`${name}: ${message}`] };
  }
}

export async function fetchAllRss(sources: RssSource[]): Promise<ToolResult> {
  const start = Date.now();
  log('rss', `Fetching all ${sources.length} RSS feeds in parallel`);

  const results = await Promise.allSettled(
    sources.map((source) => fetchRss(source.name, source.url, source.limit)),
  );

  const items: DigestItem[] = [];
  const warnings: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      if (result.value.warnings) warnings.push(...result.value.warnings);
    } else {
      warnings.push(`RSS error: ${result.reason}`);
    }
  }

  log(
    'rss',
    `All done: ${items.length} items from ${sources.length} feeds (${Date.now() - start}ms)`,
  );
  return { items, warnings: warnings.length > 0 ? warnings : undefined };
}
