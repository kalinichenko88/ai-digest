# ai-digest.news — Design Spec

> Automated morning tech news digest powered by Claude Code + MCP.

## Overview

A Claude Code skill that runs daily via Apple Shortcuts, collects tech news from multiple sources through an MCP server, summarizes them with Claude (Sonnet), and delivers a personalized morning digest as a Markdown file into an Obsidian vault.

## Architecture

```
Apple Shortcuts (morning, scheduled)
  → run.sh
    → claude -p --model sonnet "Run ai-digest skill" --max-turns 30
      → Claude Code auto-starts MCP server (stdio)
      → Reads SKILL.md (orchestration prompt)
      → Reads config/sources.yml + delivery.yml
      → Reads previous digest (for deduplication)
      → Launches sub-agents in parallel:
          ├── Agent 1: RSS sources (HN, blogs, Dev.to, GitHub Trending)
          ├── Agent 2: GitHub Releases (GitHub REST API)
          └── Agent 3: Twitter/X (Playwright, live browser session)
      → Each agent returns DigestItem[]
      → Claude merges, deduplicates, categorizes
      → Generates Markdown with frontmatter
      → Writes to output_path/YYYY-MM-DD.md
      → macOS notification
      → MCP server auto-stops
```

## MCP Server

Single MCP server `ai-digest-mcp`, stdio transport. Claude Code manages its lifecycle automatically via `.claude/settings.json`.

### Tools

All tools read their configuration from `config/sources.yml` automatically.

| Tool | Parameters | Returns |
|---|---|---|
| `fetch_rss` | `name: string` | Looks up source by name in sources.yml, fetches its url with configured limit. Returns `ToolResult` with `DigestItem[]` |
| `fetch_github_releases` | _(none)_ | Reads all repos from sources.yml, fetches latest releases. Returns `ToolResult` with `DigestItem[]` |
| `fetch_twitter` | `since?: string` (ISO 8601, default: last 24h) | Reads accounts from sources.yml, fetches recent posts. Returns `ToolResult` with `DigestItem[]`. Empty array + warning if logged out |

### Data Types

```typescript
// source is a string matching the `name` field in sources.yml
// e.g. "hackernews", "react-blog", "github-releases", "twitter"

interface DigestItem {
  title: string;
  url: string;
  source: string;        // name from sources.yml or "github-releases" / "twitter"
  timestamp: string;     // ISO 8601
  description?: string;  // excerpt from RSS or tweet text
  author?: string;
}

interface ToolResult {
  items: DigestItem[];
  warnings?: string[];   // e.g. "twitter: not logged in, skipped"
}
```

### Tech Details

- **RSS**: fetch + xml parsing (`rss-parser` library)
- **GitHub Releases**: GitHub REST API via `fetch` (`https://api.github.com/repos/{owner}/{repo}/releases/latest`) — no token needed for public repos
- **Twitter**: Playwright connects to existing Chrome via CDP (port 9222). User must launch Chrome with `--remote-debugging-port=9222` or have it configured in Chrome flags. Invalid session → graceful skip
- **Runtime**: Node.js 22, TypeScript, `@modelcontextprotocol/sdk`

## Configuration

### config/sources.yml

```yaml
rss:
  - name: hackernews
    url: https://hnrss.org/frontpage?points=100
    limit: 30
  - name: claude-code-blog
    url: https://www.anthropic.com/blog/rss.xml
    limit: 10
  - name: react-blog
    url: https://react.dev/blog/rss.xml
    limit: 10
  - name: chrome-blog
    url: https://developer.chrome.com/blog/feed.xml
    limit: 10
  - name: storybook-blog
    url: https://storybook.js.org/blog/rss.xml
    limit: 10
  - name: devto
    url: https://dev.to/feed
    limit: 20
  - name: github-trending-typescript
    url: https://mshibanami.github.io/GitHubTrendingRSS/daily/typescript.xml
    limit: 15
  - name: github-trending-python
    url: https://mshibanami.github.io/GitHubTrendingRSS/daily/python.xml
    limit: 15

github_releases:
  repos:
    - anthropics/claude-code
    - vercel/next.js
    - drizzle-team/drizzle-orm
    - storybookjs/storybook
    - vitejs/vite
    - tailwindlabs/tailwindcss

twitter:
  accounts:
    - AnthropicAI
    - claudeai
    - OpenAI
    - bcherny
    - alexalbert__
    - karpathy
    - swyx
    - geoffreyhuntley
    - dan_abramov
    - kentcdodds
    - rauchg
    - leeerob
    - wesbos
    - mattpocockuk
```

### config/delivery.yml

```yaml
language: ru
output_path: /Users/ivan_kalinichenko/Personal/0_Journal/Tech
notification: true
```

## Digest Output Format

```markdown
---
date: 2026-03-19
type: digest
language: ru
sources: 8
items: 42
---

# AI Дайджест — 19 марта 2026

> 42 материала из 8 источников

## 🎯 Релевантно твоим проектам
- **Drizzle ORM научился делать push-миграции без даунтайма** — новый API в 0.35 меняет подход к деплою. [GitHub](url)
  _Связано: твой чат-проект использует Drizzle_

## 🤖 AI / LLM
- ...

## ⚛️ Frontend
- ...

## 🔧 DevTools / Releases
- ...

## 🐦 Twitter-обзор
- ...
```

**Key formatting rules:**
- Frontmatter with metadata for Obsidian
- Catchy summary headlines, not dry descriptions
- "Relevant to your projects" section — Claude matches against CLAUDE.md context
- Twitter review — separate category with brief thread summaries
- Language determined by `language` config value

## Deduplication and History

- Before generating, Claude reads the latest digest from `output_path` by date in filename
- URL match → remove duplicate
- Similar title (same release, same news from different sources) → merge into one entry
- Multiple releases of same package in one day → collapse into one entry (latest version)
- No database. Claude reads the markdown file and decides what's a duplicate via SKILL.md instructions
- If no previous digest found → work without dedup

## Error Handling

| Situation | Behavior |
|---|---|
| RSS feed unavailable | Skip, warning in log |
| Twitter logged out | Skip all Twitter, warning in log |
| Playwright can't connect to Chrome | Skip Twitter, warning in log |
| GitHub API rate limit | Skip releases, warning in log |
| No source returned data | Don't create digest, error in log + notification "Failed to collect data" |
| Previous digest not found | Work without deduplication |

**Principle:** each source is independent. One fails — others work. Digest is created even if half the sources are down.

## Logging

`run.sh` redirects all Claude output to `logs/YYYY-MM-DD.log`. Additionally, SKILL.md instructs Claude to append a summary block at the end of each run with: sources attempted, items collected per source, warnings, and errors. The `logs/` directory is gitignored.

## Skills

### ai-digest (main orchestration)

`.claude/skills/ai-digest/SKILL.md` — prompt that instructs Claude through the full pipeline: read config → launch sub-agents → collect → deduplicate → categorize → summarize → write → notify.

### add-source

`.claude/skills/add-source/SKILL.md` — interactive command `/add-source` that asks source type (rss / github_release / twitter), collects parameters, and appends to `config/sources.yml`.

## Project Structure

```
ai-digest.news/
├── .claude/
│   ├── skills/
│   │   ├── ai-digest/
│   │   │   └── SKILL.md
│   │   └── add-source/
│   │       └── SKILL.md
│   └── settings.json
├── src/
│   ├── mcp-server.ts
│   ├── config.ts
│   ├── tools/
│   │   ├── fetch-rss.ts
│   │   ├── fetch-github-releases.ts
│   │   └── fetch-twitter.ts
│   └── types.ts
├── config/
│   ├── sources.yml
│   └── delivery.yml
├── scripts/
│   └── run.sh
├── logs/
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── README.md
```

## Budget and Limits

- **Model**: Sonnet (hardcoded in run.sh)
- **Max turns**: 30 (hardcoded in run.sh)
- **Subscription**: Claude Max — no `--max-budget-usd` needed
- **Typical run**: 40–60 items from 8 sources

## Security

- `ANTHROPIC_API_KEY` from env or `~/.claude` config, never in repo
- `--allowedTools "Read" "Write" "Bash" "mcp__ai-digest-mcp"` restricts Claude to file operations, shell commands, and MCP tools only
- Twitter session relies on user's existing browser — no credentials stored
- Output only to explicitly configured path
- `logs/` and any secrets are gitignored
