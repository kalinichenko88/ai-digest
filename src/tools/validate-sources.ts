import type { SourcesConfig } from '../types.js';

export interface ReachabilityResult {
  type: 'rss' | 'github';
  name: string;
  url: string;
  status: 'ok' | 'failed' | 'unverifiable';
  detail?: string;
}

export function validateStructure(config: SourcesConfig): string[] {
  const errors: string[] = [];

  const rssNames = new Set<string>();
  for (const [i, src] of config.rss.entries()) {
    if (!src.name || src.name.trim() === '') {
      errors.push(`rss[${i}]: empty name`);
    } else if (rssNames.has(src.name)) {
      errors.push(`rss[${i}]: duplicate name "${src.name}"`);
    } else {
      rssNames.add(src.name);
    }

    if (!src.url?.startsWith('http://') && !src.url?.startsWith('https://')) {
      errors.push(
        `rss[${i}] "${src.name}": url must start with http:// or https://`,
      );
    }

    if (!Number.isInteger(src.limit) || src.limit < 1) {
      errors.push(`rss[${i}] "${src.name}": limit must be a positive integer`);
    }
  }

  const repoSet = new Set<string>();
  for (const repo of config.github_releases.repos) {
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      errors.push(`github: "${repo}" must match owner/repo format`);
    }
    if (repoSet.has(repo)) {
      errors.push(`github: duplicate repo "${repo}"`);
    } else {
      repoSet.add(repo);
    }
  }

  return errors;
}

export async function checkReachability(
  config: SourcesConfig,
): Promise<ReachabilityResult[]> {
  const checks: Promise<ReachabilityResult>[] = [];

  for (const src of config.rss) {
    checks.push(checkUrl('rss', src.name, src.url));
  }

  for (const repo of config.github_releases.repos) {
    checks.push(checkUrl('github', repo, `https://github.com/${repo}`));
  }

  return Promise.all(checks);
}

async function checkUrl(
  type: 'rss' | 'github',
  name: string,
  url: string,
): Promise<ReachabilityResult> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      await res.body?.cancel();
    }
    if (res.ok) {
      return { type, name, url, status: 'ok' };
    }
    return { type, name, url, status: 'failed', detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      type,
      name,
      url,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
