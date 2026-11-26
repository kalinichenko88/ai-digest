import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { onTestFinished } from 'vitest';

// Runs run.sh as the archive ships it, with a stub claude that records the
// environment that Claude Code expands .mcp.json with.
export function launch(delivery: string, install: Install = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const home = join(dir, 'home');
  const bin = join(dir, 'bin');
  onTestFinished(() => {
    rmSync(dir, { recursive: true });
  });
  mkdirSync(join(dir, 'config'));
  mkdirSync(bin);
  writeFileSync(join(dir, '.version'), '0.0.0');
  writeFileSync(join(dir, 'config', 'delivery.yml'), delivery);
  copyFileSync(join(ROOT, 'scripts', 'run.sh'), join(dir, 'run.sh'));
  if (install.download === undefined) {
    copyFileSync(join(ROOT, '.mcp.json'), join(dir, '.mcp.json'));
  }
  const stubs = {
    claude: install.claude ?? `printf %s "$AI_DIGEST_OUTPUT" > '${dir}/output'`,
    docker: install.docker ?? 'exit 0',
    curl: CURL,
    // Records the notification, and shows none on the Mac of the test.
    osascript: 'echo "$@" > "$0.args"',
    ...(install.tail === undefined ? {} : { tail: install.tail }),
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  }
  if (typeof install.download === 'string') {
    writeFileSync(join(bin, 'curl.body'), install.download);
  }
  // A tail -f that run.sh leaves running keeps stdout open, and spawnSync
  // waits for it: the timeout ends the wait, and error tells.
  const { status, error } = spawnSync('bash', [join(dir, 'run.sh')], {
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
    timeout: 5_000,
  });
  if (error) {
    // The timeout ends bash only: stop the tail -f of its day log too.
    spawnSync('pkill', ['-f', dir]);
  }
  const args = () => {
    const output = readFileSync(join(dir, 'output'), 'utf8');

    return dockerArgs(dir, { HOME: home, AI_DIGEST_OUTPUT: output });
  };

  return { dir, home, status, error, args };
}

// Claude Code expands ${VAR} and ${VAR:-default} in the args of an MCP server.
export function dockerArgs(dir: string, env: Record<string, string>): string[] {
  const args: unknown = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    .mcpServers?.['ai-digest-mcp']?.args;
  const isText = (arg: unknown): arg is string => {
    return typeof arg === 'string';
  };
  if (!Array.isArray(args) || !args.every(isText)) {
    throw new Error('ai-digest-mcp in .mcp.json: args must be strings');
  }

  return args.map((arg) => {
    return arg.replace(
      /\$\{(\w+)(?::-([^}]*))?\}/g,
      (_, name: string, fallback?: string) => {
        return env[name] || (fallback ?? '');
      },
    );
  });
}

const ROOT = join(import.meta.dirname, '..', '..');

// A curl that saves curl.body as its -o file, or fails as on HTTP 404.
const CURL = `echo "$@" > "$0.args"; [ -f "$0.body" ] || exit 22
for arg; do [ "$prev" = -o ] && cp "$0.body" "$arg"; prev=$arg; done`;

// download: what curl serves (null: it fails); with one, no .mcp.json.
// claude, docker, tail: the body of the stub; with no tail, the real one.
type Install = {
  download?: string | null;
  docker?: string;
  claude?: string;
  tail?: string;
};
