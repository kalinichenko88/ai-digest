import { execFileSync } from 'node:child_process';
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

describe('run.sh update', () => {
  it('installs the release archive with its own apply-update.sh, then deletes the download', () => {
    const { dir, install } = update();
    const download = readFileSync(join(dir, 'download'), 'utf8').trim();

    expect(readFileSync(join(install, '.mcp.json'), 'utf8')).toBe(
      readFileSync(join(ROOT, '.mcp.json'), 'utf8'),
    );
    expect(readFileSync(join(install, 'apply-update.sh'), 'utf8')).toBe(
      readFileSync(join(ROOT, 'scripts', 'apply-update.sh'), 'utf8'),
    );
    expect(existsSync(dirname(download)), download).toBe(false);
    expect(existsSync(join(dir, 'bin', 'claude.ran')), 'Claude ran').toBe(
      false,
    );
  });

  it('tags the image of the release as the latest, which .mcp.json runs', () => {
    const { dir } = update();

    expect(readFileSync(join(dir, 'bin', 'docker.args'), 'utf8')).toContain(
      `tag ${IMAGE}:0.0.0-test ${IMAGE}:latest\n`,
    );
  });
});

// Runs run.sh update in an install of v0.0.0, with stubs that serve the
// archive of v0.0.0-test, built as CI builds it.
function update() {
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
  cpSync(join(ROOT, 'scripts', 'run.sh'), join(install, 'run.sh'));
  writeFileSync(join(install, '.version'), '0.0.0');
  mkdirSync(bin);
  const stubs = {
    // The API answer for the latest release; with -o, the archive, and its path in dir/download.
    curl: `for arg; do [ "$prev" = -o ] && cp '${join(dir, archive)}' "$arg" && echo "$arg" > '${dir}/download' && exit; prev=$arg; done
echo '{"tag_name": "v0.0.0-test", "browser_download_url": "https://x/${archive}"}'`,
    gh: 'exit 1',
    docker: 'echo "$@" >> "$0.args"',
    // run.sh exits in its update block: the launcher after it must not start Claude.
    claude: 'touch "$0.ran"',
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }

  execFileSync('bash', [join(install, 'run.sh'), 'update'], {
    env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
  });

  return { dir, install };
}
