# ai-digest.news — Design Spec

> Automated morning tech news digest powered by Claude Code + MCP.

## Overview

A Claude Code skill that runs daily via Apple Shortcuts, collects tech news from multiple sources through an MCP server, summarizes them with Claude (Sonnet), and delivers a personalized morning digest as a Markdown file into an Obsidian vault.

## Architecture

```
Apple Shortcuts (morning, scheduled)
  → run.sh
    → claude -p --model sonnet "Run ai-digest skill" --max-turns 30
      → Claude Code auto-starts MCP server (stdio, Docker)
      → Reads SKILL.md (orchestration prompt)
      → Reads config/sources.yml + delivery.yml
      → Reads previous digest (for deduplication)
      → Launches sub-agents in parallel:
          ├── Agent 1: RSS sources (HN, blogs, Dev.to, GitHub Trending)
          └── Agent 2: GitHub Releases (GitHub REST API)
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
| `fetch_all_rss` | _(none)_ | Fetches all RSS feeds from sources.yml in parallel. Returns `ToolResult` with merged `DigestItem[]` |
| `fetch_github_releases` | _(none)_ | Reads all repos from sources.yml, fetches latest releases. Returns `ToolResult` with `DigestItem[]` |
| `validate_sources` | _(none)_ | Validates sources.yml structure and checks all URLs are reachable. Returns validation report |

### Data Types

```typescript
// source is a string matching the `name` field in sources.yml
// e.g. "hackernews", "react-blog", "github-releases"

interface DigestItem {
  title: string;
  url: string;
  source: string;        // name from sources.yml or "github-releases"
  timestamp: string;     // ISO 8601
  description?: string;  // excerpt from RSS or release notes
  author?: string;
}

interface ToolResult {
  items: DigestItem[];
  warnings?: string[];   // e.g. "rss: feed unavailable, skipped"
}
```

### Tech Details

- **RSS**: fetch + xml parsing (`rss-parser` library)
- **GitHub Releases**: GitHub REST API via `fetch` (`https://api.github.com/repos/{owner}/{repo}/releases/latest`) — optional `GITHUB_TOKEN` for higher rate limits
- **Runtime**: Node.js 24, TypeScript, `@modelcontextprotocol/sdk`

## Configuration

### config/sources.yml

```yaml
rss:
  - name: hackernews
    url: https://hnrss.org/frontpage?points=100
    limit: 30
  - name: lobsters
    url: https://lobste.rs/rss
    limit: 20
  - name: claude-code-blog
    url: https://rss.app/feeds/Ec1x9ZalpmNXMvYj.xml
    limit: 10
  - name: react-blog
    url: https://react.dev/rss.xml
    limit: 10
  - name: chrome-blog
    url: https://developer.chrome.com/blog/feed.xml
    limit: 10
  - name: storybook-blog
    url: https://storybook.js.org/blog/rss/
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
  - name: typescript-blog
    url: https://devblogs.microsoft.com/typescript/feed/
    limit: 10
  - name: tkdodo-blog
    url: https://tkdodo.eu/blog/rss.xml
    limit: 10
  - name: kentcdodds-blog
    url: https://kentcdodds.com/blog/rss.xml
    limit: 10
  - name: simonwillison-blog
    url: https://simonwillison.net/atom/everything/
    limit: 15

github_releases:
  repos:
    - anthropics/claude-code
    - vercel/next.js
    - drizzle-team/drizzle-orm
    - storybookjs/storybook
    - vitejs/vite
    - tailwindlabs/tailwindcss
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

## 🔥 Hot
- **<catchy headline>** — <summary>. [<source>](url)

## 🎯 Релевантно твоим проектам
- **Drizzle ORM научился делать push-миграции без даунтайма** — новый API в 0.35 меняет подход к деплою. [GitHub](url)
  _Связано: твой чат-проект использует Drizzle_

## 🤖 AI / LLM
- ...

## ⚛️ Frontend
- ...

## 🔧 DevTools / Releases
- ...
```

**Key formatting rules:**
- Frontmatter with metadata for Obsidian
- "Hot" category is mandatory — the 3-5 most important news of the day
- Catchy summary headlines, not dry descriptions
- "Relevant to your projects" section — Claude matches against CLAUDE.md context
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
| GitHub API rate limit | Skip releases, warning in log |
| No source returned data | Don't create digest, error in log + notification "Failed to collect data" |
| Previous digest not found | Work without deduplication |

**Principle:** each source is independent. One fails — others work. Digest is created even if half the sources are down.

## Logging

`run.sh` redirects all Claude output to `logs/YYYY-MM-DD.md`. The MCP server logs to the same file via `logger.ts` with timestamped, tagged entries (e.g. `[mcp]`, `[fetch_rss]`, `[validation]`). SKILL.md instructs Claude to append a summary block at the end of each run with: sources attempted, items collected per source, warnings, and errors. The `logs/` directory is gitignored.

## Skills

### ai-digest (main orchestration)

`.claude/skills/ai-digest/SKILL.md` — prompt that instructs Claude through the full pipeline: validate → read config → collect → deduplicate → filter → categorize → summarize → write → notify.

### add-source

`.claude/skills/add-source/SKILL.md` — interactive command `/add-source` that asks source type (rss / github_release), collects parameters, and appends to `config/sources.yml`.

### validate-sources

`.claude/skills/validate-sources/SKILL.md` — command `/validate-sources` that calls the `validate_sources` MCP tool to check config structure and URL reachability.

### release

`.claude/skills/release/SKILL.md` — command `/release <version>` that bumps version in `package.json` and `.version`, generates changelog, creates a git tag, and publishes a GitHub Release.

## Project Structure

```
ai-digest.news/
├── .claude/
│   ├── skills/
│   │   ├── ai-digest/SKILL.md
│   │   ├── add-source/SKILL.md
│   │   ├── validate-sources/SKILL.md
│   │   └── release/SKILL.md
│   └── settings.json
├── src/
│   ├── mcp-server.ts
│   ├── config.ts
│   ├── logger.ts
│   ├── types.ts
│   └── tools/
│       ├── fetch-rss.ts
│       ├── fetch-github-releases.ts
│       └── validate-sources.ts
├── tests/
│   ├── config.test.ts
│   ├── fetch-rss.test.ts
│   ├── fetch-github-releases.test.ts
│   └── validate-sources.test.ts
├── config/
│   ├── sources.yml
│   └── delivery.yml
├── scripts/
│   ├── run.sh
│   ├── install.sh
│   └── build-archive.sh
├── .github/workflows/
│   └── ci.yml
├── docs/
│   ├── prd.md
│   └── design-spec.md
├── Dockerfile
├── .version
├── .env.example
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

## Budget and Limits

- **Model**: Sonnet (hardcoded in run.sh)
- **Max turns**: 30 (hardcoded in run.sh)
- **Subscription**: Claude Max — no `--max-budget-usd` needed
- **Typical run**: 40–60 items from 13 RSS sources + 6 GitHub repos

## Security

- `ANTHROPIC_API_KEY` from env or `~/.claude` config, never in repo
- `--allowedTools "Read" "Write" "Bash" "Agent" "mcp__ai-digest-mcp"` restricts Claude to file operations, shell commands, sub-agents, and MCP tools only
- Optional `GITHUB_TOKEN` in `.env` for higher API rate limits
- Output only to explicitly configured path
- `logs/` and any secrets are gitignored
