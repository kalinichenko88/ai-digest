import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { writeStubs } from './launch.js';

const ROOT = join(import.meta.dirname, '..', '..');
const IMAGE = 'ghcr.io/kalinichenko88/ai-digest';

describe('install.sh: the Docker image', () => {
  it.each(['local', 'remote'] as const)(
    'pulls the version of .version and tags it latest, in %s mode',
    (mode) => {
      const { status, docker } = install(mode, '9.9.9');

      expect(status).toBe(0);
      expect(docker, 'CI moves :latest before the release').toEqual([
        `pull ${IMAGE}:9.9.9`,
        `tag ${IMAGE}:9.9.9 ${IMAGE}:latest`,
      ]);
    },
  );

  it.each([
    ['is empty', 'local', ''],
    ['is not in the archive', 'remote', null],
  ] as const)(
    'stops with a message and pulls nothing when .version %s',
    (_, mode, version) => {
      const { status, output, docker } = install(mode, version);

      expect(status).toBe(1);
      expect(output).toContain('.version');
      expect(output, 'it stops before its questions').not.toContain(
        'Digest language',
      );
      expect(docker).toEqual([]);
    },
  );
});

describe('install.sh: the download of the latest release', () => {
  it('stops with its message when the call for the latest release fails', () => {
    const { status, output, docker } = install('remote', '9.9.9', OFFLINE_CURL);

    expect(output).toContain('curl: (6) Could not resolve host');
    expect(output).toContain('Could not find latest release');
    expect(status).toBe(1);
    expect(docker).toEqual([]);
  });
});

// A curl with no network: exit 6, and with -S its own error, as the real one.
const OFFLINE_CURL = `for arg; do case $arg in -[!-]*S*) echo 'curl: (6) Could not resolve host: api.github.com' >&2 ;; esac; done; exit 6`;

// A curl that serves a release of the GitHub API, then its archive.
const CURL = `case "$*" in
  *api.github.com*) echo '  "browser_download_url": "https://github.com/o/r/releases/download/v9.9.9/ai-digest-v9.9.9.tar.gz"' ;;
  *) cat "$0.body" ;;
esac`;

// Runs install.sh in an unpacked archive (local) or in an empty folder, where
// it downloads the archive (remote). version: the .version of the archive,
// null for none. curl: the body of its stub. Each answer is the default.
function install(
  mode: 'local' | 'remote',
  version: string | null,
  curl = CURL,
) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const archive = join(dir, 'archive', 'ai-digest');
  const bin = join(dir, 'bin');
  const cwd = mode === 'local' ? archive : join(dir, 'remote');
  onTestFinished(() => {
    rmSync(dir, { recursive: true });
  });
  mkdirSync(join(archive, 'config'), { recursive: true });
  mkdirSync(bin);
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(archive, '.env.example'), 'GITHUB_TOKEN=\n');
  if (version !== null) {
    writeFileSync(join(archive, '.version'), version);
  }
  execFileSync('tar', [
    '-czf',
    join(bin, 'curl.body'),
    '-C',
    join(dir, 'archive'),
    'ai-digest',
  ]);
  writeStubs(bin, { docker: 'echo "$@" >> "$0.calls"', curl });
  // The questions read /dev/tty, which a test has not: one empty line answers each.
  writeFileSync(join(dir, 'answers'), '\n');
  const script = readFileSync(join(ROOT, 'scripts', 'install.sh'), 'utf8');
  writeFileSync(
    join(dir, 'install.sh'),
    script.replaceAll('/dev/tty', join(dir, 'answers')),
  );

  const { status, stdout, stderr } = spawnSync(
    'bash',
    [join(dir, 'install.sh')],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      timeout: 10_000,
    },
  );
  const calls = join(bin, 'docker.calls');
  const docker = existsSync(calls)
    ? readFileSync(calls, 'utf8').trim().split('\n')
    : [];

  return { status, output: stdout + stderr, docker };
}
