import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadDeliveryConfig, loadSourcesConfig } from '../src/config.js';

const TEST_DIR = join(import.meta.dirname, 'fixtures', 'config');

describe('loadSourcesConfig', () => {
  it('parses sources.yml correctly', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(
      join(TEST_DIR, 'sources.yml'),
      `rss:
  - name: hackernews
    url: https://hnrss.org/frontpage
    limit: 30
github_releases:
  repos:
    - vercel/next.js
`,
    );

    const config = loadSourcesConfig(join(TEST_DIR, 'sources.yml'));
    expect(config.rss).toHaveLength(1);
    expect(config.rss[0].name).toBe('hackernews');
    expect(config.rss[0].url).toBe('https://hnrss.org/frontpage');
    expect(config.rss[0].limit).toBe(30);
    expect(config.github_releases.repos).toEqual(['vercel/next.js']);

    rmSync(TEST_DIR, { recursive: true });
  });

  it('throws on missing file', () => {
    expect(() => loadSourcesConfig('/nonexistent/path.yml')).toThrow();
  });
});

describe('loadDeliveryConfig', () => {
  it('parses delivery.yml with defaults', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(
      join(TEST_DIR, 'delivery.yml'),
      `language: ru
output_path: /tmp/test-digests
`,
    );

    const config = loadDeliveryConfig(join(TEST_DIR, 'delivery.yml'));
    expect(config.language).toBe('ru');
    expect(config.output_path).toBe('/tmp/test-digests');
    expect(config.notification).toBe(true);

    rmSync(TEST_DIR, { recursive: true });
  });
});
