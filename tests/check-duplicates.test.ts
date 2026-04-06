import { describe, expect, it } from 'vitest';

import { classifyItems } from '../src/tools/check-duplicates.js';
import type { DigestEntry, DuplicateCheckItem } from '../src/types.js';

const previousEntries: DigestEntry[] = [
  {
    url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
    title: 'TypeScript 6.0 вышел официально',
    date: '2026-04-04',
  },
  {
    url: 'https://tkdodo.eu/blog/test-ids-are-an-a11y-smell',
    title: 'TkDodo: Test IDs — симптом пропущенной accessibility',
    date: '2026-04-04',
  },
  {
    url: 'https://vite.dev/blog/vite-7-0',
    title: 'Vite 7.0 — новая архитектура плагинов',
    date: '2026-04-05',
  },
];

describe('classifyItems', () => {
  it('marks exact URL match as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
        source: 'ts-blog',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
    expect(result.results[0].matched_with?.date).toBe('2026-04-04');
    expect(result.summary.exact_duplicates).toBe(1);
  });

  it('marks URL with query params as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/?ref=hn',
        source: 'hn',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
  });

  it('marks URL with trailing slash as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'Test IDs are a smell',
        url: 'https://tkdodo.eu/blog/test-ids-are-an-a11y-smell/',
        source: 'lobsters',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
  });

  it('marks similar title as likely_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 — крупнейший релиз вышел официально сегодня',
        url: 'https://dev.to/someone/typescript-6-review',
        source: 'dev-to',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('likely_duplicate');
    expect(result.results[0].matched_with).not.toBeNull();
  });

  it('marks unrelated item as unique', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'React 19.1 — server actions improvements',
        url: 'https://react.dev/blog/react-19.1',
        source: 'react-blog',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('unique');
    expect(result.results[0].matched_with).toBeNull();
  });

  it('returns all unique when no previous entries', () => {
    const items: DuplicateCheckItem[] = [
      { title: 'Some news', url: 'https://example.com', source: 'test' },
    ];

    const result = classifyItems(items, [], 0.6);
    expect(result.results[0].status).toBe('unique');
    expect(result.summary.unique).toBe(1);
  });

  it('returns empty results for empty items', () => {
    const result = classifyItems([], previousEntries, 0.6);
    expect(result.results).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it('handles item without URL using title-only comparison', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел официально',
        url: '',
        source: 'test',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('likely_duplicate');
  });

  it('populates summary correctly', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
        source: 'ts-blog',
      },
      {
        title: 'Vite 7.0 переосмысливает архитектуру плагинов полностью',
        url: 'https://dev.to/vite-7-review',
        source: 'dev-to',
      },
      {
        title: 'Totally new framework',
        url: 'https://newframework.dev',
        source: 'hn',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.summary.total).toBe(3);
    expect(result.summary.exact_duplicates).toBe(1);
    expect(result.summary.likely_duplicates).toBe(1);
    expect(result.summary.unique).toBe(1);
  });
});
