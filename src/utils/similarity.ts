import { normalizeTitle } from './normalize.js';

export function titleSimilarity(a: string, b: string): number {
  const wordsA = titleToWords(a);
  const wordsB = titleToWords(b);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setB = new Set(wordsB);
  const overlap = wordsA.filter((w) => setB.has(w)).length;
  const minLen = Math.min(wordsA.length, wordsB.length);

  return overlap / minLen;
}

function titleToWords(title: string): string[] {
  const normalized = normalizeTitle(title);
  if (!normalized) return [];
  return normalized.split(' ').filter((w) => w.length > 0);
}
