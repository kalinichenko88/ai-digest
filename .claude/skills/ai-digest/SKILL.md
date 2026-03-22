---
name: ai-digest
description: Run the daily AI tech news digest pipeline — collect, deduplicate, summarize, deliver
---

# AI Digest — Daily Tech News Pipeline

You are running the ai-digest pipeline. Follow these steps exactly.

## Progress Logging

After completing each step, log a progress line to `logs/YYYY-MM-DD.md` via Bash:

```bash
echo "[$(date '+%Y-%m-%d %H:%M')] [pipeline     ] <message>" >> logs/YYYY-MM-DD.md
```

This keeps the user informed in real-time (they watch the log via `tail -f`). Log at every step transition — do not batch multiple steps without logging.

## Step 0: Validate Sources

Before anything else, invoke the `/validate-sources` skill. It checks `config/sources.yml` for structural errors and broken URLs.

- If there are **structural errors** (missing keys, wrong types, invalid format) — stop and report. The pipeline cannot run with a broken config.
- If there are **broken URLs** (404, connection errors) — log the warnings but continue. The pipeline will simply get no data from those sources.

Log the validation summary to `logs/YYYY-MM-DD.md` using the format:
```
[YYYY-MM-DD HH:MM] [validation   ] Sources validation: X passed, Y failed, Z unable to verify
[YYYY-MM-DD HH:MM] [validation   ] ✗ rss: source-name — HTTP 404
```
Log each failed/unverified source as a separate line.

## Step 1: Read Configuration

Read these files:
- `config/sources.yml` — list of all sources
- `config/delivery.yml` — language, output path, notification settings
- `CLAUDE.md` — personal context (stack, projects, interests, topics to ignore)

Log: `Step 1: Config loaded (X RSS sources, Y GitHub repos)`

## Step 2: Read Previous Digest (for deduplication)

Read the most recent `.md` file from the `output_path` directory (by date in filename).
If no previous digest exists, skip deduplication.
Extract all URLs from the previous digest for later comparison.

Log: `Step 2: Previous digest loaded (X URLs extracted)` or `Step 2: No previous digest found, skipping dedup`

## Step 3: Collect Data

Launch sub-agents in parallel to collect data from all sources:

**Agent 1 — RSS feeds:** Call the `fetch_all_rss` MCP tool (no parameters). It fetches all RSS feeds in parallel internally. Collect results.

**Agent 2 — GitHub Releases:** Call the `fetch_github_releases` MCP tool (no parameters). Collect results.

Merge all DigestItem[] arrays from all agents into one list.

Log: `Step 3: Collected X RSS items (Y sources) + Z GitHub releases`

## Step 4: Deduplicate

- Remove items whose URL appeared in the previous digest
- Merge items with identical URLs from different sources into one entry
- Merge items with very similar titles about the same topic into one entry
- If multiple releases of the same package/tool appear, collapse into one entry with the latest version

Log: `Step 4: Deduplicated — removed X URL matches, merged Y similar items, Z items remaining`

## Step 5: Filter

- Read "topics to ignore" from CLAUDE.md
- Remove any items matching ignored topics (e.g. crypto, NFT, blockchain, web3)

Log: `Step 5: Filtered — removed X items (topics: Y), Z items remaining`

## Step 6: Categorize and Summarize

Read the `language` setting from delivery.yml. Generate ALL text in that language.

Assign each item to one category:
- **Hot** — the 3-5 most important, impactful, or trending news of the day across all topics. Major announcements, breaking changes, viral discussions. This category is **mandatory** — it must always be present, even if other categories are empty. Pick items that a tech professional absolutely cannot miss today.
- **Relevant to Your Projects** — items that match your stack, active projects, or interests from CLAUDE.md. Add a note explaining the connection.
- **AI / LLM** — AI models, tools, agents, LLM news
- **Frontend** — React, CSS, browser APIs, UI frameworks
- **DevTools / Releases** — developer tools, package releases, CLI tools

An item placed in **Hot** should NOT be duplicated in other categories.

For each item, write a catchy 1-2 sentence summary as the headline. Make it engaging, not dry. The headline should make the reader want to click through.

Log: `Step 6: Categorized — Hot: X, Relevant: Y, AI: Z, Frontend: W, DevTools: V`

## Step 7: Generate Markdown

Create the digest file with this structure:

```markdown
---
date: YYYY-MM-DD
type: digest
language: <language from config>
sources: <number of sources that returned data>
items: <total items after dedup>
---

# <Digest title in configured language> — <date in configured language format>

> <total items> items from <sources count> sources

## 🔥 Hot
- **<catchy headline>** — <summary>. [<source>](url)

## 🎯 <"Relevant to Your Projects" in configured language>
- **<catchy headline>** — <summary>. [<source>](url)
  _<relevance note>_

## 🤖 AI / LLM
- **<catchy headline>** — <summary>. [<source>](url)

## ⚛️ Frontend
- ...

## 🔧 DevTools / Releases
- ...
```

The **Hot** category is mandatory and must always be present. Skip any other category that has zero items.

## Step 8: Write File

Write the generated markdown to: `<output_path>/YYYY-MM-DD.md`
Use today's date for the filename.

Log: `Step 8: Written to <output_path>/YYYY-MM-DD.md`

## Step 9: Notify

If `notification` is `true` in delivery.yml, send a macOS notification:

```bash
osascript -e 'display notification "<N> items from <M> sources" with title "AI Digest Ready"'
```

If the pipeline produced zero items (all sources failed), send:

```bash
osascript -e 'display notification "All sources failed. Check logs." with title "AI Digest Failed"'
```

## Step 10: Log Summary

Print a summary of this run:
- Sources attempted and items collected per source
- Any warnings from tools
- Total items after deduplication
- Output file path
