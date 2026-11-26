# ai-digest.news

[![CI](https://github.com/kalinichenko88/ai-digest/actions/workflows/ci.yml/badge.svg)](https://github.com/kalinichenko88/ai-digest/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/kalinichenko88/ai-digest)](https://github.com/kalinichenko88/ai-digest/releases)

Automated morning tech news digest powered by Claude Code + MCP.

## What it does

Runs daily, collects tech news from RSS feeds and GitHub releases, then uses Claude to summarize everything into a personalized Markdown digest.

## Installation

### Quick Install

```bash
curl -sL https://github.com/kalinichenko88/ai-digest/releases/latest/download/install.sh | bash
```

### Manual Install

1. Download the latest release from [GitHub Releases](https://github.com/kalinichenko88/ai-digest/releases)
2. Unpack: `tar -xzf ai-digest-v*.tar.gz`
3. Run: `cd ai-digest && ./install.sh`

### Updating

```bash
./run.sh update
```

The update adds the new sources of the release to your `config/sources.yml` with the Go [yq](https://github.com/mikefarah/yq) (`brew install yq`). Without it, or with the Python `yq` of pip or apt, the update skips this merge and leaves your configs as they are.

When the pull of the Docker image fails, for example because Docker is not running, the update stops before it changes a file. Check that Docker runs and reaches `ghcr.io`, then run `./run.sh update` again. For the first update from v0.1.8 and older, see below.

Claude Code reads the MCP server from `.mcp.json`. The update of v0.1.8 and older does not bring that file, so the next run of `run.sh` downloads the `.mcp.json` of your installed version from GitHub, once.

The update of v0.1.8 and older also leaves the `:latest` image that `.mcp.json` runs as it was, and it writes the new version before its pull: after a failed pull, `./run.sh update` says that you are up to date. After that update, also when its pull failed, run this once in the install folder. It takes the image of your new version and tags it `:latest`:

```bash
v=$(cat .version)
docker pull "ghcr.io/kalinichenko88/ai-digest:$v" && docker tag "ghcr.io/kalinichenko88/ai-digest:$v" ghcr.io/kalinichenko88/ai-digest
```

Later updates do this themselves.

The update of v0.1.8 and older also writes the new `run.sh` into the file that a digest run in progress reads. That run then ends without its `Finished` line in the log and without its failure notification. So run that update when no digest run is in progress. Later updates let a run in progress finish with its own `run.sh`.

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

> **Tip:** Set `output_path` to a folder inside your Obsidian vault (e.g. `~/Obsidian/Digests`) to read digests directly in Obsidian. If you have Obsidian Sync enabled, digests will be available on all your devices.

> **Note:** To skip news that earlier digests already covered, the MCP server reads the digests of the last days in `output_path`. In the Docker setup, `run.sh` passes that folder to `.mcp.json`, which mounts it into the container, read-only. So in that setup, start each run with `run.sh`: a run started another way logs a warning and does not compare with earlier days. Give `output_path` as `~/…` or as an absolute path, in a folder that Docker can mount: with Docker Desktop or colima, a folder under your home folder works by default.

### 5. Set up personal context

Edit `CLAUDE.md` with your stack, active projects, and interests.
This personalizes the "Relevant to Your Projects" section.

### 6. Run

```bash
./scripts/run.sh
```

### 7. Scheduling

ai-digest does not include a built-in scheduler — it runs once and exits. To get daily digests, set up scheduling yourself.

**macOS — Shortcuts Automation (recommended):**

1. Open Shortcuts app
2. Create new Automation → Time of Day (e.g. 8:00 AM)
3. Add "Run Shell Script" action
4. Set shell to `/bin/bash`
5. Paste:

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd /path/to/ai-digest
./run.sh
```

> **Note:** Apple Shortcuts runs with a minimal `PATH`. The `export PATH` line adds Homebrew (`/opt/homebrew/bin`) and Claude Code (`$HOME/.local/bin`) so that `claude` and `docker` are found.

**Linux / macOS — cron:**

```bash
# Run every day at 8:00 AM
0 8 * * * /path/to/ai-digest/run.sh
```

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

# Watch this run's digest output
tail -f logs/$(date +%Y-%m-%d).md

# Diagnose a crash (process start/exit, tool errors, signals)
tail -f logs/run.log
```

When a run dies, `logs/run.log` is the file to read. Exit codes: `2` docker
missing, `3` Docker daemon down, `4` no `.mcp.json` and its download failed,
`137` killed (usually OOM), `143` terminated.
A run with no `exiting code=` line was killed outright rather than crashing.

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

# Typecheck src and tests
npx tsc --noEmit

# Lint and format
npx @biomejs/biome check --write
```

### Releasing

Use the `/release` skill in Claude Code to create a new release:

```
/release 1.2.0
```

This bumps the version in `.version`, `package.json` and `README.md`, updates `CHANGELOG.md`, commits and tags the release, pushes it, and creates a draft GitHub Release. CI then builds the image and the archive and publishes the release.

### Native MCP Server

To use the native MCP server (without Docker), update `.mcp.json`:

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
├── biome.json              # Biome linter/formatter config
├── src/                    # MCP server source
│   ├── mcp-server.ts       # Server entry point
│   ├── tools/              # Collection tools
│   └── types.ts            # Shared types
├── config/                 # Configuration
│   ├── sources.yml         # News sources
│   └── delivery.yml        # Output settings
├── .mcp.json               # MCP server: docker run with its mounts
├── .claude/skills/         # Claude Code skills
│   ├── ai-digest/          # /ai-digest — run the full digest pipeline
│   ├── add-source/         # /add-source — add a new source interactively
│   └── validate-sources/   # /validate-sources — validate config & check URLs
├── .github/workflows/      # CI/CD
│   └── ci.yml              # Quality checks + Docker + release pipeline
├── scripts/run.sh          # Entry point
├── .env.example            # Environment variables template
└── CLAUDE.md               # Personal context
```
