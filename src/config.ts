import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { log } from './logger.js';
import type { DeliveryConfig, SourcesConfig } from './types.js';

export function loadSourcesConfig(path: string): SourcesConfig {
  log('config', `Loading sources from ${path}`);
  const raw = readFileSync(path, 'utf-8');
  const config = parse(raw) as SourcesConfig;
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
  const config = {
    language: parsed.language ?? 'en',
    output_path: parsed.output_path ?? '~/digests',
    notification: parsed.notification ?? true,
  };
  log(
    'config',
    `Delivery: lang=${config.language}, output=${config.output_path}, notify=${config.notification}`,
  );
  return config;
}
