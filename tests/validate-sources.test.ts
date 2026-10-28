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
    const yaml = 'github_releases:\n  repos:\n    - vercel/next.js\n';
    const result = await validateFile(yaml);

    expect(result.structure.valid).toBe(false);
    expect(result.structure.errors).toEqual([
      expect.stringContaining('rss: must be a list'),
    ]);
  });

  it('reports field errors and counts reachability for a file that loads', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const result = await validateFile(
      "rss:\n  - name: ''\n    url: https://a.com\n    limit: 1\ngithub_releases:\n  repos: []\n",
    );

    expect(result.structure.errors).toEqual([
      expect.stringContaining('name must be'),
    ]);
    expect(result.summary).toEqual({ passed: 1, failed: 0, unverifiable: 0 });
  });
});

describe('validateStructure', () => {
  it('returns no errors for valid config', () => {
    const rss = [{ name: 'test', url: 'https://example.com/rss', limit: 10 }];
    expect(validateStructure(sources(rss, ['owner/repo']))).toEqual([]);
  });

  // Rows hold raw YAML values, so a wrong type can reach validateStructure.
  const invalid: [string, unknown[], unknown[]][] = [
    ['name must be', [{ name: '', url: 'https://a.com', limit: 10 }], []],
    ['name must be', [{ name: 2024, url: 'https://a.com', limit: 1 }], []],
    ['url must start', [{ name: 'test', url: 'ftp://bad', limit: 10 }], []],
    ['url must start', [{ name: 'test', url: 123, limit: 1 }], []],
    ['limit must be', [{ name: 'test', url: 'https://a.com', limit: 0 }], []],
    [
      'duplicate name',
      [
        { name: 'dup', url: 'https://a.com', limit: 5 },
        { name: 'dup', url: 'https://b.com', limit: 5 },
      ],
      [],
    ],
    ['owner/repo', [], ['just-a-name']],
    ['duplicate repo', [], ['a/b', 'a/b']],
  ];

  it.each(invalid)('reports "%s" (case %#)', (expected, rss, repos) => {
    const config = sources(rss as RssSource[], repos as string[]);
    expect(validateStructure(config)).toContainEqual(
      expect.stringContaining(expected),
    );
  });
});

describe('checkReachability', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('reports OK for 200 responses', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const results = await checkReachability(
      sources([{ name: 'test', url: 'https://example.com/rss', limit: 10 }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('ok');
  });

  it('reports failed for non-ok responses', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const results = await checkReachability(
      sources([{ name: 'broken', url: 'https://example.com/404', limit: 10 }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].detail).toContain('404');
  });

  it('reports failed for network errors', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const results = await checkReachability(
      sources([{ name: 'down', url: 'https://down.example.com', limit: 10 }]),
    );
    expect(results[0].status).toBe('failed');
    expect(results[0].detail).toContain('ECONNREFUSED');
  });

  it('checks github repos at github.com URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await checkReachability(sources([], ['owner/repo']));
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
    const results = await checkReachability(
      sources([{ name: 'head', url: 'https://example.com/feed', limit: 10 }]),
    );
    expect(results[0].status).toBe('ok');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('checks all sources in parallel', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const rss = [
      { name: 'a', url: 'https://a.com', limit: 5 },
      { name: 'b', url: 'https://b.com', limit: 5 },
    ];
    const results = await checkReachability(sources(rss, ['o/r']));
    expect(results).toHaveLength(3);
  });
});

function sources(rss: RssSource[], repos: string[] = []): SourcesConfig {
  return { rss, github_releases: { repos } };
}

async function validateFile(yaml: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const path = join(dir, 'sources.yml');
  writeFileSync(path, yaml);
  try {
    return await validateSources(path);
  } finally {
    rmSync(dir, { recursive: true });
  }
}
