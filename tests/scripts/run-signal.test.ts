import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { start } from './launch.js';

describe('run.sh: a signal while it waits for claude', () => {
  it.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ] as const)(
    'stops claude and its tail -f on %s, and exits %i',
    async (signal, code) => {
      const { dir, child } = start('output_path: digests\n', {
        claude: 'while sleep 0.1; do :; done',
      });
      // run.sh, its claude and its tail -f run: run.sh waits for claude.
      await vi.waitFor(
        () => {
          expect(alive(dir)).toHaveLength(3);
        },
        { timeout: 3_000 },
      );
      child.kill(signal);
      const [status]: unknown[] = await once(child, 'exit');

      expect(status).toBe(code);
      expect(readFileSync(join(dir, 'logs', 'run.log'), 'utf8')).toContain(
        `stopped by ${signal}`,
      );
      expect(
        readFileSync(join(dir, 'bin', 'osascript.args'), 'utf8'),
      ).toContain(`exit ${code} — see logs/run.log`);
      await vi.waitFor(() => {
        expect(alive(dir), 'a claude or a tail -f stays').toEqual([]);
      });
    },
  );
});

// The processes whose command line holds the folder of the test.
function alive(dir: string): string[] {
  const { stdout } = spawnSync('pgrep', ['-f', dir], { encoding: 'utf8' });

  return stdout.split('\n').filter(Boolean);
}
