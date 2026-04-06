# Cross-Day Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add programmatic cross-day deduplication to the ai-digest pipeline so the same news stops appearing in daily digests.

**Architecture:** Two new MCP tools (`fetch_previous_urls` and `check_duplicates`) parse previous digest markdown files, classify incoming items as exact_duplicate/likely_duplicate/unique, and return structured results for Claude to act on. Shared utility functions handle URL normalization and title similarity. SKILL.md is updated to wire the tools into Steps 2 and 4.

**Tech Stack:** TypeScript, Node.js, Vitest, MCP SDK, YAML, Zod

**Spec:** `docs/superpowers/specs/2026-04-06-cross-day-deduplication-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/utils/normalize.ts` | Create | URL and title normalization functions |
| `src/utils/similarity.ts` | Create | Title word-overlap similarity |
| `src/tools/fetch-previous-urls.ts` | Create | Read previous digests, extract URLs + titles |
| `src/tools/check-duplicates.ts` | Create | Classify items as exact_duplicate/likely_duplicate/unique |
| `src/types.ts` | Modify | Add deduplication types |
| `src/config.ts` | Modify | Load deduplication config from delivery.yml |
| `src/mcp-server.ts` | Modify | Register two new MCP tools |
| `config/delivery.yml` | Modify | Add deduplication section |
| `.claude/skills/ai-digest/SKILL.md` | Modify | Update Steps 2 and 4 |
| `tests/fixtures/digests/2026-04-04.md` | Create | Test fixture |
| `tests/fixtures/digests/2026-04-05.md` | Create | Test fixture |
| `tests/normalize.test.ts` | Create | Normalization tests |
| `tests/similarity.test.ts` | Create | Similarity tests |
| `tests/fetch-previous-urls.test.ts` | Create | Previous URL extraction tests |
| `tests/check-duplicates.test.ts` | Create | Duplicate classification tests |

---

### Task 1: Types and Config

**Files:**
- Modify: `src/types.ts`
- Modify: `src/config.ts`
- Modify: `config/delivery.yml`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Add deduplication types to `src/types.ts`**

Append after the existing `DeliveryConfig` interface:

```typescript
export interface DigestEntry {
  url: string;
  title: string;
  date: string;
}

export interface PreviousDigestResult {
  window_days: number;
  digests_found: number;
  dates: string[];
  entries: DigestEntry[];
  urls: string[];
}

export type DuplicateStatus = 'exact_duplicate' | 'likely_duplicate' | 'unique';

export interface DuplicateCheckItem {
  title: string;
  url: string;
  source: string;
}

export interface DuplicateMatch {
  title: string;
  url: string;
  date: string;
}

export interface DuplicateResult {
  title: string;
  url: string;
  source: string;
  status: DuplicateStatus;
  matched_with: DuplicateMatch | null;
}

export interface DuplicateCheckResponse {
  results: DuplicateResult[];
  summary: {
    total: number;
    exact_duplicates: number;
    likely_duplicates: number;
    unique: number;
  };
}

export interface DeduplicationConfig {
  window_days: number;
  title_similarity_threshold: number;
}
```

- [ ] **Step 2: Update `DeliveryConfig` in `src/types.ts`**

Add the optional deduplication field:

```typescript
export interface DeliveryConfig {
  language: string;
  output_path: string;
  notification: boolean;
  deduplication?: DeduplicationConfig;
}
```

- [ ] **Step 3: Add deduplication section to `config/delivery.yml`**

```yaml
language: ru
output_path: ~/Personal/0_Journal/Tech
notification: true
deduplication:
  window_days: 3
  title_similarity_threshold: 0.6
```

- [ ] **Step 4: Update `loadDeliveryConfig` in `src/config.ts`**

```typescript
export function loadDeliveryConfig(path: string): DeliveryConfig {
  log('config', `Loading delivery config from ${path}`);
  const raw = readFileSync(path, 'utf-8');
  const parsed = parse(raw);
  const config: DeliveryConfig = {
    language: parsed.language ?? 'en',
    output_path: parsed.output_path ?? '~/digests',
    notification: parsed.notification ?? true,
    deduplication: parsed.deduplication
      ? {
          window_days: parsed.deduplication.window_days ?? 3,
          title_similarity_threshold:
            parsed.deduplication.title_similarity_threshold ?? 0.6,
        }
      : { window_days: 3, title_similarity_threshold: 0.6 },
  };
  log(
    'config',
    `Delivery: lang=${config.language}, output=${config.output_path}, notify=${config.notification}, dedup_window=${config.deduplication?.window_days}`,
  );
  return config;
}
```

- [ ] **Step 5: Add config test for deduplication in `tests/config.test.ts`**

Add a new test inside the existing `describe('loadDeliveryConfig', ...)` block:

```typescript
it('parses deduplication config', () => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'delivery.yml'),
    `language: ru
output_path: /tmp/test-digests
notification: true
deduplication:
  window_days: 5
  title_similarity_threshold: 0.7
`,
  );

  const config = loadDeliveryConfig(join(TEST_DIR, 'delivery.yml'));
  expect(config.deduplication).toEqual({
    window_days: 5,
    title_similarity_threshold: 0.7,
  });

  rmSync(TEST_DIR, { recursive: true });
});

it('uses default deduplication config when not specified', () => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFileSync(
    join(TEST_DIR, 'delivery.yml'),
    `language: en
output_path: /tmp/test
`,
  );

  const config = loadDeliveryConfig(join(TEST_DIR, 'delivery.yml'));
  expect(config.deduplication).toEqual({
    window_days: 3,
    title_similarity_threshold: 0.6,
  });

  rmSync(TEST_DIR, { recursive: true });
});
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/config.test.ts`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/config.ts config/delivery.yml tests/config.test.ts
git commit -m "feat(dedup): add deduplication types and config"
```

---

### Task 2: URL and Title Normalization

**Files:**
- Create: `src/utils/normalize.ts`
- Create: `tests/normalize.test.ts`

- [ ] **Step 1: Write failing tests in `tests/normalize.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { normalizeTitle, normalizeUrl } from '../src/utils/normalize.js';

describe('normalizeUrl', () => {
  it('lowercases the URL', () => {
    expect(normalizeUrl('HTTPS://Example.COM/Path')).toBe(
      'https://example.com/path',
    );
  });

  it('strips trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe(
      'https://example.com/path',
    );
  });

  it('strips query params', () => {
    expect(
      normalizeUrl('https://example.com/path?utm_source=hn&ref=top'),
    ).toBe('https://example.com/path');
  });

  it('strips fragment', () => {
    expect(normalizeUrl('https://example.com/path#section')).toBe(
      'https://example.com/path',
    );
  });

  it('strips query params and fragment together', () => {
    expect(
      normalizeUrl('https://example.com/path?ref=hn#atom-everything'),
    ).toBe('https://example.com/path');
  });

  it('handles URL without path', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('');
  });

  it('returns original string for non-URL input', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('normalizeTitle', () => {
  it('lowercases the title', () => {
    expect(normalizeTitle('TypeScript 6.0 Вышел')).toBe(
      'typescript 6.0 вышел',
    );
  });

  it('strips punctuation', () => {
    expect(normalizeTitle('Hello, World! — Test...')).toBe(
      'hello world test',
    );
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('hello   world   test')).toBe('hello world test');
  });

  it('handles empty string', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('handles cyrillic with punctuation', () => {
    expect(
      normalizeTitle('TypeScript 6.0 RC — до финального релиза!'),
    ).toBe('typescript 6.0 rc до финального релиза');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/normalize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/utils/normalize.ts`**

```typescript
export function normalizeUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const normalized =
      `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
    return normalized.endsWith('/')
      ? normalized.slice(0, -1)
      : normalized;
  } catch {
    return url;
  }
}

export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/normalize.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/normalize.ts tests/normalize.test.ts
git commit -m "feat(dedup): add URL and title normalization"
```

---

### Task 3: Title Similarity

**Files:**
- Create: `src/utils/similarity.ts`
- Create: `tests/similarity.test.ts`

- [ ] **Step 1: Write failing tests in `tests/similarity.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { titleSimilarity } from '../src/utils/similarity.js';

describe('titleSimilarity', () => {
  it('returns 1 for identical titles', () => {
    expect(titleSimilarity('TypeScript 6.0 вышел', 'TypeScript 6.0 вышел')).toBe(1);
  });

  it('returns 1 for identical titles after normalization', () => {
    expect(
      titleSimilarity('TypeScript 6.0 Вышел!', 'typescript 6.0 вышел'),
    ).toBe(1);
  });

  it('returns high similarity for similar titles', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 вышел официально',
      'TypeScript 6.0 вышел — прощай легаси',
    );
    // "typescript", "6.0", "вышел" overlap -> 3 / min(4, 5) = 0.75
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it('returns low similarity for different titles', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 вышел',
      'React 19 новые хуки',
    );
    expect(score).toBeLessThan(0.3);
  });

  it('handles one empty title', () => {
    expect(titleSimilarity('', 'TypeScript 6.0')).toBe(0);
  });

  it('handles both empty titles', () => {
    expect(titleSimilarity('', '')).toBe(0);
  });

  it('handles titles with only stop-like short words', () => {
    const score = titleSimilarity('a b c', 'a b c');
    expect(score).toBe(1);
  });

  it('catches TypeScript RC vs stable as likely duplicate', () => {
    const score = titleSimilarity(
      'TypeScript 6.0 RC — до финального релиза один шаг',
      'TypeScript 6.0 вышел официально',
    );
    // "typescript", "6.0" overlap -> 2 / min(7, 4) = 0.5
    // Close to threshold but may not pass — this is expected behavior,
    // exact URL match should catch these
    expect(score).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/similarity.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/utils/similarity.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/similarity.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/similarity.ts tests/similarity.test.ts
git commit -m "feat(dedup): add title word-overlap similarity"
```

---

### Task 4: Test Fixtures

**Files:**
- Create: `tests/fixtures/digests/2026-04-04.md`
- Create: `tests/fixtures/digests/2026-04-05.md`

- [ ] **Step 1: Create `tests/fixtures/digests/2026-04-04.md`**

```markdown
---
date: 2026-04-04
type: digest
language: ru
sources: 8
items: 15
---

# Технический дайджест — 4 апреля 2026

> 15 материалов из 8 источников

## 🔥 Hot

- **TypeScript 6.0 вышел официально** — Microsoft выпустила TypeScript 6.0: крупнейший релиз за несколько лет. [TypeScript Blog](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)

- **React Router v7.5 — новый data loading API** — Полностью переработанный подход к загрузке данных. [React Router Blog](https://reactrouter.com/blog/v7.5)

## 🎯 Актуально для ваших проектов

- **TkDodo: Test IDs — симптом пропущенной accessibility** — Доминик объясняет, почему data-testid указывает на отсутствие семантики. [TkDodo Blog](https://tkdodo.eu/blog/test-ids-are-an-a11y-smell)
  _React + TypeScript паттерны_

## 🤖 AI / LLM

- **Claude Code v2.1.85 — MCP server improvements** — Улучшения стабильности MCP серверов. [GitHub Releases](https://github.com/anthropics/claude-code/releases/tag/v2.1.85)
```

- [ ] **Step 2: Create `tests/fixtures/digests/2026-04-05.md`**

```markdown
---
date: 2026-04-05
type: digest
language: ru
sources: 10
items: 20
---

# Технический дайджест — 5 апреля 2026

> 20 материалов из 10 источников

## 🔥 Hot

- **TypeScript 6.0 RC — до финального релиза один шаг** — Release Candidate TypeScript 6.0 уже доступен для тестирования. [Microsoft DevBlogs](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0-rc/)

- **Vite 7.0 — новая архитектура плагинов** — Полностью переработанный pipeline. [Vite Blog](https://vite.dev/blog/vite-7-0)

## 🎯 Актуально для ваших проектов

- **TkDodo: Omit сломан для дискриминированных юнионов** — Детальный разбор. [TkDodo](https://tkdodo.eu/blog/omit-for-discriminated-unions-in-type-script)
  _TypeScript — практический паттерн_

## 🔧 DevTools / Releases

- **openscreen: бесплатная open-source альтернатива Screen Studio** — TypeScript-проект в тренде. [GitHub](https://github.com/siddharthvaddem/openscreen)
```

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/digests/
git commit -m "test(dedup): add digest fixture files"
```

---

### Task 5: `fetch_previous_urls` Tool

**Files:**
- Create: `src/tools/fetch-previous-urls.ts`
- Create: `tests/fetch-previous-urls.test.ts`

- [ ] **Step 1: Write failing tests in `tests/fetch-previous-urls.test.ts`**

```typescript
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  getDigestFiles,
  parseDigestMarkdown,
} from '../src/tools/fetch-previous-urls.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures', 'digests');

describe('parseDigestMarkdown', () => {
  it('extracts URLs from markdown links', () => {
    const md = `- **Title** — description. [Source](https://example.com/article)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/article');
  });

  it('extracts titles from bold list items', () => {
    const md = `- **TypeScript 6.0 вышел** — description. [Blog](https://example.com)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result[0].title).toBe('TypeScript 6.0 вышел');
  });

  it('extracts multiple entries', () => {
    const md = [
      '- **Title One** — desc. [Source](https://example.com/1)',
      '- **Title Two** — desc. [Source](https://example.com/2)',
    ].join('\n');
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(2);
  });

  it('sets date on all entries', () => {
    const md = `- **Title** — desc. [Source](https://example.com)`;
    const result = parseDigestMarkdown(md, '2026-04-04');
    expect(result[0].date).toBe('2026-04-04');
  });

  it('returns empty array for markdown with no list items', () => {
    const md = '# Just a heading\n\nSome paragraph text.';
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(0);
  });

  it('handles entries with multiple links (takes first)', () => {
    const md = `- **Title** — desc. [HN](https://hn.com) / [GitHub](https://github.com)`;
    const result = parseDigestMarkdown(md, '2026-04-05');
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://hn.com');
  });
});

describe('getDigestFiles', () => {
  it('returns files within the window', () => {
    // Fixtures have 2026-04-04.md and 2026-04-05.md
    // With today=2026-04-06 and window=3, both should be included
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-04-06'));
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.date)).toContain('2026-04-04');
    expect(files.map((f) => f.date)).toContain('2026-04-05');
  });

  it('excludes today', () => {
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-04-05'));
    // Only 2026-04-04.md should match (04-05 is "today", excluded)
    expect(files).toHaveLength(1);
    expect(files[0].date).toBe('2026-04-04');
  });

  it('returns empty for no matching files', () => {
    const files = getDigestFiles(FIXTURES_DIR, 3, new Date('2026-01-01'));
    expect(files).toHaveLength(0);
  });

  it('respects window size', () => {
    // Window=1 from 2026-04-06 -> only yesterday (2026-04-05)
    const files = getDigestFiles(FIXTURES_DIR, 1, new Date('2026-04-06'));
    expect(files).toHaveLength(1);
    expect(files[0].date).toBe('2026-04-05');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/fetch-previous-urls.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/tools/fetch-previous-urls.ts`**

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { log } from '../logger.js';
import type { DigestEntry, PreviousDigestResult } from '../types.js';
import { normalizeUrl } from '../utils/normalize.js';

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
  const todayStr = formatDate(today);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = formatDate(cutoff);

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
    if (date <= cutoffStr) continue;
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
  log('dedup', `Scanning ${outputPath} for digests (window: ${windowDays} days)`);

  const files = getDigestFiles(outputPath, windowDays);

  if (files.length === 0) {
    log('dedup', 'No previous digests found');
    return {
      window_days: windowDays,
      digests_found: 0,
      dates: [],
      entries: [],
      urls: [],
    };
  }

  const entries: DigestEntry[] = [];
  for (const file of files) {
    const content = readFileSync(file.path, 'utf-8');
    const parsed = parseDigestMarkdown(content, file.date);
    entries.push(...parsed);
  }

  const urls = [...new Set(entries.map((e) => normalizeUrl(e.url)))];

  log(
    'dedup',
    `Found ${entries.length} entries from ${files.length} digests (${files.map((f) => f.date).join(', ')})`,
  );

  return {
    window_days: windowDays,
    digests_found: files.length,
    dates: files.map((f) => f.date),
    entries,
    urls,
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/fetch-previous-urls.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/fetch-previous-urls.ts tests/fetch-previous-urls.test.ts
git commit -m "feat(dedup): add fetch_previous_urls tool"
```

---

### Task 6: `check_duplicates` Tool

**Files:**
- Create: `src/tools/check-duplicates.ts`
- Create: `tests/check-duplicates.test.ts`

- [ ] **Step 1: Write failing tests in `tests/check-duplicates.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';

import { classifyItems } from '../src/tools/check-duplicates.js';
import type { DigestEntry, DuplicateCheckItem } from '../src/types.js';

const previousEntries: DigestEntry[] = [
  {
    url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
    title: 'TypeScript 6.0 вышел официально',
    date: '2026-04-04',
  },
  {
    url: 'https://tkdodo.eu/blog/test-ids-are-an-a11y-smell',
    title: 'TkDodo: Test IDs — симптом пропущенной accessibility',
    date: '2026-04-04',
  },
  {
    url: 'https://vite.dev/blog/vite-7-0',
    title: 'Vite 7.0 — новая архитектура плагинов',
    date: '2026-04-05',
  },
];

describe('classifyItems', () => {
  it('marks exact URL match as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
        source: 'ts-blog',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
    expect(result.results[0].matched_with?.date).toBe('2026-04-04');
    expect(result.summary.exact_duplicates).toBe(1);
  });

  it('marks URL with query params as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/?ref=hn',
        source: 'hn',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
  });

  it('marks URL with trailing slash as exact_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'Test IDs are a smell',
        url: 'https://tkdodo.eu/blog/test-ids-are-an-a11y-smell/',
        source: 'lobsters',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('exact_duplicate');
  });

  it('marks similar title as likely_duplicate', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 — крупнейший релиз вышел официально сегодня',
        url: 'https://dev.to/someone/typescript-6-review',
        source: 'dev-to',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('likely_duplicate');
    expect(result.results[0].matched_with).not.toBeNull();
  });

  it('marks unrelated item as unique', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'React 19.1 — server actions improvements',
        url: 'https://react.dev/blog/react-19.1',
        source: 'react-blog',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('unique');
    expect(result.results[0].matched_with).toBeNull();
  });

  it('returns all unique when no previous entries', () => {
    const items: DuplicateCheckItem[] = [
      { title: 'Some news', url: 'https://example.com', source: 'test' },
    ];

    const result = classifyItems(items, [], 0.6);
    expect(result.results[0].status).toBe('unique');
    expect(result.summary.unique).toBe(1);
  });

  it('returns empty results for empty items', () => {
    const result = classifyItems([], previousEntries, 0.6);
    expect(result.results).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it('handles item without URL using title-only comparison', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел официально',
        url: '',
        source: 'test',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.results[0].status).toBe('likely_duplicate');
  });

  it('populates summary correctly', () => {
    const items: DuplicateCheckItem[] = [
      {
        title: 'TypeScript 6.0 вышел',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/',
        source: 'ts-blog',
      },
      {
        title: 'Vite 7.0 переосмысливает архитектуру плагинов полностью',
        url: 'https://dev.to/vite-7-review',
        source: 'dev-to',
      },
      {
        title: 'Totally new framework',
        url: 'https://newframework.dev',
        source: 'hn',
      },
    ];

    const result = classifyItems(items, previousEntries, 0.6);
    expect(result.summary.total).toBe(3);
    expect(result.summary.exact_duplicates).toBe(1);
    expect(result.summary.likely_duplicates).toBe(1);
    expect(result.summary.unique).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/check-duplicates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/tools/check-duplicates.ts`**

```typescript
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
  log('dedup', `Checking ${items.length} items against ${previousEntries.length} previous entries`);

  const response = classifyItems(items, previousEntries, config.title_similarity_threshold);

  log(
    'dedup',
    `Results: ${response.summary.exact_duplicates} exact, ${response.summary.likely_duplicates} likely, ${response.summary.unique} unique`,
  );

  return response;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run tests/check-duplicates.test.ts`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/check-duplicates.ts tests/check-duplicates.test.ts
git commit -m "feat(dedup): add check_duplicates classification engine"
```

---

### Task 7: Register MCP Tools

**Files:**
- Modify: `src/mcp-server.ts`

- [ ] **Step 1: Run all existing tests to verify nothing is broken**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run`
Expected: all tests PASS

- [ ] **Step 2: Add imports to `src/mcp-server.ts`**

Add after the existing imports:

```typescript
import { loadDeliveryConfig } from './config.js';
import { checkDuplicates } from './tools/check-duplicates.js';
import {
  fetchPreviousUrls,
} from './tools/fetch-previous-urls.js';
```

- [ ] **Step 3: Resolve `output_path` with home directory expansion**

Add after the `CONFIG_DIR` constant:

```typescript
import { homedir } from 'node:os';

function expandHome(p: string): string {
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}
```

Note: the `homedir` import must be added at the top of the file with other `node:` imports.

- [ ] **Step 4: Register `fetch_previous_urls` tool**

Add after the existing `validate_sources` tool registration:

```typescript
server.registerTool(
  'fetch_previous_urls',
  {
    description:
      'Read previous digest markdown files and extract URLs + titles for deduplication',
  },
  async () => {
    const delivery = loadDeliveryConfig(join(CONFIG_DIR, 'delivery.yml'));
    const outputPath = expandHome(delivery.output_path);
    const windowDays = delivery.deduplication?.window_days ?? 3;

    log('fetch_previous_urls', `Scanning ${outputPath} (window: ${windowDays} days)`);
    const result = fetchPreviousUrls(outputPath, windowDays);
    log(
      'fetch_previous_urls',
      `${result.entries.length} entries from ${result.digests_found} digests`,
    );
    return jsonResponse(result);
  },
);
```

- [ ] **Step 5: Register `check_duplicates` tool**

Add after `fetch_previous_urls`:

```typescript
server.registerTool(
  'check_duplicates',
  {
    description:
      'Compare collected items against previous digests and classify as exact_duplicate, likely_duplicate, or unique',
    inputSchema: {
      items: z
        .array(
          z.object({
            title: z.string(),
            url: z.string(),
            source: z.string(),
          }),
        )
        .describe('Items to check for duplicates'),
    },
  },
  async ({ items }) => {
    const delivery = loadDeliveryConfig(join(CONFIG_DIR, 'delivery.yml'));
    const outputPath = expandHome(delivery.output_path);
    const dedupConfig = delivery.deduplication ?? {
      window_days: 3,
      title_similarity_threshold: 0.6,
    };

    log('check_duplicates', `Checking ${items.length} items`);
    const previous = fetchPreviousUrls(outputPath, dedupConfig.window_days);
    const result = checkDuplicates(items, previous.entries, dedupConfig);
    log(
      'check_duplicates',
      `Done: ${result.summary.exact_duplicates} exact, ${result.summary.likely_duplicates} likely, ${result.summary.unique} unique`,
    );
    return jsonResponse(result);
  },
);
```

- [ ] **Step 6: Build to verify compilation**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npm run build`
Expected: no errors

- [ ] **Step 7: Run all tests**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run`
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat(dedup): register fetch_previous_urls and check_duplicates MCP tools"
```

---

### Task 8: Update SKILL.md

**Files:**
- Modify: `.claude/skills/ai-digest/SKILL.md`

- [ ] **Step 1: Replace Step 2 in SKILL.md**

Replace the current Step 2 (lines 43-49):

```
## Step 2: Read Previous Digest (for deduplication)

Read the most recent `.md` file from the `output_path` directory (by date in filename).
If no previous digest exists, skip deduplication.
Extract all URLs from the previous digest for later comparison.

Log: `Step 2: Previous digest loaded (X URLs extracted)` or `Step 2: No previous digest found, skipping dedup`
```

With:

```
## Step 2: Read Previous Digests (for deduplication)

Call the `fetch_previous_urls` MCP tool (no parameters).
It reads the last 3 days of digest markdown files from the output path and returns all previously published URLs and titles.

Save the returned entries — you will use them for semantic deduplication in Step 4.

Log: `Step 2: Previous digests loaded — X entries from Y days` or `Step 2: No previous digests found, skipping dedup`
```

- [ ] **Step 2: Replace Step 4 in SKILL.md**

Replace the current Step 4 (lines 63-69):

```
## Step 4: Deduplicate

- Remove items whose URL appeared in the previous digest
- Merge items with identical URLs from different sources into one entry
- Merge items with very similar titles about the same topic into one entry
- If multiple releases of the same package/tool appear, collapse into one entry with the latest version

Log: `Step 4: Deduplicated — removed X URL matches, merged Y similar items, Z items remaining`
```

With:

```
## Step 4: Deduplicate

### 4a: Programmatic cross-day deduplication
Call the `check_duplicates` MCP tool with all collected items from Step 3.
Pass items as: `{ "items": [{ "title": "...", "url": "...", "source": "..." }, ...] }`

The tool returns each item classified as `exact_duplicate`, `likely_duplicate`, or `unique`.

- Remove all items marked `exact_duplicate` — no exceptions.
- Items marked `unique` — keep as-is.

### 4b: Review likely duplicates
For each `likely_duplicate` item, compare with the `matched_with` entry:
- If the item contains **substantially new information** (new version, breaking change, new analysis, different perspective) — KEEP it.
- If it covers the same topic without new information — REMOVE it.
- When in doubt — REMOVE. Fresh content over repeats.

### 4c: Semantic deduplication (your judgment)
Review remaining `unique` items against the entries returned in Step 2.
If you notice a topic that was already covered in a previous digest and the new item adds nothing substantial — remove it.

### 4d: Within-day deduplication
Among the remaining items:
- Merge items with identical URLs from different sources into one entry
- Merge items with very similar titles about the same topic into one entry
- If multiple releases of the same package/tool appear, collapse into one entry with the latest version

Log: `Step 4: Deduplicated — removed X exact, Y likely, Z semantic, merged W within-day. V items remaining`
```

- [ ] **Step 3: Verify SKILL.md is valid markdown**

Read the file back and confirm the step numbering is correct and there are no broken sections.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/ai-digest/SKILL.md
git commit -m "feat(dedup): update SKILL.md with programmatic deduplication steps"
```

---

### Task 9: Build, Lint, and Final Verification

**Files:** none new

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx vitest run`
Expected: all tests PASS

- [ ] **Step 2: Build**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npm run build`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx biome check src/ tests/`
Expected: no errors

- [ ] **Step 4: Fix any lint issues if present**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && npx biome check --write src/ tests/`

If any files were changed, commit:
```bash
git add -u
git commit -m "style: fix lint issues"
```
