# ai-digest.news

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

# Lint and format
npx @biomejs/biome check --write src/
```

### Releasing

Use the `/release` skill in Claude Code to create a new release:

```
/release 1.2.0
```

This bumps the version in `package.json`, generates a changelog, creates a git tag, and publishes a GitHub Release.

### Native MCP Server

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
├── biome.json              # Biome linter/formatter config
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
