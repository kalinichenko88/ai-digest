# Cross-Day Deduplication for ai-digest

**Date:** 2026-04-06
**Status:** Approved

## Problem

The daily digest pipeline repeats the same news across days. TypeScript 6.0 appeared 9 times over 16 days, TkDodo articles repeated 5-7 times each. The current design delegates deduplication entirely to Claude via SKILL.md instructions, which is unreliable for mechanical URL/title matching.

## Solution

Two-layer deduplication: programmatic MCP tools handle exact and fuzzy matching, Claude handles semantic judgment on borderline cases.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Window depth | 3 days | Catches most RSS cross-source repeats |
| Storage | Parse markdown on the fly | No extra files, no database |
| Tools | Two MCP tools | Separation of concerns |
| Matching | Normalized URL + title similarity | Covers exact, near-exact, and paraphrased duplicates |
| LLM role | Review `likely_duplicate` items | Keep only if substantially new information |
| Output format | 3 categories | `exact_duplicate`, `likely_duplicate`, `unique` |
| Pipeline integration | Two-phase (Step 2 + Step 4) | Claude sees both raw history and programmatic markup |

## Architecture

### MCP Tool 1: `fetch_previous_urls`

Reads markdown digests from `output_path` for the last N days, extracts URLs and titles.

**Parameters:** none (reads `output_path` and `window_days` from `delivery.yml`)

**Logic:**
1. Read `delivery.yml` -> `output_path`, `deduplication.window_days`
2. Scan `YYYY-MM-DD.md` files, take last 3 days (from yesterday, skip today)
3. Parse each file:
   - URLs: all `[text](url)` markdown links
   - Titles: bold text from `- **title**` pattern (list item openers)
4. Normalize URLs: lowercase, strip trailing slash, strip query params (utm, ref, etc.)
5. Normalize titles: lowercase, strip punctuation

**Output:**
```json
{
  "window_days": 3,
  "digests_found": 2,
  "dates": ["2026-04-05", "2026-04-04"],
  "entries": [
    {
      "url": "https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/",
      "title": "typescript 6.0 вышел официально",
      "date": "2026-04-05"
    }
  ],
  "urls": ["https://..."]
}
```

### MCP Tool 2: `check_duplicates`

Takes collected items, compares against previous digests, returns classified list.

**Parameters:**
```json
{
  "items": [
    {
      "title": "TypeScript 6.0 вышел",
      "url": "https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/",
      "source": "typescript-blog"
    }
  ]
}
```

**Matching logic (priority order):**

1. **Normalized URL match** -> `exact_duplicate`
   - Normalize: lowercase, strip trailing slash, strip ALL query params, strip fragment
   - This single step catches both exact URLs and domain+path variants (e.g. same article with `?ref=hn` or `?utm_source=...`)
   - Match = definite duplicate

2. **Title similarity** -> `likely_duplicate`
   - Normalize: lowercase, strip punctuation, split into words
   - Word overlap >= 60% of the shorter title
   - Example: "TypeScript 6.0 вышел официально" vs "TypeScript 6.0 RC — до финального релиза" -> `likely_duplicate`

**No match** -> `unique`

**Output:**
```json
{
  "results": [
    {
      "title": "TypeScript 6.0 вышел",
      "url": "https://...",
      "source": "typescript-blog",
      "status": "exact_duplicate",
      "matched_with": {
        "title": "TypeScript 6.0 вышел официально",
        "url": "https://...",
        "date": "2026-04-05"
      }
    },
    {
      "title": "Новый фреймворк X",
      "url": "https://...",
      "source": "hn-top",
      "status": "unique",
      "matched_with": null
    }
  ],
  "summary": {
    "total": 25,
    "exact_duplicates": 4,
    "likely_duplicates": 3,
    "unique": 18
  }
}
```

**Edge cases:**
- No previous digests -> all items `unique`
- Item without URL -> title-only comparison
- Empty items list -> empty result

## Configuration

New section in `config/delivery.yml`:

```yaml
deduplication:
  window_days: 3
  title_similarity_threshold: 0.6
```

Two tunable parameters extracted from hardcode. No changes to `sources.yml`.

## SKILL.md Changes

### Step 2 (updated)

```
## Step 2: Read Previous Digests (for deduplication)

Call the `fetch_previous_urls` tool.
Save the returned entries for context — you will use them
for semantic deduplication in Step 4.

Log: `Step 2: Previous digests loaded — X entries from Y days`
```

### Step 4 (updated)

```
## Step 4: Deduplicate

### 4a: Programmatic deduplication
Call `check_duplicates` with all collected items from Step 3.

- Remove all items marked `exact_duplicate` — no exceptions
- Items marked `unique` — keep as-is

### 4b: Review likely duplicates
For each `likely_duplicate` item, compare with `matched_with` entry:
- If the item contains substantially new information
  (new version, breaking change, new analysis, different perspective) — KEEP
- If it's the same topic without new information — REMOVE
- When in doubt — REMOVE. The user prefers fresh content over repeats.

### 4c: Semantic deduplication (your judgment)
Review remaining `unique` items against the entries from Step 2.
If you notice a topic that was already covered in a previous digest
and the new item adds nothing substantial — remove it.

Log: `Step 4: Deduplicated — removed X exact, Y likely, Z semantic. W items remaining`
```

### Within-day deduplication (existing, kept)

Same-day URL merging and release collapsing remain in Step 4 as before — they apply to `unique` items after cross-day filtering.

## New Types

```typescript
// src/types.ts additions

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

## New Files

| File | Purpose |
|------|---------|
| `src/tools/fetch-previous-urls.ts` | Markdown parser + URL/title extractor |
| `src/tools/check-duplicates.ts` | Matching engine (URL, domain+path, title similarity) |
| `src/utils/normalize.ts` | URL and title normalization functions |
| `src/utils/similarity.ts` | Title word-overlap similarity function |
| `tests/normalize.test.ts` | URL/title normalization tests |
| `tests/similarity.test.ts` | Title similarity tests |
| `tests/fetch-previous-urls.test.ts` | Markdown parsing, window logic tests |
| `tests/check-duplicates.test.ts` | Classification tests |
| `tests/fixtures/` | 2-3 sample digest markdown files |

## Testing

**Unit tests (Vitest):**

1. **URL normalization** — trailing slash, utm params, case, fragments
2. **Title normalization and similarity** — matching, non-matching, empty strings, cyrillic
3. **Markdown parsing** — URL extraction from `[text](url)`, title extraction from `- **title**`, broken markdown
4. **check_duplicates classification** — exact URL, domain+path, similar title, no match
5. **fetch_previous_urls** — correct window, skip today, no files found

**Test fixtures:** 2-3 markdown files mimicking real digests with known URLs and titles.

## What's NOT Changing

- `sources.yml` structure
- Existing MCP tools (`fetch_rss`, `fetch_all_rss`, `fetch_github_releases`, `validate_sources`)
- Digest markdown format
- Docker setup
- Steps 0, 1, 3, 5-10 in SKILL.md (except minor log format updates)
