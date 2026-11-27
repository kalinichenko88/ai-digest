import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { log } from './logger.js';
import type { DeliveryConfig, RssSource, SourcesConfig } from './types.js';

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
  for (const source of config.rss) {
    fillTelegram(source);
  }
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
        errors.push(
          `rss[${i}]: must be a mapping with name, url and limit, or with telegram`,
        );
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

// An rss entry `telegram: <channel>` reads that public channel through the
// bridge (ADR 0003). An explicit name or limit wins.
function fillTelegram(source: RssSource): void {
  if (typeof source.telegram !== 'string') {
    return;
  }

  source.url = TELEGRAM_FEED + encodeURIComponent(source.telegram);
  source.name ??= source.telegram;
  source.limit ??= 20;
}

// ponytail: the public RSS-Bridge instance; a setting for its address when the person self-hosts it
const TELEGRAM_FEED =
  'https://rss-bridge.org/bridge01/?action=display&bridge=TelegramBridge&format=Atom&username=';
