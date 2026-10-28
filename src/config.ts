import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { log } from './logger.js';
import type { DeliveryConfig, SourcesConfig } from './types.js';

export function loadSourcesConfig(path: string): SourcesConfig {
  log('config', `Loading sources from ${path}`);
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const errors = shapeErrors(parsed);
  if (errors.length > 0) {
    throw new Error(`${path}: ${errors.join('; ')}`);
  }

  // Only the shape is checked here: a bad field fails one source, not the
  // whole call, and validateStructure reports it.
  const config = parsed as SourcesConfig;
  log(
    'config',
    `Sources: ${config.rss.length} RSS, ${config.github_releases.repos.length} GitHub repos`,
  );

  return config;
}

export function loadDeliveryConfig(path: string): DeliveryConfig {
  log('config', `Loading delivery config from ${path}`);
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const config: DeliveryConfig = {
    language: parsed.language ?? 'en',
    output_path: parsed.output_path ?? '~/digests',
    notification: parsed.notification ?? true,
    deduplication: {
      window_days: parsed.deduplication?.window_days ?? 3,
      title_similarity_threshold:
        parsed.deduplication?.title_similarity_threshold ?? 0.6,
    },
  };
  log(
    'config',
    `Delivery: lang=${config.language}, output=${config.output_path}, notify=${config.notification}, dedup_window=${config.deduplication.window_days}`,
  );
  return config;
}

function shapeErrors(parsed: unknown): string[] {
  const errors: string[] = [];

  const rss = isMapping(parsed) ? parsed.rss : undefined;
  if (!Array.isArray(rss)) {
    errors.push('rss: must be a list');
  } else {
    for (const [i, src] of rss.entries()) {
      if (!isMapping(src)) {
        errors.push(`rss[${i}]: must be a mapping with name, url and limit`);
      }
    }
  }

  const github = isMapping(parsed) ? parsed.github_releases : undefined;
  const repos = isMapping(github) ? github.repos : undefined;
  if (!Array.isArray(repos)) {
    errors.push('github_releases.repos: must be a list');
  }

  return errors;
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
