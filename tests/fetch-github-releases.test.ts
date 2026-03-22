import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGithubReleases } from '../src/tools/fetch-github-releases.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchGithubReleases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns DigestItem[] from GitHub API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v7.1.0',
        name: 'Vite 7.1.0',
        body: "## What's New\n\nFaster HMR for CSS modules",
        html_url: 'https://github.com/vitejs/vite/releases/tag/v7.1.0',
        published_at: '2026-03-19T10:00:00Z',
        author: { login: 'yyx990803' },
      }),
    });

    const result = await fetchGithubReleases(['vitejs/vite']);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      title: 'Vite 7.1.0',
      url: 'https://github.com/vitejs/vite/releases/tag/v7.1.0',
      source: 'github-releases',
      timestamp: '2026-03-19T10:00:00Z',
      description: "## What's New\n\nFaster HMR for CSS modules",
      author: 'yyx990803',
    });
  });

  it('handles 404 gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchGithubReleases(['nonexistent/repo']);
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toContain('nonexistent/repo');
  });

  it('sends Authorization header when GITHUB_TOKEN is set', async () => {
    process.env.GITHUB_TOKEN = 'test-token-123';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.0.0',
        name: 'Release',
        body: 'Notes',
        html_url: 'https://github.com/a/b/releases/tag/v1.0.0',
        published_at: '2026-03-19T10:00:00Z',
        author: { login: 'dev' },
      }),
    });

    await fetchGithubReleases(['a/b']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      }),
    );
    delete process.env.GITHUB_TOKEN;
  });

  it('does not send Authorization header when GITHUB_TOKEN is absent', async () => {
    delete process.env.GITHUB_TOKEN;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v1.0.0',
        name: 'Release',
        body: 'Notes',
        html_url: 'https://github.com/a/b/releases/tag/v1.0.0',
        published_at: '2026-03-19T10:00:00Z',
        author: { login: 'dev' },
      }),
    });

    await fetchGithubReleases(['a/b']);

    const callHeaders = mockFetch.mock.calls[0][1].headers;
    expect(callHeaders).not.toHaveProperty('Authorization');
  });

  it('fetches multiple repos', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: 'v1.0.0',
          name: 'Release 1',
          body: 'Notes 1',
          html_url: 'https://github.com/a/b/releases/tag/v1.0.0',
          published_at: '2026-03-19T10:00:00Z',
          author: { login: 'dev1' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: 'v2.0.0',
          name: 'Release 2',
          body: 'Notes 2',
          html_url: 'https://github.com/c/d/releases/tag/v2.0.0',
          published_at: '2026-03-19T11:00:00Z',
          author: { login: 'dev2' },
        }),
      });

    const result = await fetchGithubReleases(['a/b', 'c/d']);
    expect(result.items).toHaveLength(2);
  });
});
