import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSourcesConfig } from '../../src/config.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DEFAULT_SOURCES_PATH = join(ROOT, 'config', 'sources.yml');
const DEFAULT_SOURCES = readFileSync(DEFAULT_SOURCES_PATH, 'utf8');
const RELEASED_SOURCES = DEFAULT_SOURCES.replace(
  '\n\ngithub_releases:',
  '\n  - name: new-feed\n    url: https://example.com/rss.xml\n    limit: 5\n\ngithub_releases:',
).replace(
  '    - tailwindlabs/tailwindcss\n',
  '    - tailwindlabs/tailwindcss\n    - biomejs/biome\n',
);

// CI has both yq programs. Locally, each test runs only where its yq is installed.
const hasGoYq =
  spawnSync('yq', ['--version'], { encoding: 'utf8' }).stdout?.includes(
    'mikefarah',
  ) === true;
// The Python yq (pip install yq) has the same name, so CI keeps it off PATH and names it here.
const pythonYq = process.env.PYTHON_YQ ?? '';

describe('apply-update.sh: merge of sources.yml', () => {
  it.skipIf(!hasGoYq && !process.env.CI)(
    'appends each rss feed and github repo of the release that the install does not have',
    () => {
      const installed = loadSourcesConfig(DEFAULT_SOURCES_PATH);

      const { output, merged } = runMerge(RELEASED_SOURCES, DEFAULT_SOURCES);

      expect(merged.github_releases.repos).toEqual([
        ...installed.github_releases.repos,
        'biomejs/biome',
      ]);
      expect(merged.rss).toEqual([
        ...installed.rss,
        { name: 'new-feed', url: 'https://example.com/rss.xml', limit: 5 },
      ]);
      expect(output.match(/Added new source: \S+/g)).toEqual([
        'Added new source: new-feed',
        'Added new source: biomejs/biome',
      ]);
    },
  );

  it.skipIf(!pythonYq && !process.env.CI)(
    'skips the merge with a warning when the yq on PATH is the Python yq',
    () => {
      expect(pythonYq, 'PYTHON_YQ names the Python yq').not.toBe('');

      const { output, merged } = runMerge(
        RELEASED_SOURCES,
        DEFAULT_SOURCES,
        pythonYq,
      );

      expect(output).toContain('skipping config merge');
      expect(merged).toEqual(loadSourcesConfig(DEFAULT_SOURCES_PATH));
    },
  );
});

// yq: the path of a yq program, whose folder goes first on PATH.
function runMerge(released: string, installed: string, yq?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const path = yq ? `${dirname(yq)}:${process.env.PATH}` : process.env.PATH;
  mkdirSync(join(dir, 'new', 'config'), { recursive: true });
  mkdirSync(join(dir, 'install', 'config'), { recursive: true });
  writeFileSync(join(dir, 'new', 'config', 'sources.yml'), released);
  writeFileSync(join(dir, 'install', 'config', 'sources.yml'), installed);
  try {
    const output = execFileSync(
      'bash',
      [
        '-c',
        mergeScript(),
        'apply-update.sh',
        join(dir, 'new'),
        join(dir, 'install'),
        '0.0.0',
        'owner/repo',
      ],
      { encoding: 'utf8', env: { ...process.env, PATH: path } },
    );

    return {
      output,
      merged: loadSourcesConfig(join(dir, 'install', 'config', 'sources.yml')),
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

// The start of the update helper, up to the copy of the files, is the config merge.
function mergeScript(): string {
  return readFileSync(join(ROOT, 'scripts', 'apply-update.sh'), 'utf8').split(
    '# --- Replace non-config files ---',
  )[0];
}
