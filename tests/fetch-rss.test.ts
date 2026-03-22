import { describe, expect, it, vi } from 'vitest';

import { fetchRss } from '../src/tools/fetch-rss.js';

// Mock rss-parser
vi.mock('rss-parser', () => {
  return {
    default: class {
      async parseURL() {
        return {
          items: [
            {
              title: 'Test Article',
              link: 'https://example.com/article',
              pubDate: '2026-03-19T08:00:00Z',
              contentSnippet: 'A test article description',
              creator: 'testauthor',
            },
            {
              title: 'Second Article',
              link: 'https://example.com/article2',
              pubDate: '2026-03-19T07:00:00Z',
              contentSnippet: 'Another description',
            },
          ],
        };
      }
    },
  };
});

describe('fetchRss', () => {
  it('returns DigestItem[] from RSS feed', async () => {
    const result = await fetchRss(
      'test-source',
      'https://example.com/feed.xml',
      10,
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      title: 'Test Article',
      url: 'https://example.com/article',
      source: 'test-source',
      timestamp: '2026-03-19T08:00:00Z',
      description: 'A test article description',
      author: 'testauthor',
    });
    expect(result.warnings).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    const result = await fetchRss(
      'test-source',
      'https://example.com/feed.xml',
      1,
    );
    expect(result.items).toHaveLength(1);
  });
});
