import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { onTestFinished } from 'vitest';

// Runs run.sh update in an install of v0.0.0, with stubs that serve the
// archive of v0.0.0-test, built as CI builds it.
export function update({
  curl,
  gh = 'exit 1',
  docker = 'echo "$@" >> "$0.args"',
  env = '',
}: Stubs = {}) {
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
    curl:
      curl ??
      `echo "$@" >> "$0.args"
for arg; do [ "$prev" = -o ] && cp '${join(dir, archive)}' "$arg" && echo "$arg" > '${dir}/download' && exit; prev=$arg; done
echo '{"tag_name": "v0.0.0-test", "browser_download_url": "https://x/${archive}"}'`,
    gh,
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

const ROOT = join(import.meta.dirname, '..', '..');

// curl, gh, docker: the body of the stub. With no gh, one that fails, so
// run.sh calls curl. env: the .env of the install.
type Stubs = {
  curl?: string;
  gh?: string;
  docker?: string;
  env?: string;
};
