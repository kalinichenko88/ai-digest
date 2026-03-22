# Docker Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize the MCP server with Docker, remove Twitter support, add `.env` config, and publish to GHCR — making the project easy to distribute.

**Architecture:** MCP server runs inside a Docker container (Node.js 24 Alpine, multi-stage build). Claude Code on the host communicates via stdio through `docker run -i`. Config and logs are volume-mounted from the host.

**Tech Stack:** Docker, Node.js 24 Alpine, GitHub Actions, GitHub Container Registry

**Spec:** `docs/superpowers/specs/2026-03-21-docker-distribution-design.md`

---

### Task 1: Remove Twitter support from source code

All Twitter removal changes are interdependent — `SourcesConfig` type, source code, and tests must change atomically.

**Files:**
- Delete: `src/tools/fetch-twitter.ts`
- Modify: `src/types.ts:21-29`
- Modify: `src/config.ts:10`
- Modify: `src/tools/validate-sources.ts:1-141`
- Modify: `src/mcp-server.ts:9,86-104`
- Modify: `config/sources.yml:45-60`
- Modify: `package.json:16`
- Modify: `tests/validate-sources.test.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Remove `twitter` from `SourcesConfig` in `src/types.ts`**

Remove lines 26-28 (`twitter` field):

```ts
export interface SourcesConfig {
  rss: RssSource[];
  github_releases: {
    repos: string[];
  };
}
```

- [ ] **Step 2: Remove twitter from `src/config.ts:10`**

Change the log line to:

```ts
log("config", `Sources: ${config.rss.length} RSS, ${config.github_releases.repos.length} GitHub repos`);
```

- [ ] **Step 3: Remove twitter from `src/tools/validate-sources.ts`**

Change `ReachabilityResult.type` union (line 4):

```ts
type: "rss" | "github";
```

Delete the entire Twitter section from `validateStructure` (lines 47-60):

```ts
  // Twitter
  const accountSet = new Set<string>();
  for (const account of config.twitter.accounts) {
  ...
  }
```

Delete the twitter loop from `checkReachability` (lines 78-80):

```ts
  for (const account of config.twitter.accounts) {
    checks.push(checkTwitter(account));
  }
```

Delete the entire `checkTwitter` function (lines 117-140).

- [ ] **Step 4: Remove `fetch_twitter` tool and import from `src/mcp-server.ts`**

Delete line 9:

```ts
import { fetchTwitter } from "./tools/fetch-twitter.js";
```

Delete the entire `fetch_twitter` tool registration (lines 86-104).

- [ ] **Step 5: Delete `src/tools/fetch-twitter.ts`**

```bash
rm src/tools/fetch-twitter.ts
```

- [ ] **Step 6: Remove `playwright` from `package.json`**

Remove line 16 (`"playwright": "^1.50.0",`) from dependencies. Then:

```bash
npm install
```

- [ ] **Step 7: Remove `twitter` section from `config/sources.yml`**

Delete lines 45-61 (entire `twitter:` block). File should end after `github_releases` repos list.

- [ ] **Step 8: Update tests — `tests/validate-sources.test.ts`**

Remove `twitter: { accounts: [...] }` from ALL `SourcesConfig` fixtures. Every test object that has `twitter` needs it removed.

Delete these entire test cases:
- `catches empty twitter account name` (lines 81-89)
- `catches twitter account with @ prefix` (lines 91-99)
- `catches duplicate twitter accounts` (lines 101-109)
- `marks twitter as unable-to-verify on non-404` (lines 170-179)
- `marks twitter as failed on 404` (lines 181-191)
- `marks twitter as unverifiable on network error` (lines 207-216)

Update `checks all sources in parallel` test (lines 218-230): remove `twitter: { accounts: ["u"] }` from config and change expected length from 4 to 3.

- [ ] **Step 9: Update tests — `tests/config.test.ts`**

In `parses sources.yml correctly` test (lines 9-35): remove `twitter:\n  accounts:\n    - AnthropicAI` from the YAML string, and remove `expect(config.twitter.accounts).toEqual(["AnthropicAI"]);` assertion.

- [ ] **Step 10: Run tests and verify**

```bash
npm run build && npm test
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git rm src/tools/fetch-twitter.ts
git add src/types.ts src/config.ts src/tools/validate-sources.ts src/mcp-server.ts \
  config/sources.yml package.json package-lock.json \
  tests/validate-sources.test.ts tests/config.test.ts
git commit -m "refactor: remove Twitter support

Twitter scraping via Chrome CDP was the main blocker for containerization.
Removes fetch-twitter tool, Playwright dependency, and all related code/tests."
```

---

### Task 2: Add optional GITHUB_TOKEN support (TDD)

**Files:**
- Modify: `src/tools/fetch-github-releases.ts:17-18`
- Modify: `tests/fetch-github-releases.test.ts`

- [ ] **Step 1: Write failing test — token sends Authorization header**

Add to `tests/fetch-github-releases.test.ts`:

```ts
it("sends Authorization header when GITHUB_TOKEN is set", async () => {
  process.env.GITHUB_TOKEN = "test-token-123";
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      tag_name: "v1.0.0",
      name: "Release",
      body: "Notes",
      html_url: "https://github.com/a/b/releases/tag/v1.0.0",
      published_at: "2026-03-19T10:00:00Z",
      author: { login: "dev" },
    }),
  });

  await fetchGithubReleases(["a/b"]);

  expect(mockFetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: "Bearer test-token-123",
      }),
    })
  );
  delete process.env.GITHUB_TOKEN;
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/fetch-github-releases.test.ts
```

Expected: FAIL — Authorization header not present.

- [ ] **Step 3: Write failing test — no header without token**

Add to `tests/fetch-github-releases.test.ts`:

```ts
it("does not send Authorization header when GITHUB_TOKEN is absent", async () => {
  delete process.env.GITHUB_TOKEN;
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      tag_name: "v1.0.0",
      name: "Release",
      body: "Notes",
      html_url: "https://github.com/a/b/releases/tag/v1.0.0",
      published_at: "2026-03-19T10:00:00Z",
      author: { login: "dev" },
    }),
  });

  await fetchGithubReleases(["a/b"]);

  const callHeaders = mockFetch.mock.calls[0][1].headers;
  expect(callHeaders).not.toHaveProperty("Authorization");
});
```

- [ ] **Step 4: Implement GITHUB_TOKEN in `src/tools/fetch-github-releases.ts`**

Replace the headers object in the fetch call (line 18):

```ts
const headers: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}
```

And use `headers` variable in the fetch call:

```ts
const response = await fetch(`${GITHUB_API}/${repo}/releases/latest`, {
  headers,
});
```

- [ ] **Step 5: Run all tests**

```bash
npm run build && npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/tools/fetch-github-releases.ts tests/fetch-github-releases.test.ts
git commit -m "feat: add optional GITHUB_TOKEN support for higher rate limits"
```

---

### Task 3: Create Docker files

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `.env.example`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules/
dist/
logs/
.git/
.env
docs/
tests/
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ dist/
COPY config/ config/
CMD ["node", "dist/mcp-server.js"]
```

- [ ] **Step 3: Create `.env.example`**

```
# GitHub personal access token (optional)
# Without token: 60 requests/hour. With token: 5,000 requests/hour.
# Create at: https://github.com/settings/tokens (no scopes needed for public repos)
GITHUB_TOKEN=
```

- [ ] **Step 4: Build Docker image and verify**

```bash
docker build -t ai-digest-mcp .
```

Expected: builds successfully, no errors.

- [ ] **Step 5: Test MCP server starts inside container**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | docker run -i --rm ai-digest-mcp
```

Expected: JSON-RPC response with server capabilities (may hang waiting for more input — that's OK, Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore .env.example
git commit -m "feat: add Dockerfile and env config for distribution"
```

---

### Task 4: Update Claude Code skills

**Files:**
- Modify: `.claude/skills/ai-digest/SKILL.md`
- Modify: `.claude/skills/add-source/SKILL.md`
- Modify: `.claude/skills/validate-sources/SKILL.md`
- Modify: `CLAUDE.md:21`

- [ ] **Step 1: Update `ai-digest/SKILL.md`**

In Step 3 (line 39-47): delete Agent 3 — Twitter block (lines 45-46):

```
**Agent 3 — Twitter:** Call the `fetch_twitter` MCP tool. If it returns warnings about login/connection issues, note them but continue.
```

In Step 6 (line 65-71): delete the Twitter Review category (line 71):

```
- **Twitter Review** — interesting tweets and threads
```

In Step 7 template (lines 110-111): delete the Twitter section:

```
## 🐦 Twitter
- ...
```

- [ ] **Step 2: Update `add-source/SKILL.md`**

Update frontmatter description (line 3):

```
description: Add a new news source (RSS or GitHub release) to ai-digest config
```

Step 1 (line 14): change to:

```
1. Ask: "What type of source? (rss / github_release)"
```

Step 2 (lines 16-19): delete the twitter line:

```
   - **twitter**: Ask for Twitter username without @ (e.g. "rauchg")
```

Step 4 (lines 23-27): delete twitter duplicate check:

```
   - **twitter**: check if the same account already exists
```

Step 5 (lines 29-34): delete twitter reachability check:

```
   - **twitter**: WebFetch `https://x.com/{account}`, only treat clear 404 as broken
```

Step 6 (lines 36-39): delete twitter append:

```
   - twitter → append to `twitter.accounts` array
```

- [ ] **Step 3: Update `validate-sources/SKILL.md`**

Delete the twitter example line (line 34):

```
⚠ twitter: name — unable to verify
```

- [ ] **Step 4: Update `CLAUDE.md` line 21**

Change the `/add-source` description from:

```
- `/add-source` — Add a new source (RSS, GitHub release, or Twitter) to `config/sources.yml` interactively
```

To:

```
- `/add-source` — Add a new source (RSS or GitHub release) to `config/sources.yml` interactively
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/ CLAUDE.md
git commit -m "docs: remove Twitter references from all Claude Code skills and CLAUDE.md"
```

---

### Task 5: Update settings.json and delivery.yml defaults

**Files:**
- Modify: `.claude/settings.json`
- Modify: `config/delivery.yml`

- [ ] **Step 1: Update `.claude/settings.json`**

Replace entire file with:

```json
{
  "permissions": {
    "allow": [
      "Edit(config/sources.yml)"
    ]
  },
  "mcpServers": {
    "ai-digest-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "--env-file", ".env",
        "-v", "./config:/app/config",
        "-v", "./logs:/app/logs",
        "ghcr.io/kalinichenko88/ai-digest"
      ]
    }
  }
}
```

- [ ] **Step 2: Update `config/delivery.yml` to generic defaults**

```yaml
language: en
output_path: ~/digests
notification: true
```

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json config/delivery.yml
git commit -m "feat: switch MCP server to Docker, set generic config defaults"
```

---

### Task 6: Add GitHub Actions workflow

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Create `.github/workflows/docker-publish.yml`**

```yaml
name: Publish Docker image

on:
  push:
    tags: ["v*"]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: kalinichenko88/ai-digest

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/docker-publish.yml
git commit -m "ci: add GitHub Actions workflow to publish Docker image to GHCR"
```

---

### Task 7: Rewrite README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# ai-digest.news

Automated morning tech news digest powered by Claude Code + MCP.

## What it does

Runs daily, collects tech news from RSS feeds and GitHub releases, then uses Claude to summarize everything into a personalized Markdown digest.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) with Max subscription

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/kalinichenko88/ai-digest.git
cd ai-digest
cp .env.example .env
```

### 2. Pull the Docker image

```bash
docker pull ghcr.io/kalinichenko88/ai-digest
```

Or build locally:

```bash
docker build -t ghcr.io/kalinichenko88/ai-digest .
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

### 6. Run

```bash
./scripts/run.sh
```

### 7. Set up Apple Shortcuts (optional)

1. Open Shortcuts app
2. Create new Automation → Time of Day (e.g. 8:00 AM)
3. Add "Run Shell Script" action
4. Set shell to `/bin/bash`
5. Paste: `/path/to/ai-digest/scripts/run.sh`
6. Done

## GitHub Token (optional)

Without a token, GitHub API allows 60 requests/hour. With a token: 5,000 requests/hour.

1. Create a token at https://github.com/settings/tokens (no scopes needed for public repos)
2. Add to `.env`:

```
GITHUB_TOKEN=ghp_your_token_here
```

## Usage

```bash
# Run digest
./scripts/run.sh

# Add a source interactively (in Claude Code)
/add-source

# Validate sources config (in Claude Code)
/validate-sources

# View latest digest
cat "$(ls -1t ~/digests/*.md | head -1)"

# Check logs
tail -f logs/$(date +%Y-%m-%d).md
```

## Development

For local development without Docker:

```bash
# Install dependencies
npm install

# Build MCP server
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

To use the native MCP server (without Docker), update `.claude/settings.json`:

```json
{
  "mcpServers": {
    "ai-digest-mcp": {
      "command": "node",
      "args": ["dist/mcp-server.js"]
    }
  }
}
```

## Project Structure

```
├── Dockerfile              # Multi-stage Docker build
├── src/                    # MCP server source
│   ├── mcp-server.ts       # Server entry point
│   ├── tools/              # Collection tools
│   └── types.ts            # Shared types
├── config/                 # Configuration
│   ├── sources.yml         # News sources
│   └── delivery.yml        # Output settings
├── .claude/skills/         # Claude Code skills
│   ├── ai-digest/          # /ai-digest — run the full digest pipeline
│   ├── add-source/         # /add-source — add a new source interactively
│   └── validate-sources/   # /validate-sources — validate config & check URLs
├── .github/workflows/      # CI/CD
│   └── docker-publish.yml  # Publish image to GHCR on tag push
├── scripts/run.sh          # Entry point
├── .env.example            # Environment variables template
└── CLAUDE.md               # Personal context
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with Docker-first setup and GITHUB_TOKEN docs"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run build && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Build Docker image**

```bash
docker build -t ghcr.io/kalinichenko88/ai-digest .
```

Expected: builds successfully.

- [ ] **Step 3: Test MCP server via Docker**

```bash
cp .env.example .env
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | docker run -i --rm --env-file .env -v ./config:/app/config ghcr.io/kalinichenko88/ai-digest
```

Expected: valid JSON-RPC response.

- [ ] **Step 4: Verify no Twitter references remain**

```bash
grep -ri "twitter\|tweet\|x\.com" src/ config/ tests/ .claude/skills/ --include="*.ts" --include="*.yml" --include="*.md" --include="*.json"
```

Expected: no matches (except possibly CLAUDE.md interests section which is user content, and this plan/spec in docs/).
