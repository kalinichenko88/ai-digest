import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { OFFLINE_CURL } from './launch.js';
import { update } from './update.js';

const ROOT = join(import.meta.dirname, '..', '..');
// The image that .mcp.json runs: with no tag, that is :latest.
const IMAGE = 'ghcr.io/kalinichenko88/ai-digest';
// Each file that the update replaces in the install, and its source in the repo.
const SHIPPED: Record<string, string> = {
  '.claude/settings.json': '.claude/settings.json',
  '.claude/skills/add-source/SKILL.md': '.claude/skills/add-source/SKILL.md',
  '.claude/skills/ai-digest/SKILL.md': '.claude/skills/ai-digest/SKILL.md',
  '.claude/skills/validate-sources/SKILL.md':
    '.claude/skills/validate-sources/SKILL.md',
  '.env.example': '.env.example',
  '.mcp.json': '.mcp.json',
  '.version': '.version',
  'CHANGELOG.md': 'CHANGELOG.md',
  'README.md': 'README.md',
  'apply-update.sh': 'scripts/apply-update.sh',
  'install.sh': 'scripts/install.sh',
  'run.sh': 'scripts/run.sh',
};

describe('run.sh update', () => {
  it('replaces each file of the install that the release ships, then deletes the download', () => {
    const { dir, install, status } = update();
    const download = readFileSync(join(dir, 'download'), 'utf8').trim();

    expect(status).toBe(0);
    for (const [file, source] of Object.entries(SHIPPED)) {
      expect(readFileSync(join(install, file), 'utf8'), file).toBe(
        readFileSync(join(ROOT, source), 'utf8'),
      );
    }
    expect(existsSync(dirname(download)), download).toBe(false);
    expect(existsSync(join(dir, 'bin', 'claude.ran')), 'Claude ran').toBe(
      false,
    );
  });

  it('pulls the image of the version it installs, and tags it latest, the tag that .mcp.json runs', () => {
    const { dir, status } = update();

    expect(status).toBe(0);
    expect(readFileSync(join(ROOT, '.mcp.json'), 'utf8')).toContain(
      `"${IMAGE}"`,
    );
    // Not a pull of :latest, which CI moves before it publishes the release.
    expect(readFileSync(join(dir, 'bin', 'docker.args'), 'utf8')).toBe(
      `pull ${IMAGE}:0.0.0-test\ntag ${IMAGE}:0.0.0-test ${IMAGE}:latest\n`,
    );
  });

  it('changes nothing when the image pull fails, so the next update runs again', () => {
    const { dir, install, status, stdout } = update({
      docker: 'echo "$@" >> "$0.args"; exit 1',
    });
    const download = readFileSync(join(dir, 'download'), 'utf8').trim();

    expect(status).toBe(1);
    expect(stdout).toContain('run ./run.sh update again');
    expect(readFileSync(join(dir, 'bin', 'docker.args'), 'utf8')).toBe(
      `pull ${IMAGE}:0.0.0-test\n`,
    );
    for (const file of Object.keys(SHIPPED)) {
      if (file === 'run.sh' || file === '.version') {
        continue;
      }
      expect(existsSync(join(install, file)), file).toBe(false);
    }
    expect(readFileSync(join(install, 'run.sh'), 'utf8')).toMatch(
      /# v0\.0\.0\n$/,
    );
    expect(readFileSync(join(install, '.version'), 'utf8')).toBe('0.0.0');
    expect(existsSync(dirname(download)), download).toBe(false);
  });

  it('sends the GITHUB_TOKEN of .env to the GitHub API', () => {
    const { dir, status } = update({ env: 'GITHUB_TOKEN=ghp_test\n' });

    expect(status).toBe(0);
    expect(readFileSync(join(dir, 'bin', 'curl.args'), 'utf8')).toContain(
      '-H Authorization: token ghp_test https://api.github.com/',
    );
  });

  // Stderr is no terminal here, so run.sh sends it to logs/run.log.
  it.each([
    [
      'the curl with the GITHUB_TOKEN of .env',
      { curl: OFFLINE_CURL, env: 'GITHUB_TOKEN=ghp_test\n' },
      'curl: (6) Could not resolve host',
    ],
    [
      'gh api',
      {
        gh: `[ "$1" = auth ] && exit 0; echo 'error connecting to api.github.com' >&2; exit 1`,
      },
      'error connecting to api.github.com',
    ],
    [
      'the curl with no token',
      { curl: OFFLINE_CURL },
      'curl: (6) Could not resolve host',
    ],
  ])(
    'stops with its message when the call for the latest release fails: %s',
    (_, stubs, error) => {
      const { install, status, stdout } = update(stubs);

      expect(stdout).toContain('Could not fetch latest version');
      expect(status).toBe(1);
      expect(readFileSync(join(install, 'logs', 'run.log'), 'utf8')).toContain(
        error,
      );
    },
  );
});
