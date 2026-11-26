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

describe('run.sh update', () => {
  it('installs the release archive with its own apply-update.sh, then deletes the download', () => {
    const { dir, install, status } = update();
    const download = readFileSync(join(dir, 'download'), 'utf8').trim();

    expect(status).toBe(0);
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

  it('pulls the latest image, the tag that .mcp.json runs', () => {
    const { dir, status } = update();

    expect(status).toBe(0);
    expect(readFileSync(join(dir, 'bin', 'docker.args'), 'utf8')).toContain(
      `pull ${IMAGE}:latest\n`,
    );
  });

  it('keeps the old version when the image pull fails, so the next update pulls again', () => {
    const { dir, install, status } = update('echo "$@" >> "$0.args"; exit 1');

    expect(status).toBe(1);
    expect(readFileSync(join(dir, 'bin', 'docker.args'), 'utf8')).toContain(
      `pull ${IMAGE}:latest\n`,
    );
    expect(readFileSync(join(install, '.mcp.json'), 'utf8')).toBe(
      readFileSync(join(ROOT, '.mcp.json'), 'utf8'),
    );
    expect(readFileSync(join(install, '.version'), 'utf8')).toBe('0.0.0');
  });
});

// Runs run.sh update in an install of v0.0.0, with stubs that serve the
// archive of v0.0.0-test, built as CI builds it. docker: the body of its stub.
function update(docker = 'echo "$@" >> "$0.args"') {
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
    docker,
    // run.sh exits in its update block: the launcher after it must not start Claude.
    claude: 'touch "$0.ran"',
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }

  const { status } = spawnSync('bash', [join(install, 'run.sh'), 'update'], {
    env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
  });

  return { dir, install, status };
}
