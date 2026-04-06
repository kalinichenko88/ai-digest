# ai-digest.news — PRD

## Problem

Keeping up with tech news across multiple sources (Hacker News, dev blogs, GitHub, Twitter) is time-consuming. You have to visit each site, filter out noise, and mentally connect updates to your current work. There is no single tool that collects, filters, and summarizes tech news in a personalized way — automatically, every morning.

## Solution

An automated morning digest that runs as a Claude Code skill. It collects news from configured sources via an MCP server, summarizes them into catchy headlines grouped by category, highlights items relevant to your active projects, and saves the result as a Markdown file in your Obsidian vault.

## Target User

Developer who uses Claude Code, has a Max subscription, and wants a daily personalized tech briefing without manual effort. The project is open-source — configurable for any stack, language, and delivery preferences.

## Success Criteria

- Digest appears in Obsidian vault every morning without manual intervention
- Items are deduplicated across sources and days
- Headlines are catchy summaries, not raw titles
- Relevant items matched to user's active projects (from CLAUDE.md)
- Entire pipeline runs within Claude Max subscription limits
- New sources can be added via `/add-source` skill command

---

## User Stories

### Epic 1: Data Collection

**US-1.1: Collect news from RSS feeds**
As a user, I want the system to fetch items from configured RSS feeds so that I get news from Hacker News, tech blogs, Dev.to, and GitHub Trending without visiting each site.

Acceptance criteria:
- MCP tool `fetch_rss` accepts `name` — looks up url and limit from `sources.yml`
- Returns `DigestItem[]` with title, url, source (= name), timestamp, description
- Handles feed unavailability gracefully — returns empty array + warning
- Supports standard RSS and Atom formats

**US-1.2: Collect GitHub releases**
As a user, I want the system to check for new releases of packages I use so that I don't miss important updates to my dependencies.

Acceptance criteria:
- MCP tool `fetch_github_releases` takes no parameters — reads repos list from `sources.yml`
- Uses GitHub REST API via `fetch` (no token needed for public repos)
- Returns `DigestItem[]` where title = release name, description = release notes excerpt, url = release page URL
- Handles rate limiting gracefully — skip + warning

**US-1.3: Parallel collection**
As a user, I want data collection to happen in parallel so that the digest is ready faster.

Acceptance criteria:
- Claude launches sub-agents for independent source groups
- RSS sources and GitHub releases are collected concurrently
- Failure of one group does not block others

### Epic 2: Processing

**US-2.1: Deduplication across sources**
As a user, I want duplicate items removed so that I don't see the same news from Hacker News and Dev.to.

Acceptance criteria:
- Same URL from different sources → merge into one entry
- Very similar titles about the same topic → merge into one entry
- Multiple releases of the same package in one day → collapse into one entry with latest version

**US-2.2: Deduplication across days**
As a user, I want items from recent digests filtered out so that I only see new content.

Acceptance criteria:
- MCP tool `fetch_previous_urls` reads digest files from the last N days (configurable `window_days`, default 3)
- MCP tool `check_duplicates` classifies each incoming item as `exact_duplicate`, `likely_duplicate`, or `unique`
- Exact duplicates (normalized URL match) are removed automatically
- Likely duplicates (title similarity above threshold) are reviewed by Claude — kept only if they add new information (new version, breaking change, new analysis)
- URL normalization: lowercase, strip query params / fragments / trailing slashes
- Title normalization: lowercase, strip punctuation, collapse whitespace
- Title similarity: word-overlap score (intersection / min word count)
- If no previous digests exist, skip dedup without error

**US-2.3: Categorization**
As a user, I want items grouped by category so that I can quickly scan the areas I care about.

Acceptance criteria:
- Categories: Hot, Relevant to Your Projects, AI/LLM, Frontend, DevTools/Releases
- Claude assigns categories based on content
- "Relevant to Your Projects" is populated by matching items against CLAUDE.md context

**US-2.4: Summarization**
As a user, I want each item to have a catchy one-line summary so that I can decide what to read without clicking through.

Acceptance criteria:
- Headlines are engaging summaries, not raw source titles
- 1-2 sentences max per item
- Relevant items include a note explaining the connection to user's project
- Language matches `language` config setting

### Epic 3: Delivery

**US-3.1: Save digest as Markdown**
As a user, I want the digest saved as a Markdown file in my Obsidian vault so that it integrates with my knowledge management workflow.

Acceptance criteria:
- File written to configured `output_path`
- Filename format: `YYYY-MM-DD.md`
- Includes YAML frontmatter: date, type, language, sources count, items count
- File is valid Markdown, renders correctly in Obsidian

**US-3.2: macOS notification**
As a user, I want a macOS notification when the digest is ready so that I know it's available without checking manually.

Acceptance criteria:
- Notification sent via `osascript display notification`
- Shows brief summary: "AI Digest ready — 42 items from 8 sources"
- Sent only when digest is successfully created
- If digest creation failed, notification says "Failed to collect data"

**US-3.3: Configurable language**
As a user, I want to set the digest language in config so that I get the digest in my preferred language.

Acceptance criteria:
- `language` field in `delivery.yml`
- Claude generates all summaries and category headers in the configured language
- Default: `en`

### Epic 4: Configuration

**US-4.1: Source configuration**
As a user, I want to configure my news sources in a YAML file so that I can customize what the digest covers.

Acceptance criteria:
- `config/sources.yml` with sections: rss, github_releases
- Each RSS source has name, url, limit
- GitHub releases has a list of repos
- Changes take effect on next run without any rebuild

**US-4.2: Delivery configuration**
As a user, I want to configure output settings in a YAML file so that I can customize where and how the digest is delivered.

Acceptance criteria:
- `config/delivery.yml` with: language, output_path, notification, deduplication
- `deduplication` section has: `window_days` (default 3), `title_similarity_threshold` (default 0.6)
- All fields have sensible defaults

**US-4.3: Add source via skill command**
As a user, I want to add a new source by running `/add-source` in Claude Code so that I don't have to edit YAML manually.

Acceptance criteria:
- Asks source type: rss or github_release
- Collects required parameters interactively
- Appends to the correct section in `sources.yml`
- Confirms the addition

**US-4.4: Personal context**
As a user, I want to provide my project context in CLAUDE.md so that the digest highlights items relevant to my current work.

Acceptance criteria:
- CLAUDE.md contains: stack, active projects, interests, topics to ignore
- Claude reads it during processing to populate "Relevant to Your Projects" section
- Items matching "topics to ignore" (e.g. crypto, NFT) are excluded from the digest entirely
- No special format required — free-form Markdown

### Epic 5: Scheduling and Execution

**US-5.1: Apple Shortcuts trigger**
As a user, I want to trigger the digest from Apple Shortcuts so that it runs automatically every morning.

Acceptance criteria:
- `scripts/run.sh` is the single entry point
- Script runs `claude -p` with model and max-turns hardcoded
- Redirects Claude output to `logs/YYYY-MM-DD.md`
- Exit code 0 on success, non-zero on failure
- README contains Apple Shortcuts setup instructions

**US-5.2: Manual run**
As a user, I want to run the digest manually via `./scripts/run.sh` so that I can test or get an on-demand digest.

Acceptance criteria:
- Same script, same behavior as scheduled run
- Works from project root directory

### Epic 6: Error Handling and Logging

**US-6.1: Graceful degradation**
As a user, I want the digest to be created even if some sources fail so that a single broken source doesn't ruin my morning briefing.

Acceptance criteria:
- Each source is independent
- Failed sources are skipped with a warning
- Digest is created with whatever data was collected
- Only if ALL sources fail — no digest, error notification instead

**US-6.2: Logging**
As a user, I want execution logs so that I can debug issues when something goes wrong.

Acceptance criteria:
- Logs written to `logs/YYYY-MM-DD.log`
- Include: sources attempted, items collected per source, warnings, errors
- `logs/` directory is gitignored

### Epic 7: Setup

**US-7.1: First-time setup**
As a user, I want clear setup instructions so that I can get the digest running on my machine.

Acceptance criteria:
- README covers: clone, Docker setup, configure `sources.yml` and `delivery.yml`, set up CLAUDE.md
- README covers Apple Shortcuts setup with step-by-step instructions
- `install.sh` provides interactive first-time setup
- `run.sh update` supports self-updating to latest release
- `npm run build` compiles the MCP server without errors
