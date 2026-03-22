import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
mkdirSync(LOG_DIR, { recursive: true });

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    now.getFullYear() +
    '-' +
    pad(now.getMonth() + 1) +
    '-' +
    pad(now.getDate()) +
    ' ' +
    pad(now.getHours()) +
    ':' +
    pad(now.getMinutes())
  );
}

export function log(tag: string, message: string): void {
  const today = timestamp().slice(0, 10);
  const logFile = join(LOG_DIR, `${today}.md`);
  const line = `[${timestamp()}] [${tag.padEnd(13)}] ${message}\n`;
  appendFileSync(logFile, line);
}
