import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { log } from '../logger.js';
import type { DigestEntry, PreviousDigestResult } from '../types.js';

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;

export interface DigestFile {
  date: string;
  path: string;
}

export function getDigestFiles(
  dir: string,
  windowDays: number,
  today: Date = new Date(),
): DigestFile[] {
  // sv-SE renders dates as ISO "YYYY-MM-DD" in local time.
  const todayStr = today.toLocaleDateString('sv-SE');
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toLocaleDateString('sv-SE');

  let filenames: string[];
  try {
    filenames = readdirSync(dir);
  } catch {
    return [];
  }

  const files: DigestFile[] = [];
  for (const name of filenames) {
    const match = DATE_PATTERN.exec(name);
    if (!match) continue;
    const date = match[1];
    if (date >= todayStr) continue;
    if (date < cutoffStr) continue;
    files.push({ date, path: join(dir, name) });
  }

  return files.sort((a, b) => b.date.localeCompare(a.date));
}

export function parseDigestMarkdown(
  content: string,
  date: string,
): DigestEntry[] {
  const entries: DigestEntry[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const titleMatch = line.match(/^- \*\*(.+?)\*\*/);
    if (!titleMatch) continue;

    const urlMatch = line.match(/\[.+?\]\((https?:\/\/[^)]+)\)/);
    if (!urlMatch) continue;

    entries.push({
      title: titleMatch[1],
      url: urlMatch[1],
      date,
    });
  }

  return entries;
}

export function fetchPreviousUrls(
  outputPath: string,
  windowDays: number,
): PreviousDigestResult {
  log(
    'dedup',
    `Scanning ${outputPath} for digests (window: ${windowDays} days)`,
  );

  const files = getDigestFiles(outputPath, windowDays);

  if (files.length === 0) {
    log('dedup', 'No previous digests found');
    return {
      window_days: windowDays,
      digests_found: 0,
      dates: [],
      entries: [],
    };
  }

  const entries: DigestEntry[] = [];
  for (const file of files) {
    const content = readFileSync(file.path, 'utf-8');
    const parsed = parseDigestMarkdown(content, file.date);
    entries.push(...parsed);
  }

  log(
    'dedup',
    `Found ${entries.length} entries from ${files.length} digests (${files.map((f) => f.date).join(', ')})`,
  );

  return {
    window_days: windowDays,
    digests_found: files.length,
    dates: files.map((f) => f.date),
    entries,
  };
}
