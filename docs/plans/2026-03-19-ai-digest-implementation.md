# ai-digest.news Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server with 3 collection tools and Claude Code skills that orchestrate a daily personalized tech news digest pipeline.

**Architecture:** MCP server (stdio, TypeScript) provides `fetch_rss`, `fetch_github_releases`, `fetch_twitter` tools. Claude Code skill SKILL.md orchestrates the full pipeline: read config → launch sub-agents → collect → deduplicate → categorize → summarize → write markdown → notify. Entry point is `run.sh` called from Apple Shortcuts.

**Tech Stack:** Node.js 22, TypeScript, `@modelcontextprotocol/sdk`, `rss-parser`, `playwright`, `yaml`, `vitest`

**Spec:** `docs/design-spec.md`, `docs/prd.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies, scripts (`build`, `dev`, `test`) |
| `tsconfig.json` | TypeScript config, ESM output |
| `.gitignore` | Ignore logs/, node_modules/, dist/ |
| `src/types.ts` | `DigestItem`, `ToolResult`, config type interfaces |
| `src/config.ts` | Load and parse sources.yml and delivery.yml |
| `src/tools/fetch-rss.ts` | `fetch_rss` MCP tool — RSS/Atom fetching |
| `src/tools/fetch-github-releases.ts` | `fetch_github_releases` MCP tool — GitHub REST API |
| `src/tools/fetch-twitter.ts` | `fetch_twitter` MCP tool — Playwright CDP |
| `src/mcp-server.ts` | MCP server entry point, registers all tools |
| `config/sources.yml` | RSS feeds, GitHub repos, Twitter accounts |
| `config/delivery.yml` | Language, output path, notification toggle |
| `.claude/settings.json` | MCP server registration for Claude Code |
| `.claude/skills/ai-digest/SKILL.md` | Main orchestration prompt |
| `.claude/skills/add-source/SKILL.md` | `/add-source` interactive skill |
| `scripts/run.sh` | Shell entry point for Apple Shortcuts |
| `CLAUDE.md` | Personal context for personalization |
| `README.md` | Setup and usage instructions |
| `tests/config.test.ts` | Config loader tests |
| `tests/fetch-rss.test.ts` | RSS tool tests |
| `tests/fetch-github-releases.test.ts` | GitHub releases tool tests |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "ai-digest-mcp",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/mcp-server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "rss-parser": "^3.13.0",
    "yaml": "^2.7.0",
    "playwright": "^1.50.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
logs/
.env
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated, no errors

- [ ] **Step 5: Verify TypeScript compiles (empty project)**

Run: `mkdir -p src && echo 'export {}' > src/mcp-server.ts && npx tsc --noEmit`
Expected: No errors. Remove placeholder after.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Types and Config Loader

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Create src/types.ts**

```typescript
export interface DigestItem {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  description?: string;
  author?: string;
}

export interface ToolResult {
  items: DigestItem[];
  warnings?: string[];
}

export interface RssSource {
  name: string;
  url: string;
  limit: number;
}

export interface SourcesConfig {
  rss: RssSource[];
  github_releases: {
    repos: string[];
  };
  twitter: {
    accounts: string[];
  };
}

export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  author: { login: string } | null;
}

export interface DeliveryConfig {
  language: string;
  output_path: string;
  notification: boolean;
}
```

- [ ] **Step 2: Write failing test for config loader**

Create `tests/config.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { loadSourcesConfig, loadDeliveryConfig } from "../src/config.js";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dirname, "fixtures", "config");

describe("loadSourcesConfig", () => {
  it("parses sources.yml correctly", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(
      join(TEST_DIR, "sources.yml"),
      `rss:
  - name: hackernews
    url: https://hnrss.org/frontpage
    limit: 30
github_releases:
  repos:
    - vercel/next.js
twitter:
  accounts:
    - AnthropicAI
`
    );

    const config = loadSourcesConfig(join(TEST_DIR, "sources.yml"));
    expect(config.rss).toHaveLength(1);
    expect(config.rss[0].name).toBe("hackernews");
    expect(config.rss[0].url).toBe("https://hnrss.org/frontpage");
    expect(config.rss[0].limit).toBe(30);
    expect(config.github_releases.repos).toEqual(["vercel/next.js"]);
    expect(config.twitter.accounts).toEqual(["AnthropicAI"]);

    rmSync(TEST_DIR, { recursive: true });
  });

  it("throws on missing file", () => {
    expect(() => loadSourcesConfig("/nonexistent/path.yml")).toThrow();
  });
});

describe("loadDeliveryConfig", () => {
  it("parses delivery.yml with defaults", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(
      join(TEST_DIR, "delivery.yml"),
      `language: ru
output_path: /tmp/test-digests
`
    );

    const config = loadDeliveryConfig(join(TEST_DIR, "delivery.yml"));
    expect(config.language).toBe("ru");
    expect(config.output_path).toBe("/tmp/test-digests");
    expect(config.notification).toBe(true);

    rmSync(TEST_DIR, { recursive: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `loadSourcesConfig` not found

- [ ] **Step 4: Implement config loader**

Create `src/config.ts`:

```typescript
import { readFileSync } from "fs";
import { parse } from "yaml";
import type { SourcesConfig, DeliveryConfig } from "./types.js";

export function loadSourcesConfig(path: string): SourcesConfig {
  const raw = readFileSync(path, "utf-8");
  return parse(raw) as SourcesConfig;
}

export function loadDeliveryConfig(path: string): DeliveryConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw);
  return {
    language: parsed.language ?? "en",
    output_path: parsed.output_path ?? "~/digests",
    notification: parsed.notification ?? true,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts tests/config.test.ts
git commit -m "feat: add types and config loader with tests"
```

---

### Task 3: fetch_rss Tool

**Files:**
- Create: `src/tools/fetch-rss.ts`
- Create: `tests/fetch-rss.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/fetch-rss.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { fetchRss } from "../src/tools/fetch-rss.js";

// Mock rss-parser
vi.mock("rss-parser", () => {
  return {
    default: class {
      async parseURL() {
        return {
          items: [
            {
              title: "Test Article",
              link: "https://example.com/article",
              pubDate: "2026-03-19T08:00:00Z",
              contentSnippet: "A test article description",
              creator: "testauthor",
            },
            {
              title: "Second Article",
              link: "https://example.com/article2",
              pubDate: "2026-03-19T07:00:00Z",
              contentSnippet: "Another description",
            },
          ],
        };
      }
    },
  };
});

describe("fetchRss", () => {
  it("returns DigestItem[] from RSS feed", async () => {
    const result = await fetchRss(
      "test-source",
      "https://example.com/feed.xml",
      10
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      title: "Test Article",
      url: "https://example.com/article",
      source: "test-source",
      timestamp: "2026-03-19T08:00:00Z",
      description: "A test article description",
      author: "testauthor",
    });
    expect(result.warnings).toBeUndefined();
  });

  it("respects limit parameter", async () => {
    const result = await fetchRss(
      "test-source",
      "https://example.com/feed.xml",
      1
    );
    expect(result.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch-rss.test.ts`
Expected: FAIL — `fetchRss` not found

- [ ] **Step 3: Implement fetch-rss**

Create `src/tools/fetch-rss.ts`:

```typescript
import Parser from "rss-parser";
import type { ToolResult, DigestItem } from "../types.js";

const parser = new Parser();

export async function fetchRss(
  name: string,
  url: string,
  limit: number
): Promise<ToolResult> {
  try {
    const feed = await parser.parseURL(url);
    const items: DigestItem[] = feed.items.slice(0, limit).map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      source: name,
      timestamp: item.pubDate ?? new Date().toISOString(),
      description: item.contentSnippet ?? item.content ?? undefined,
      author: item.creator ?? item.author ?? undefined,
    }));
    return { items };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown RSS error";
    return { items: [], warnings: [`${name}: ${message}`] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch-rss.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/fetch-rss.ts tests/fetch-rss.test.ts
git commit -m "feat: add fetch_rss tool with tests"
```

---

### Task 4: fetch_github_releases Tool

**Files:**
- Create: `src/tools/fetch-github-releases.ts`
- Create: `tests/fetch-github-releases.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/fetch-github-releases.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchGithubReleases } from "../src/tools/fetch-github-releases.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchGithubReleases", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns DigestItem[] from GitHub API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v7.1.0",
        name: "Vite 7.1.0",
        body: "## What's New\n\nFaster HMR for CSS modules",
        html_url: "https://github.com/vitejs/vite/releases/tag/v7.1.0",
        published_at: "2026-03-19T10:00:00Z",
        author: { login: "yyx990803" },
      }),
    });

    const result = await fetchGithubReleases(["vitejs/vite"]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      title: "Vite 7.1.0",
      url: "https://github.com/vitejs/vite/releases/tag/v7.1.0",
      source: "github-releases",
      timestamp: "2026-03-19T10:00:00Z",
      description: "## What's New\n\nFaster HMR for CSS modules",
      author: "yyx990803",
    });
  });

  it("handles 404 gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchGithubReleases(["nonexistent/repo"]);
    expect(result.items).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings![0]).toContain("nonexistent/repo");
  });

  it("fetches multiple repos", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: "v1.0.0",
          name: "Release 1",
          body: "Notes 1",
          html_url: "https://github.com/a/b/releases/tag/v1.0.0",
          published_at: "2026-03-19T10:00:00Z",
          author: { login: "dev1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tag_name: "v2.0.0",
          name: "Release 2",
          body: "Notes 2",
          html_url: "https://github.com/c/d/releases/tag/v2.0.0",
          published_at: "2026-03-19T11:00:00Z",
          author: { login: "dev2" },
        }),
      });

    const result = await fetchGithubReleases(["a/b", "c/d"]);
    expect(result.items).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch-github-releases.test.ts`
Expected: FAIL — `fetchGithubReleases` not found

- [ ] **Step 3: Implement fetch-github-releases**

Create `src/tools/fetch-github-releases.ts`:

```typescript
import type { ToolResult, DigestItem, GitHubRelease } from "../types.js";

const GITHUB_API = "https://api.github.com/repos";

export async function fetchGithubReleases(
  repos: string[]
): Promise<ToolResult> {
  const items: DigestItem[] = [];
  const warnings: string[] = [];

  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const response = await fetch(`${GITHUB_API}/${repo}/releases/latest`, {
        headers: { Accept: "application/vnd.github.v3+json" },
      });

      if (!response.ok) {
        warnings.push(
          `${repo}: GitHub API returned ${response.status}`
        );
        return null;
      }

      const release = (await response.json()) as GitHubRelease;
      return {
        title: release.name || release.tag_name,
        url: release.html_url,
        source: "github-releases",
        timestamp: release.published_at,
        description: release.body ?? undefined,
        author: release.author?.login ?? undefined,
      } as DigestItem;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      items.push(result.value);
    } else if (result.status === "rejected") {
      warnings.push(`GitHub API error: ${result.reason}`);
    }
  }

  return { items, warnings: warnings.length > 0 ? warnings : undefined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch-github-releases.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/fetch-github-releases.ts tests/fetch-github-releases.test.ts
git commit -m "feat: add fetch_github_releases tool with tests"
```

---

### Task 5: fetch_twitter Tool

**Files:**
- Create: `src/tools/fetch-twitter.ts`

Note: No unit tests for this tool — Playwright CDP requires a real browser. Testing happens in Task 8 (manual integration test).

- [ ] **Step 1: Implement fetch-twitter**

Create `src/tools/fetch-twitter.ts`:

```typescript
import { chromium } from "playwright";
import type { ToolResult, DigestItem } from "../types.js";

const CDP_URL = "http://127.0.0.1:9222";

export async function fetchTwitter(
  accounts: string[],
  since?: string
): Promise<ToolResult> {
  const sinceDate = since
    ? new Date(since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch {
    return {
      items: [],
      warnings: [
        "twitter: could not connect to Chrome CDP on port 9222. Skipping.",
      ],
    };
  }

  const items: DigestItem[] = [];
  const warnings: string[] = [];

  try {
    const context = browser.contexts()[0];
    if (!context) {
      return {
        items: [],
        warnings: ["twitter: no browser context found. Skipping."],
      };
    }

    const page = await context.newPage();

    for (const account of accounts) {
      try {
        await page.goto(`https://x.com/${account}`, {
          waitUntil: "networkidle",
          timeout: 15000,
        });

        // Check if logged in
        const loginPrompt = await page
          .locator('[data-testid="loginButton"]')
          .count();
        if (loginPrompt > 0) {
          warnings.push("twitter: not logged in. Skipping all accounts.");
          break;
        }

        // Extract tweets
        const tweets = await page
          .locator('article[data-testid="tweet"]')
          .all();

        for (const tweet of tweets.slice(0, 10)) {
          try {
            const textEl = await tweet
              .locator('[data-testid="tweetText"]')
              .first();
            const text = (await textEl.textContent()) ?? "";
            const timeEl = await tweet.locator("time").first();
            const datetime = await timeEl.getAttribute("datetime");
            const linkEl = await tweet
              .locator('a[href*="/status/"]')
              .first();
            const href = await linkEl.getAttribute("href");

            if (datetime && new Date(datetime) < sinceDate) continue;

            items.push({
              title: text.length > 100 ? text.slice(0, 100) + "..." : text,
              url: href ? `https://x.com${href}` : `https://x.com/${account}`,
              source: "twitter",
              timestamp: datetime ?? new Date().toISOString(),
              description: text,
              author: account,
            });
          } catch {
            // Skip individual tweet parse errors
          }
        }
      } catch {
        warnings.push(`twitter: failed to load @${account}. Skipping.`);
      }
    }

    await page.close();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Twitter error";
    warnings.push(`twitter: ${message}`);
  }

  return { items, warnings: warnings.length > 0 ? warnings : undefined };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/tools/fetch-twitter.ts
git commit -m "feat: add fetch_twitter tool with Playwright CDP"
```

---

### Task 6: MCP Server

**Files:**
- Create: `src/mcp-server.ts`

- [ ] **Step 1: Implement MCP server**

Create `src/mcp-server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadSourcesConfig } from "./config.js";
import { fetchRss } from "./tools/fetch-rss.js";
import { fetchGithubReleases } from "./tools/fetch-github-releases.js";
import { fetchTwitter } from "./tools/fetch-twitter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "config");

const server = new McpServer({
  name: "ai-digest-mcp",
  version: "0.1.0",
});

server.tool(
  "fetch_rss",
  "Fetch items from an RSS feed configured in sources.yml by name",
  { name: z.string().describe("Source name from sources.yml rss section") },
  async ({ name }) => {
    const config = loadSourcesConfig(join(CONFIG_DIR, "sources.yml"));
    const source = config.rss.find((s) => s.name === name);
    if (!source) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              items: [],
              warnings: [`RSS source "${name}" not found in sources.yml`],
            }),
          },
        ],
      };
    }
    const result = await fetchRss(source.name, source.url, source.limit);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "fetch_github_releases",
  "Fetch latest releases for all repos configured in sources.yml",
  {},
  async () => {
    const config = loadSourcesConfig(join(CONFIG_DIR, "sources.yml"));
    const result = await fetchGithubReleases(config.github_releases.repos);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "fetch_twitter",
  "Fetch recent tweets from accounts configured in sources.yml via Chrome CDP",
  {
    since: z
      .string()
      .optional()
      .describe("ISO 8601 date. Default: last 24 hours"),
  },
  async ({ since }) => {
    const config = loadSourcesConfig(join(CONFIG_DIR, "sources.yml"));
    const result = await fetchTwitter(config.twitter.accounts, since);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

- [ ] **Step 2: Build and verify**

Run: `npx tsc`
Expected: Compiles to `dist/` with no errors

- [ ] **Step 4: Commit**

```bash
git add src/mcp-server.ts package.json package-lock.json
git commit -m "feat: add MCP server with all three tools"
```

---

### Task 7: Configuration Files

**Files:**
- Create: `config/sources.yml`
- Create: `config/delivery.yml`
- Create: `.claude/settings.json`

- [ ] **Step 1: Create config/sources.yml**

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

- [ ] **Step 2: Create config/delivery.yml**

```yaml
language: ru
output_path: /Users/ivan_kalinichenko/Personal/0_Journal/Tech
notification: true
```

- [ ] **Step 3: Create .claude/settings.json**

Note: if `.claude/settings.json` already exists, merge the `mcpServers` key into it.

```json
{
  "mcpServers": {
    "ai-digest-mcp": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "cwd": "/Users/ivan_kalinichenko/Dev/Personal/ai-digest.news"
    }
  }
}
```

- [ ] **Step 4: Verify MCP server starts**

Run: `cd /Users/ivan_kalinichenko/Dev/Personal/ai-digest.news && node dist/mcp-server.js`
Expected: Process starts and waits for stdio input (no crash). Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add config/sources.yml config/delivery.yml .claude/settings.json
git commit -m "feat: add configuration files and MCP server registration"
```

---

### Task 8: Main Orchestration Skill (SKILL.md)

**Files:**
- Create: `.claude/skills/ai-digest/SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Create `.claude/skills/ai-digest/SKILL.md`:

````markdown
---
name: ai-digest
description: Run the daily AI tech news digest pipeline — collect, deduplicate, summarize, deliver
---

# AI Digest — Daily Tech News Pipeline

You are running the ai-digest pipeline. Follow these steps exactly.

## Step 1: Read Configuration

Read these files:
- `config/sources.yml` — list of all sources
- `config/delivery.yml` — language, output path, notification settings
- `CLAUDE.md` — personal context (stack, projects, interests, topics to ignore)

## Step 2: Read Previous Digest (for deduplication)

Read the most recent `.md` file from the `output_path` directory (by date in filename).
If no previous digest exists, skip deduplication.
Extract all URLs from the previous digest for later comparison.

## Step 3: Collect Data

Launch sub-agents in parallel to collect data from all sources:

**Agent 1 — RSS feeds:** For each source in `sources.yml` → `rss`, call the `fetch_rss` MCP tool with `name` parameter. Collect all results.

**Agent 2 — GitHub Releases:** Call the `fetch_github_releases` MCP tool (no parameters). Collect results.

**Agent 3 — Twitter:** Call the `fetch_twitter` MCP tool. If it returns warnings about login/connection issues, note them but continue.

Merge all DigestItem[] arrays from all agents into one list.

## Step 4: Deduplicate

- Remove items whose URL appeared in the previous digest
- Merge items with identical URLs from different sources into one entry
- Merge items with very similar titles about the same topic into one entry
- If multiple releases of the same package/tool appear, collapse into one entry with the latest version

## Step 5: Filter

- Read "topics to ignore" from CLAUDE.md
- Remove any items matching ignored topics (e.g. crypto, NFT, blockchain, web3)

## Step 6: Categorize and Summarize

Read the `language` setting from delivery.yml. Generate ALL text in that language.

Assign each item to one category:
- **Relevant to Your Projects** — items that match your stack, active projects, or interests from CLAUDE.md. Add a note explaining the connection.
- **AI / LLM** — AI models, tools, agents, LLM news
- **Frontend** — React, CSS, browser APIs, UI frameworks
- **DevTools / Releases** — developer tools, package releases, CLI tools
- **Twitter Review** — interesting tweets and threads

For each item, write a catchy 1-2 sentence summary as the headline. Make it engaging, not dry. The headline should make the reader want to click through.

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

## 🎯 <"Relevant to Your Projects" in configured language>
- **<catchy headline>** — <summary>. [<source>](url)
  _<relevance note>_

## 🤖 AI / LLM
- **<catchy headline>** — <summary>. [<source>](url)

## ⚛️ Frontend
- ...

## 🔧 DevTools / Releases
- ...

## 🐦 Twitter
- ...
```

Skip any category that has zero items.

## Step 8: Write File

Write the generated markdown to: `<output_path>/YYYY-MM-DD.md`
Use today's date for the filename.

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
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/ai-digest/SKILL.md
git commit -m "feat: add main orchestration skill SKILL.md"
```

---

### Task 9: Add Source Skill

**Files:**
- Create: `.claude/skills/add-source/SKILL.md`

- [ ] **Step 1: Create add-source SKILL.md**

Create `.claude/skills/add-source/SKILL.md`:

```markdown
---
name: add-source
description: Add a new news source (RSS, GitHub release, or Twitter account) to ai-digest config
---

# Add Source

Help the user add a new source to `config/sources.yml`.

## Flow

1. Ask: "What type of source? (rss / github_release / twitter)"

2. Based on type, ask for required info:
   - **rss**: Ask for name (short identifier, lowercase, e.g. "rust-blog"), URL, and limit (default: 10)
   - **github_release**: Ask for repo in `owner/name` format (e.g. "facebook/react")
   - **twitter**: Ask for Twitter username without @ (e.g. "rauchg")

3. Read current `config/sources.yml`

4. Append the new entry to the correct section:
   - rss → append to `rss` array
   - github_release → append to `github_releases.repos` array
   - twitter → append to `twitter.accounts` array

5. Write the updated file

6. Confirm: "Added <name/repo/account> to <section>. It will be included in the next digest run."
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/add-source/SKILL.md
git commit -m "feat: add /add-source skill"
```

---

### Task 10: Run Script, CLAUDE.md, README

**Files:**
- Create: `scripts/run.sh`
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Create scripts/run.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo "[$(date -Iseconds)] Starting ai-digest run" | tee "$LOG_FILE"

claude -p "Run ai-digest skill" \
  --model sonnet \
  --max-turns 30 \
  --allowedTools "Read" "Write" "Bash" "mcp__ai-digest-mcp" \
  2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo "[$(date -Iseconds)] Finished with exit code $EXIT_CODE" | tee -a "$LOG_FILE"
exit $EXIT_CODE
```

- [ ] **Step 2: Make run.sh executable**

Run: `chmod +x scripts/run.sh`

- [ ] **Step 3: Create CLAUDE.md**

```markdown
# Project Context

## My Stack
React, TypeScript, Node.js, NestJS, Drizzle ORM, Tailwind, shadcn/ui

## Active Projects
- Real-time chat app (NestJS + Next.js, Socket.io, Drizzle ORM, JWT + Redis auth)
- Personal blog (Astro + Tailwind 4)
- Obsidian budget planner plugin

## Interests
AI-assisted development, indie dev, micro-SaaS, spec-driven development,
Claude Code skills/workflows, browser extensions

## Ignore
Crypto, Web3, blockchain, NFTs
```

- [ ] **Step 4: Create README.md**

```markdown
# ai-digest.news

Automated morning tech news digest powered by Claude Code + MCP.

## What it does

Runs daily, collects tech news from RSS feeds, GitHub releases, and Twitter, then uses Claude to summarize everything into a personalized Markdown digest in your Obsidian vault.

## Prerequisites

- Node.js 22+
- Claude Code CLI with Max subscription
- Chrome (for Twitter collection, optional)

## Setup

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Build MCP server

```bash
npm run build
```

### 3. Configure sources

Edit `config/sources.yml` to customize your news sources.
Or use `/add-source` in Claude Code to add sources interactively.

### 4. Configure delivery

Edit `config/delivery.yml`:

```yaml
language: en          # digest language (en, ru, etc.)
output_path: ~/digests  # where to save digest files
notification: true      # macOS notification when done
```

### 5. Set up personal context

Edit `CLAUDE.md` with your stack, active projects, and interests.
This personalizes the "Relevant to Your Projects" section.

### 6. Run manually

```bash
./scripts/run.sh
```

### 7. Set up Apple Shortcuts (optional)

1. Open Shortcuts app
2. Create new Automation → Time of Day (e.g. 8:00 AM)
3. Add "Run Shell Script" action
4. Set shell to `/bin/bash`
5. Paste: `/path/to/ai-digest.news/scripts/run.sh`
6. Done

### Twitter setup (optional)

To collect tweets, launch Chrome with remote debugging:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

Or add `--remote-debugging-port=9222` to Chrome's launch flags.
Make sure you're logged into x.com in that Chrome instance.
If Chrome is not available or you're logged out, Twitter is skipped gracefully.

## Usage

```bash
# Run digest
./scripts/run.sh

# Add a source
# In Claude Code, run: /add-source

# View latest digest
cat "$(ls -1t ~/digests/*.md | head -1)"

# Check logs
tail -f logs/$(date +%Y-%m-%d).log
```

## Project Structure

```
├── src/                    # MCP server source
│   ├── mcp-server.ts       # Server entry point
│   ├── tools/              # Collection tools
│   └── types.ts            # Shared types
├── config/                 # Configuration
│   ├── sources.yml         # News sources
│   └── delivery.yml        # Output settings
├── .claude/skills/         # Claude Code skills
├── scripts/run.sh          # Entry point
└── CLAUDE.md               # Personal context
```
```

- [ ] **Step 5: Create logs/.gitkeep**

Run: `mkdir -p logs && touch logs/.gitkeep`

- [ ] **Step 6: Commit**

```bash
git add scripts/run.sh CLAUDE.md README.md logs/.gitkeep
git commit -m "feat: add run script, CLAUDE.md, and README"
```

---

### Task 11: Integration Test

**Files:** _(no new files)_

Manual end-to-end verification of the full pipeline.

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: `dist/` directory created with compiled JS files, no errors

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Test fetch_rss manually**

Run in Claude Code:
```
Call the fetch_rss MCP tool with name "hackernews"
```
Expected: Returns JSON with DigestItem[] containing HN front page items

- [ ] **Step 4: Test fetch_github_releases manually**

Run in Claude Code:
```
Call the fetch_github_releases MCP tool
```
Expected: Returns JSON with DigestItem[] containing latest releases

- [ ] **Step 5: Test full pipeline**

Run: `./scripts/run.sh`
Expected:
- Digest file created at configured output_path with today's date
- macOS notification appears
- Log file created in `logs/`

- [ ] **Step 6: Verify digest quality**

Open the generated digest file and check:
- Frontmatter is present and correct
- Categories are populated
- Headlines are in configured language
- "Relevant to Your Projects" section shows items matching CLAUDE.md
- No duplicate items

- [ ] **Step 7: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix: adjustments from integration testing"
```
