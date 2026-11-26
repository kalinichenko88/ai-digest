import { spawnSync } from 'node:child_process';
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
const DELIVERY = 'output_path: digests\n';

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
    const mount = launch(DELIVERY).args.find((arg) => {
      return arg.startsWith('type=bind');
    });

    expect(mount).toMatch(/^type=bind,src=\/[^,]+,dst=\/[^,]+,readonly$/);
  });

  it('mounts a folder of the install when claude starts without run.sh', () => {
    const mount = dockerArgs(ROOT, { HOME: '/home/u' }).find((arg) => {
      return arg.startsWith('type=bind');
    });
    const src = mount?.match(/src=([^,]+)/)?.[1] ?? 'no mount';

    expect(existsSync(join(ROOT, src)), src).toBe(true);
    expect(mount, 'the server must not read it as output_path').not.toMatch(
      /dst=\/home\/u/,
    );
  });
});

describe('run.sh: the MCP server in .mcp.json', () => {
  it('is not in .claude/settings.json, where Claude Code reads no server', () => {
    const settings: unknown = JSON.parse(
      readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'),
    );

    expect(settings).not.toHaveProperty('mcpServers');
    expect(dockerArgs(ROOT, {})).toContain('ghcr.io/kalinichenko88/ai-digest');
  });

  it('is fetched for the installed version when the install has none', () => {
    // The update helper of v0.1.8 and older does not copy .mcp.json.
    const { dir, status } = launch(DELIVERY, { mcpJson: false, curl: CURL });

    expect(status).toBe(0);
    expect(readFileSync(join(dir, 'bin', 'curl.args'), 'utf8')).toContain(
      'https://raw.githubusercontent.com/kalinichenko88/ai-digest/v0.0.0/.mcp.json',
    );
    expect(readFileSync(join(dir, '.mcp.json'), 'utf8')).toBe(
      readFileSync(join(ROOT, '.mcp.json'), 'utf8'),
    );
  });

  it('stops the run with exit 4 when it cannot be fetched', () => {
    const { dir, status } = launch(DELIVERY, {
      mcpJson: false,
      curl: 'exit 22',
    });

    expect(status).toBe(4);
    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
  });

  it('stops the run with exit 3 when its Docker daemon does not run', () => {
    expect(launch(DELIVERY, { docker: 'exit 1' }).status).toBe(3);
  });
});

// A curl that records its arguments and saves the .mcp.json of the repo as its -o file.
const CURL = `echo "$@" > "$0.args"
for arg; do [ "$prev" = -o ] && cp '${ROOT}/.mcp.json' "$arg"; prev=$arg; done`;

type Install = { mcpJson?: boolean; curl?: string; docker?: string };

// Runs run.sh as the archive ships it, with a stub claude that records the
// environment that Claude Code expands .mcp.json with.
function launch(delivery: string, install: Install = {}) {
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
  if (install.mcpJson !== false) {
    copyFileSync(join(ROOT, '.mcp.json'), join(dir, '.mcp.json'));
  }
  const stubs = {
    claude: `printf %s "$AI_DIGEST_OUTPUT" > '${dir}/output'`,
    docker: install.docker ?? 'exit 0',
    curl: install.curl ?? 'exit 22',
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, {
      mode: 0o755,
    });
  }
  const { status } = spawnSync('bash', [join(dir, 'run.sh')], {
    env: { ...process.env, HOME: home, PATH: `${dir}/bin:${process.env.PATH}` },
  });
  const output = existsSync(join(dir, 'output'))
    ? readFileSync(join(dir, 'output'), 'utf8')
    : '';
  const args =
    status === 0
      ? dockerArgs(dir, { HOME: home, AI_DIGEST_OUTPUT: output })
      : [];

  return { dir, home, status, args };
}

// Claude Code expands ${VAR} and ${VAR:-default} in the args of an MCP server.
function dockerArgs(dir: string, env: Record<string, string>): string[] {
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
