import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
// Single append-only file: dated logs/*.md hold Claude's digest output, this
// holds process diagnostics. One path to tail when something dies.
const LOG_FILE = join(LOG_DIR, 'run.log');

if (!process.env.VITEST) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// sv-SE is ISO-shaped: "2026-07-25 17:32:14" in local time.
function timestamp(): string {
  return new Date().toLocaleString('sv-SE').slice(0, 16);
}

export function log(tag: string, message: string): void {
  if (process.env.VITEST) return;
  // pid tells apart concurrent server instances and respawns
  appendFileSync(
    LOG_FILE,
    `[${timestamp()}] [${process.pid}] [${tag.padEnd(13)}] ${message}\n`,
  );
}
