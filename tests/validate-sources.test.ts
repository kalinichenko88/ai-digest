import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkReachability,
  validateSources,
  validateStructure,
} from '../src/tools/validate-sources.js';
import type { RssSource, SourcesConfig } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('validateSources', () => {
  it('reports a missing rss section as a structure error', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
    const path = join(dir, 'sources.yml');
    writeFileSync(path, 'github_releases:\n  repos:\n    - vercel/next.js\n');
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await validateSources(path);
    rmSync(dir, { recursive: true });

    expect(result.structure.valid).toBe(false);
    expect(result.structure.errors).toEqual([
      expect.stringContaining('rss: must be a list'),
    ]);
  });
});

describe('validateStructure', () => {
  it('returns no errors for valid config', () => {
    const rss = [{ name: 'test', url: 'https://example.com/rss', limit: 10 }];
    expect(validateStructure(sources(rss, ['owner/repo']))).toEqual([]);
  });

  const invalid: [string, RssSource[], string[]][] = [
    ['empty name', [{ name: '', url: 'https://a.com', limit: 10 }], []],
    ['url', [{ name: 'test', url: 'ftp://bad', limit: 10 }], []],
    ['limit', [{ name: 'test', url: 'https://a.com', limit: 0 }], []],
    [
      'duplicate',
      [
        { name: 'dup', url: 'https://a.com', limit: 5 },
        { name: 'dup', url: 'https://b.com', limit: 5 },
      ],
      [],
    ],
    ['owner/repo', [], ['just-a-name']],
    ['duplicate', [], ['a/b', 'a/b']],
  ];

  it.each(invalid)('reports "%s" (case %#)', (expected, rss, repos) => {
    const errors = validateStructure(sources(rss, repos));
    expect(errors).toContainEqual(expect.stringContaining(expected));
  });
});

describe('checkReachability', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('reports OK for 200 responses', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [{ name: 'test', url: 'https://example.com/rss', limit: 10 }],
      github_releases: { repos: [] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('ok');
  });

  it('reports failed for non-ok responses', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const config: SourcesConfig = {
      rss: [{ name: 'broken', url: 'https://example.com/404', limit: 10 }],
      github_releases: { repos: [] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].detail).toContain('404');
  });

  it('reports failed for network errors', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const config: SourcesConfig = {
      rss: [{ name: 'down', url: 'https://down.example.com', limit: 10 }],
      github_releases: { repos: [] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe('failed');
    expect(results[0].detail).toContain('ECONNREFUSED');
  });

  it('checks github repos at github.com URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ['owner/repo'] },
    };
    await checkReachability(config);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://github.com/owner/repo',
      expect.objectContaining({ method: 'HEAD' }),
    );
    // HEAD succeeded, so no GET fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GET when HEAD fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 405 }) // HEAD rejected
      .mockResolvedValueOnce({ ok: true, status: 200 }); // GET succeeds
    const config: SourcesConfig = {
      rss: [
        { name: 'head-reject', url: 'https://example.com/feed', limit: 10 },
      ],
      github_releases: { repos: [] },
    };
    const results = await checkReachability(config);
    expect(results[0].status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('checks all sources in parallel', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const config: SourcesConfig = {
      rss: [
        { name: 'a', url: 'https://a.com', limit: 5 },
        { name: 'b', url: 'https://b.com', limit: 5 },
      ],
      github_releases: { repos: ['o/r'] },
    };
    const results = await checkReachability(config);
    expect(results).toHaveLength(3);
  });
});

function sources(rss: RssSource[], repos: string[]): SourcesConfig {
  return { rss, github_releases: { repos } };
}
