import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadSourcesConfig } from '../../src/config.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DEFAULT_SOURCES_PATH = join(ROOT, 'config', 'sources.yml');
const DEFAULT_SOURCES = readFileSync(DEFAULT_SOURCES_PATH, 'utf8');

// CI has yq. Without it, run.sh skips the merge, so the test can only run locally with yq.
const hasYq = spawnSync('yq', ['--version']).status === 0;

describe.skipIf(!hasYq && !process.env.CI)(
  'run.sh update: merge of sources.yml',
  () => {
    it('appends each rss feed and github repo of the release that the install does not have', () => {
      const released = DEFAULT_SOURCES.replace(
        '\n\ngithub_releases:',
        '\n  - name: new-feed\n    url: https://example.com/rss.xml\n    limit: 5\n\ngithub_releases:',
      ).replace(
        '    - tailwindlabs/tailwindcss\n',
        '    - tailwindlabs/tailwindcss\n    - biomejs/biome\n',
      );
      const installed = loadSourcesConfig(DEFAULT_SOURCES_PATH);

      const { output, merged } = runMerge(released, DEFAULT_SOURCES);

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
    });
  },
);

function runMerge(released: string, installed: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
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
      { encoding: 'utf8' },
    );

    return {
      output,
      merged: loadSourcesConfig(join(dir, 'install', 'config', 'sources.yml')),
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

// The update helper is a heredoc in run.sh. Its start, up to the copy of the files, is the config merge.
function mergeScript(): string {
  const helper = readFileSync(join(ROOT, 'scripts', 'run.sh'), 'utf8').split(
    "<< 'HELPER'\n",
  )[1];

  return helper.split('# --- Replace non-config files ---')[0];
}
