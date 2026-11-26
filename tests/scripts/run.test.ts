import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

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
});

// Runs run.sh update in an install of v0.0.0, with stubs that serve the
// archive of v0.0.0-test, built as CI builds it. docker: the body of its stub;
// env: the .env of the install.
function update({
  docker = 'echo "$@" >> "$0.args"',
  env = '',
}: {
  docker?: string;
  env?: string;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const install = join(dir, 'install');
  const bin = join(dir, 'bin');
  onTestFinished(() => {
    rmSync(dir, { recursive: true });
  });
  const archive = execFileSync(
    'bash',
    [join(ROOT, 'scripts', 'build-archive.sh'), '0.0.0-test'],
    { cwd: dir, encoding: 'utf8' },
  ).trim();
  mkdirSync(join(install, '.claude', 'skills'), { recursive: true });
  cpSync(join(ROOT, 'config'), join(install, 'config'), { recursive: true });
  // An older run.sh, so that the test sees the update replace it
  writeFileSync(
    join(install, 'run.sh'),
    `${readFileSync(join(ROOT, 'scripts', 'run.sh'), 'utf8')}# v0.0.0\n`,
  );
  writeFileSync(join(install, '.version'), '0.0.0');
  if (env) {
    writeFileSync(join(install, '.env'), env);
  }
  mkdirSync(bin);
  const stubs = {
    // The API answer for the latest release; with -o, the archive, and its path in dir/download.
    curl: `echo "$@" >> "$0.args"
for arg; do [ "$prev" = -o ] && cp '${join(dir, archive)}' "$arg" && echo "$arg" > '${dir}/download' && exit; prev=$arg; done
echo '{"tag_name": "v0.0.0-test", "browser_download_url": "https://x/${archive}"}'`,
    gh: 'exit 1',
    docker,
    // run.sh exits in its update block: the launcher after it must not start Claude.
    claude: 'touch "$0.ran"',
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }

  const { status, stdout } = spawnSync(
    'bash',
    [join(install, 'run.sh'), 'update'],
    {
      encoding: 'utf8',
      env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
    },
  );

  return { dir, install, status, stdout };
}
