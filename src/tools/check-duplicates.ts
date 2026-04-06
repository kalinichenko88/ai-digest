import { log } from '../logger.js';
import type {
  DeduplicationConfig,
  DigestEntry,
  DuplicateCheckItem,
  DuplicateCheckResponse,
  DuplicateMatch,
  DuplicateResult,
  DuplicateStatus,
} from '../types.js';
import { normalizeUrl } from '../utils/normalize.js';
import { titleSimilarity } from '../utils/similarity.js';

export function classifyItems(
  items: DuplicateCheckItem[],
  previousEntries: DigestEntry[],
  threshold: number,
): DuplicateCheckResponse {
  const prevByUrl = new Map<string, DigestEntry>();
  for (const entry of previousEntries) {
    const normalized = normalizeUrl(entry.url);
    if (normalized) prevByUrl.set(normalized, entry);
  }

  const results: DuplicateResult[] = [];
  let exactDuplicates = 0;
  let likelyDuplicates = 0;
  let unique = 0;

  for (const item of items) {
    const { status, matchedWith } = classify(
      item,
      prevByUrl,
      previousEntries,
      threshold,
    );

    if (status === 'exact_duplicate') exactDuplicates++;
    else if (status === 'likely_duplicate') likelyDuplicates++;
    else unique++;

    results.push({
      title: item.title,
      url: item.url,
      source: item.source,
      status,
      matched_with: matchedWith,
    });
  }

  return {
    results,
    summary: {
      total: items.length,
      exact_duplicates: exactDuplicates,
      likely_duplicates: likelyDuplicates,
      unique,
    },
  };
}

function classify(
  item: DuplicateCheckItem,
  prevByUrl: Map<string, DigestEntry>,
  previousEntries: DigestEntry[],
  threshold: number,
): { status: DuplicateStatus; matchedWith: DuplicateMatch | null } {
  // 1. Normalized URL match
  if (item.url) {
    const normalizedUrl = normalizeUrl(item.url);
    const urlMatch = prevByUrl.get(normalizedUrl);
    if (urlMatch) {
      return {
        status: 'exact_duplicate',
        matchedWith: toMatch(urlMatch),
      };
    }
  }

  // 2. Title similarity
  let bestScore = 0;
  let bestMatch: DigestEntry | null = null;

  for (const entry of previousEntries) {
    const score = titleSimilarity(item.title, entry.title);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestScore >= threshold && bestMatch) {
    return {
      status: 'likely_duplicate',
      matchedWith: toMatch(bestMatch),
    };
  }

  return { status: 'unique', matchedWith: null };
}

function toMatch(entry: DigestEntry): DuplicateMatch {
  return { title: entry.title, url: entry.url, date: entry.date };
}

export function checkDuplicates(
  items: DuplicateCheckItem[],
  previousEntries: DigestEntry[],
  config: DeduplicationConfig,
): DuplicateCheckResponse {
  log(
    'dedup',
    `Checking ${items.length} items against ${previousEntries.length} previous entries`,
  );

  const response = classifyItems(
    items,
    previousEntries,
    config.title_similarity_threshold,
  );

  log(
    'dedup',
    `Results: ${response.summary.exact_duplicates} exact, ${response.summary.likely_duplicates} likely, ${response.summary.unique} unique`,
  );

  return response;
}
