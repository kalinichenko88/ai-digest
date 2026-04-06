import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getDigestFiles,
  parseDigestMarkdown,
} from '../src/tools/fetch-previous-urls.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'digests');

describe('parseDigestMarkdown', () => {
  it('extracts URLs from markdown links', () => {
    const md = `- **Title** — description. [Source](https://example.com/article)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/article');
  });

  it('extracts titles from bold list items', () => {
    const md = `- **TypeScript 6.0 вышел** — description. [Blog](https://example.com)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result[0].title).toBe('TypeScript 6.0 вышел');
  });

  it('extracts multiple entries', () => {
    const md = [
      '- **Title One** — desc. [Source](https://example.com/1)',
      '- **Title Two** — desc. [Source](https://example.com/2)',
    ].join('\n');
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(2);
  });

  it('sets date on all entries', () => {
    const md = `- **Title** — desc. [Source](https://example.com)`;
    const result = parseDigestMarkdown(md, '2026-04-04');
    expect(result[0].date).toBe('2026-04-04');
  });

  it('returns empty array for markdown with no list items', () => {
    const md = '# Just a heading\n\nSome paragraph text.';
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(0);
  });

  it('handles entries with multiple links (takes first)', () => {
    const md = `- **Title** — desc. [HN](https://hn.com) / [GitHub](https://github.com)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://hn.com');
  });
});

describe('getDigestFiles', () => {
  it('returns files within the window', () => {
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-04-06'));
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.date)).toContain('2026-04-04');
    expect(files.map((f) => f.date)).toContain('2026-04-05');
  });

  it('excludes today', () => {
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-04-05'));
    expect(files).toHaveLength(1);
    expect(files[0].date).toBe('2026-04-04');
  });

  it('returns empty for no matching files', () => {
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-01-01'));
    expect(files).toHaveLength(0);
  });

  it('respects window size', () => {
    const files = getDigestFiles(FIXTURES_DIR, 1, new Date('2026-04-06'));
    expect(files).toHaveLength(1);
    expect(files[0].date).toBe('2026-04-05');
  });
});
