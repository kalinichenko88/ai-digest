# Docker Distribution Design

## Context

ai-digest is a daily tech news digest powered by Claude Code + MCP. Currently it requires manual Node.js setup, Playwright for Twitter scraping, and has no containerization. The goal is to simplify distribution so new users can get started with minimal setup.

## Decisions

- **Docker:** MCP server runs in Docker, Claude Code stays on host
- **Twitter:** Remove entirely — fragile (CDP, login, DOM selectors), main blocker for containerization
- **Base image:** Node.js 24 Alpine, multi-stage build (~80-100MB final image)
- **Config:** Volume mount with defaults baked into image
- **Secrets:** `.env` file with optional `GITHUB_TOKEN`
- **Registry:** `ghcr.io/kalinichenko88/ai-digest`, published via GitHub Actions on tag push
- **settings.json:** Committed with Docker variant (universal), preserving existing `permissions` block
- **Logs:** Volume mount `./logs:/app/logs` so MCP server logs persist on host

## Architecture

```
Claude Code (host)
  ├── Write tool → digest file to Obsidian vault
  ├── Bash tool → osascript notification
  └── MCP stdio → docker run -i --rm \
                     --env-file .env \
                     -v ./config:/app/config \
                     -v ./logs:/app/logs \
                     ghcr.io/kalinichenko88/ai-digest
                         │
                         ├── fetch_rss → single RSS feed by name
                         ├── fetch_all_rss → all RSS feeds in parallel
                         ├── fetch_github_releases → GitHub API
                         └── validate_sources → structure + URL checks
```

Claude Code orchestrates the pipeline (skills), writes output, sends notifications. Docker container only collects data via MCP tools.

**Volume mounts:**
- `./config:/app/config` — user config overrides baked-in defaults
- `./logs:/app/logs` — MCP server logs persist on host (logger.ts writes to `logs/YYYY-MM-DD.md`)

**Path resolution:** Claude Code resolves `./config` and `./logs` relative to the project root (where `.claude/settings.json` lives). No explicit `cwd` needed in settings.

## Dockerfile

```dockerfile
# Stage 1: build
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

# Stage 2: runtime
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ dist/
COPY config/ config/
CMD ["node", "dist/mcp-server.js"]
```

- Default config baked in, overridden by `-v ./config:/app/config`
- No Playwright, no Chromium — lightweight image
- `logs/` directory created at runtime by logger.ts

## .env

`.env.example` (committed):
```
# GitHub personal access token (optional)
# Without token: 60 requests/hour. With token: 5,000 requests/hour.
# Create at: https://github.com/settings/tokens (no scopes needed for public repos)
GITHUB_TOKEN=
```

`.env` is already in `.gitignore`. Setup instructions tell users to copy `.env.example` → `.env` so the file always exists (Docker's `--env-file` fails if the file is missing).

## settings.json

Committed with Docker variant, preserving existing `permissions` block:
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

## GitHub Actions

`.github/workflows/docker-publish.yml`:

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

Triggers on tag push (`v*`). Tags image with semver + `latest`. Uses `GITHUB_TOKEN` (built-in) for GHCR auth.

## Files Changed

**Note:** All Twitter removal changes (types, config, validate-sources, mcp-server, tests, skills) are interdependent and must be done atomically — removing `twitter` from `SourcesConfig` will break any code still referencing `config.twitter`.

### Delete
- `src/tools/fetch-twitter.ts`

### Modify
| File | Change |
|------|--------|
| `src/mcp-server.ts` | Remove `fetchTwitter` import and `fetch_twitter` tool registration |
| `src/types.ts` | Remove `twitter` field from `SourcesConfig` interface |
| `src/config.ts` | Remove twitter from log message in `loadSourcesConfig` |
| `src/tools/validate-sources.ts` | Remove `"twitter"` from `ReachabilityResult.type` union, delete `checkTwitter` function, remove twitter loop from `checkReachability`, remove twitter section from `validateStructure` |
| `src/tools/fetch-github-releases.ts` | Read `GITHUB_TOKEN` from `process.env`, add `Authorization: Bearer` header alongside existing `Accept` header when present: `...(process.env.GITHUB_TOKEN && { Authorization: \`Bearer ${process.env.GITHUB_TOKEN}\` })` |
| `config/sources.yml` | Remove `twitter` section entirely |
| `config/delivery.yml` | Replace with generic defaults: `language: en`, `output_path: ~/digests`, `notification: true`. This is the version baked into the Docker image. Existing users keep their personal config via volume mount (`-v ./config:/app/config`), so committed defaults only affect new users. |
| `package.json` | Remove `playwright` from dependencies |
| `.claude/settings.json` | Switch to Docker command with volume mounts, keep `permissions` block, remove `cwd` |
| `.claude/skills/ai-digest/SKILL.md` | Remove Step 3 Agent 3 (Twitter), remove `Twitter Review` category from Step 6, remove `🐦 Twitter` section from Step 7 template |
| `.claude/skills/add-source/SKILL.md` | Remove `twitter` from source type options (Step 1), remove twitter handling from Steps 2, 4, 5, 6. Update description to "RSS or GitHub release" |
| `.claude/skills/validate-sources/SKILL.md` | Remove `⚠ twitter: name — unable to verify` from example output |
| `README.md` | Rewrite: Docker-first setup, remove Twitter section, add GITHUB_TOKEN docs, add GHCR pull instructions. Fix log file extension: `.log` → `.md` to match actual logger output |
| `scripts/run.sh` | No Twitter-specific code to remove, keep as-is |
| `tests/validate-sources.test.ts` | Remove `twitter` from all `SourcesConfig` fixtures, delete Twitter-specific tests (empty account, @ prefix, duplicates, reachability) |
| `tests/config.test.ts` | Remove `twitter` from config fixtures if present |
| `tests/fetch-github-releases.test.ts` | Add tests: Authorization header sent when `GITHUB_TOKEN` is set, no header when absent |

### No changes needed
| File | Reason |
|------|--------|
| `src/tools/fetch-rss.ts` | No Twitter references, types still compatible |
| `tests/fetch-rss.test.ts` | No Twitter references |
| `.gitignore` | Already has `.env` |

### Create
| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage Node.js 24 Alpine build |
| `.env.example` | Template with optional `GITHUB_TOKEN` |
| `.dockerignore` | Exclude `node_modules/`, `dist/`, `logs/`, `.git/`, `.env`, `docs/`, `tests/` from build context |
| `.github/workflows/docker-publish.yml` | Build and push image to GHCR on tag push |
