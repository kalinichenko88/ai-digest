import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dockerArgs, launch } from './launch.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DELIVERY = 'output_path: digests\n';
const MCP_JSON = readFileSync(join(ROOT, '.mcp.json'), 'utf8');

describe('run.sh: the digest folder in the MCP container', () => {
  it('mounts output_path read-only at the path that the server reads', () => {
    const { home, args } = launch(
      'output_path: ~/Vault Notes/digests  # where to save digest files\n',
    );
    const digests = join(home, 'Vault Notes', 'digests');
    const command = args().join(' ');

    expect(command).toContain(`-e HOME=${home} `);
    expect(command).toContain(
      `--mount type=bind,src=${digests},dst=${digests},readonly `,
    );
    expect(existsSync(digests), 'docker refuses a missing source').toBe(true);
  });

  it('gives docker absolute paths for a relative output_path', () => {
    const mount = launch(DELIVERY)
      .args()
      .find((arg) => {
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
    const settings = readFileSync(`${ROOT}/.claude/settings.json`, 'utf8');

    expect(settings).not.toContain('"mcpServers"');
  });

  it('is fetched for the installed version when the install has none', () => {
    const { dir, status } = launch(DELIVERY, { download: MCP_JSON });
    const curlArgs = readFileSync(join(dir, 'bin', 'curl.args'), 'utf8');

    expect(status).toBe(0);
    expect(curlArgs).toContain(
      'https://raw.githubusercontent.com/kalinichenko88/ai-digest/v0.0.0/.mcp.json',
    );
    expect(curlArgs).toContain('--max-time 15');
    expect(readFileSync(join(dir, '.mcp.json'), 'utf8')).toBe(MCP_JSON);
  });

  it.each([
    ['fails', null],
    ['is the page of a proxy', '<html>Blocked by the proxy</html>'],
  ])('stops the run with exit 4 when its download %s', (_, download) => {
    const { dir, status } = launch(DELIVERY, { download });

    expect(status).toBe(4);
    expect(existsSync(join(dir, '.mcp.json'))).toBe(false);
  });

  it('stops the run with exit 3 when its Docker daemon does not run, also once downloaded', () => {
    expect(
      launch(DELIVERY, { download: MCP_JSON, docker: 'exit 1' }).status,
    ).toBe(3);
  });
});

describe('run.sh: the end of the run', () => {
  it('stops the tail, logs the exit code, notifies, and exits with it, when claude fails', () => {
    const { dir, status, error } = launch(DELIVERY, { claude: 'exit 9' });
    const logs = join(dir, 'logs');
    const dayLog = readdirSync(logs).find((name) => {
      return name.endsWith('.md');
    });
    const read = (file: string) => {
      return readFileSync(file, 'utf8');
    };

    expect(status).toBe(9);
    expect(error, 'a tail -f stays and keeps stdout open').toBeUndefined();
    expect(read(join(logs, dayLog ?? 'no day log'))).toContain(
      'Finished with exit code 9',
    );
    expect(read(join(logs, 'run.log'))).toContain('finished exit=9');
    expect(read(join(dir, 'bin', 'osascript.args'))).toContain(
      'with title "ai-digest failed"',
    );
  });

  it('logs the end, and kills no PID of its tail -f, when the tail has stopped already', () => {
    // claude ends after the tail, so bash reaps the tail first: its PID can be
    // another process's by then. The kill function records each kill.
    const { dir, status } = launch(DELIVERY, {
      claude:
        'until [ -f "$(dirname "$0")/tail.pid" ]; do sleep 0.05; done; sleep 0.2',
      tail: 'echo $$ > "$0.pid"',
      bashEnv:
        'kill() { echo "$@" >> "$(dirname "$0")/kill.args"; builtin kill "$@"; }',
    });
    const tailPid = readFileSync(join(dir, 'bin', 'tail.pid'), 'utf8').trim();
    const kills = join(dir, 'kill.args');

    expect(status).toBe(0);
    expect(readFileSync(join(dir, 'logs', 'run.log'), 'utf8')).toContain(
      'finished exit=0',
    );
    expect(existsSync(kills) ? readFileSync(kills, 'utf8') : '').not.toMatch(
      new RegExp(`\\b${tailPid}\\b`),
    );
  });

  it.each([
    [2, 'no docker on PATH', { docker: null }],
    [3, 'no Docker daemon', { docker: 'exit 1' }],
    [4, 'no .mcp.json to download', { download: null }],
  ])('notifies exit %i, with %s', (code, _, install) => {
    const { dir, status } = launch(DELIVERY, install);

    expect(status).toBe(code);
    expect(readFileSync(join(dir, 'bin', 'osascript.args'), 'utf8')).toContain(
      `exit ${code} — see logs/run.log`,
    );
  });
});
