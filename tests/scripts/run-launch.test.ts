import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
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

const ROOT = join(import.meta.dirname, '..', '..');

describe('run.sh: the digest folder in the MCP container', () => {
  it('mounts output_path read-only at the path that the server reads', () => {
    const { home, args } = launch(
      'output_path: ~/Vault Notes/digests  # where to save digest files\n',
    );
    const digests = join(home, 'Vault Notes', 'digests');
    const command = args.join(' ');

    expect(command).toContain(`-e HOME=${home} `);
    expect(command).toContain(
      `--mount type=bind,src=${digests},dst=${digests},readonly `,
    );
    expect(existsSync(digests), 'docker refuses a missing source').toBe(true);
  });

  it('gives docker absolute paths for a relative output_path', () => {
    const { args } = launch('output_path: digests\n');
    const mount = args.find((arg) => {
      return arg.startsWith('type=bind');
    });

    expect(mount).toMatch(/^type=bind,src=\/[^,]+,dst=\/[^,]+,readonly$/);
  });

  it('mounts a folder of the install when claude starts without run.sh', () => {
    const mount = dockerArgs({ HOME: '/home/u' }).find((arg) => {
      return arg.startsWith('type=bind');
    });
    const src = mount?.match(/src=([^,]+)/)?.[1] ?? 'no mount';

    expect(existsSync(join(ROOT, src)), src).toBe(true);
    expect(mount, 'the server must not read it as output_path').not.toMatch(
      /dst=\/home\/u/,
    );
  });
});

// Runs run.sh as the archive ships it, with a stub claude that records the
// environment that Claude Code expands .claude/settings.json with.
function launch(delivery: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
  const home = join(dir, 'home');
  onTestFinished(() => {
    rmSync(dir, { recursive: true });
  });
  mkdirSync(join(dir, 'config'));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(home);
  writeFileSync(join(dir, '.version'), '0.0.0');
  writeFileSync(join(dir, 'config', 'delivery.yml'), delivery);
  copyFileSync(join(ROOT, 'scripts', 'run.sh'), join(dir, 'run.sh'));
  writeFileSync(
    join(dir, 'bin', 'claude'),
    `#!/bin/sh\nprintf %s "$AI_DIGEST_OUTPUT" > '${dir}/output'\n`,
    { mode: 0o755 },
  );
  execFileSync('bash', [join(dir, 'run.sh')], {
    env: { ...process.env, HOME: home, PATH: `${dir}/bin:${process.env.PATH}` },
  });
  const output = readFileSync(join(dir, 'output'), 'utf8');

  return { home, args: dockerArgs({ HOME: home, AI_DIGEST_OUTPUT: output }) };
}

// Claude Code expands ${VAR} and ${VAR:-default} in the args of an MCP server.
function dockerArgs(env: Record<string, string>): string[] {
  const args: unknown = JSON.parse(
    readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'),
  ).mcpServers?.['ai-digest-mcp']?.args;
  const isText = (arg: unknown): arg is string => {
    return typeof arg === 'string';
  };
  if (!Array.isArray(args) || !args.every(isText)) {
    throw new Error(
      'ai-digest-mcp in .claude/settings.json: args must be strings',
    );
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
