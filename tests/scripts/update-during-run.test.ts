import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

describe('apply-update.sh: the run.sh of a digest run that waits for claude', () => {
  it('lets the run end on its own run.sh, so it logs its end', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-digest-'));
    const install = join(dir, 'install');
    const bin = join(dir, 'bin');
    const go = join(dir, 'go');
    onTestFinished(() => {
      // A run.sh that read the wrong bytes can leave its tail -f.
      spawnSync('pkill', ['-f', dir]);
      rmSync(dir, { recursive: true });
    });
    const archive = execFileSync(
      'bash',
      [join(ROOT, 'scripts', 'build-archive.sh'), '0.0.0-test'],
      { cwd: dir, encoding: 'utf8' },
    ).trim();
    execFileSync('tar', ['-xzf', archive], { cwd: dir });
    mkdirSync(join(install, '.claude', 'skills'), { recursive: true });
    mkdirSync(join(install, 'config'));
    mkdirSync(bin);
    writeFileSync(join(install, '.version'), '0.0.0');
    writeFileSync(join(install, 'config', 'delivery.yml'), 'output_path: x\n');
    copyFileSync(join(ROOT, '.mcp.json'), join(install, '.mcp.json'));
    // An older run.sh, longer before its wait, as the one of v0.1.8 is: at
    // its offset after the wait, the new run.sh has no bytes left.
    const script = readFileSync(join(ROOT, 'scripts', 'run.sh'), 'utf8');
    writeFileSync(
      join(install, 'run.sh'),
      script.replace('\n', `\n#${'-'.repeat(script.length)}\n`),
    );
    execFileSync('mkfifo', [go]);
    const stubs = {
      // Reads the fifo until the test closes it.
      claude: `cat '${go}'`,
      docker: 'exit 0',
      // Not the Go yq: the helper skips the merge of sources.yml.
      yq: 'exit 1',
      osascript: 'exit 0',
    };
    for (const [name, body] of Object.entries(stubs)) {
      writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
    }
    const env = {
      ...process.env,
      HOME: dir,
      PATH: `${bin}:${process.env.PATH}`,
    };

    const run = spawn('bash', [join(install, 'run.sh')], {
      env,
      stdio: 'ignore',
    });
    const exited = once(run, 'exit');
    // The open returns when claude reads the fifo: run.sh started it.
    const claude = await Promise.race([
      open(go, 'w'),
      exited.then(([code]) => {
        throw new Error(`run.sh exited ${code} before it started claude`);
      }),
    ]);
    execFileSync(
      'bash',
      [
        join(dir, 'ai-digest', 'apply-update.sh'),
        join(dir, 'ai-digest'),
        install,
        '0.0.0-test',
        'owner/repo',
      ],
      { env },
    );
    await claude.close();
    await exited;
    const logs = join(install, 'logs');
    const dayLog = readdirSync(logs).find((name) => {
      return name.endsWith('.md');
    });

    expect(readFileSync(join(install, 'run.sh'), 'utf8')).toBe(script);
    expect(readFileSync(join(logs, dayLog ?? 'no day log'), 'utf8')).toContain(
      'Finished with exit code 0',
    );
  });
});
