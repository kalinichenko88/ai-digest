import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkReachability,
  validateStructure,
} from '../src/tools/validate-sources.js';
import type { SourcesConfig } from '../src/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('validateStructure', () => {
  it('returns no errors for valid config', () => {
    const config: SourcesConfig = {
      rss: [{ name: 'test', url: 'https://example.com/rss', limit: 10 }],
      github_releases: { repos: ['owner/repo'] },
    };
    expect(validateStructure(config)).toEqual([]);
  });

  it('catches RSS entry with empty name', () => {
    const config: SourcesConfig = {
      rss: [{ name: '', url: 'https://example.com/rss', limit: 10 }],
      github_releases: { repos: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('empty name'));
  });

  it('catches RSS entry with invalid url', () => {
    const config: SourcesConfig = {
      rss: [{ name: 'test', url: 'ftp://bad', limit: 10 }],
      github_releases: { repos: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('url'));
  });

  it('catches RSS entry with non-positive limit', () => {
    const config: SourcesConfig = {
      rss: [{ name: 'test', url: 'https://example.com', limit: 0 }],
      github_releases: { repos: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('limit'));
  });

  it('catches duplicate RSS names', () => {
    const config: SourcesConfig = {
      rss: [
        { name: 'dup', url: 'https://a.com', limit: 5 },
        { name: 'dup', url: 'https://b.com', limit: 5 },
      ],
      github_releases: { repos: [] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('duplicate'));
  });

  it('catches invalid github repo format', () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ['just-a-name'] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('owner/repo'));
  });

  it('catches duplicate github repos', () => {
    const config: SourcesConfig = {
      rss: [],
      github_releases: { repos: ['a/b', 'a/b'] },
    };
    const errors = validateStructure(config);
    expect(errors).toContainEqual(expect.stringContaining('duplicate'));
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
