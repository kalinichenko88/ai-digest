import { log } from '../logger.js';
import type { DigestItem, GitHubRelease, ToolResult } from '../types.js';

const GITHUB_API = 'https://api.github.com/repos';

export async function fetchGithubReleases(
  repos: string[],
): Promise<ToolResult> {
  const start = Date.now();
  const items: DigestItem[] = [];
  const warnings: string[] = [];

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const repoStart = Date.now();
      log('github', `Fetching latest release for ${repo}`);
      const response = await fetch(`${GITHUB_API}/${repo}/releases/latest`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        log(
          'github',
          `${repo}: HTTP ${response.status} (${Date.now() - repoStart}ms)`,
        );
        warnings.push(`${repo}: GitHub API returned ${response.status}`);
        await response.body?.cancel();
        return null;
      }

      const release = (await response.json()) as GitHubRelease;
      log(
        'github',
        `${repo}: got ${release.tag_name} (${Date.now() - repoStart}ms)`,
      );
      return {
        title: release.name || release.tag_name,
        url: release.html_url,
        source: 'github-releases',
        timestamp: release.published_at,
        description: release.body ?? undefined,
        author: release.author?.login ?? undefined,
      } as DigestItem;
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      items.push(result.value);
    } else if (result.status === 'rejected') {
      warnings.push(`GitHub API error: ${result.reason}`);
    }
  }

  log(
    'github',
    `All done: ${items.length}/${repos.length} releases fetched (${Date.now() - start}ms)`,
  );
  return { items, warnings: warnings.length > 0 ? warnings : undefined };
}
