# CI & Release System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a release system where `/release` skill drives versioning, CI builds artifacts, and end users install via `curl | bash` or download an archive.

**Architecture:** Claude Code skill creates draft GitHub Release → CI publishes Docker image + release archive → end users install with `install.sh` and update with `run.sh update`. Config merges preserve user modifications.

**Tech Stack:** Bash, GitHub Actions, `gh` CLI, `yq`, Docker

**Spec:** `docs/superpowers/specs/2026-03-22-ci-release-system-design.md`

---

### Task 1: Create `.version` file

**Files:**
- Create: `.version`

- [ ] **Step 1: Create `.version`**

```
0.1.0
```

Single line, no trailing newline. Must match `package.json` version.

- [ ] **Step 2: Add to `.gitignore` exclusion check**

Verify `.version` is NOT in `.gitignore` (it must be tracked).

Run: `grep -c '\.version' .gitignore || echo "not ignored - ok"`

- [ ] **Step 3: Commit**

```bash
git add .version
git commit -m "chore: add .version file for release tracking"
```

---

### Task 2: Create `scripts/build-archive.sh`

**Files:**
- Create: `scripts/build-archive.sh`

This script is called by CI to assemble the release archive. It takes a version argument and produces `ai-digest-v<version>.tar.gz`.

- [ ] **Step 1: Write `scripts/build-archive.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-archive.sh <version>}"
ARCHIVE_NAME="ai-digest-v${VERSION}.tar.gz"
STAGING_DIR="$(mktemp -d)"
TARGET="${STAGING_DIR}/ai-digest"

mkdir -p "${TARGET}/.claude/skills"
mkdir -p "${TARGET}/config"

# Skills
cp -r .claude/skills/ai-digest "${TARGET}/.claude/skills/"
cp -r .claude/skills/add-source "${TARGET}/.claude/skills/"
cp -r .claude/skills/validate-sources "${TARGET}/.claude/skills/"

# Claude Code settings
cp .claude/settings.json "${TARGET}/.claude/"

# Config templates
cp config/sources.yml "${TARGET}/config/"
cp config/delivery.yml "${TARGET}/config/"

# Scripts and root files
cp scripts/install.sh "${TARGET}/install.sh"
cp scripts/run.sh "${TARGET}/run.sh"
cp .env.example "${TARGET}/.env.example"
cp .version "${TARGET}/.version"
cp CLAUDE.md "${TARGET}/CLAUDE.md"
cp README.md "${TARGET}/README.md"

# Make scripts executable
chmod +x "${TARGET}/run.sh" "${TARGET}/install.sh"

# Create archive
tar -czf "${ARCHIVE_NAME}" -C "${STAGING_DIR}" ai-digest

# Cleanup
rm -rf "${STAGING_DIR}"

echo "${ARCHIVE_NAME}"
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/build-archive.sh`

- [ ] **Step 3: Test archive contents**

Run: `./scripts/build-archive.sh 0.1.0 && tar -tzf ai-digest-v0.1.0.tar.gz | head -30`

Expected: listing shows `ai-digest/.claude/skills/`, `ai-digest/config/`, `ai-digest/run.sh`, `ai-digest/install.sh`, etc.

Verify NO source files: `tar -tzf ai-digest-v0.1.0.tar.gz | grep -E '(src/|tests/|node_modules/|dist/|Dockerfile|package\.json|tsconfig)' && echo "FAIL: source files found" || echo "PASS: no source files"`

- [ ] **Step 4: Cleanup test artifact**

Run: `rm -f ai-digest-v0.1.0.tar.gz`

- [ ] **Step 5: Verify executable bit will be tracked**

Run: `git ls-files --stage scripts/build-archive.sh`

Expected: mode `100755` (not `100644`)

- [ ] **Step 6: Commit**

```bash
git add scripts/build-archive.sh
git commit -m "feat: add build-archive.sh for release artifact assembly"
```

---

### Task 3: Create `scripts/install.sh`

**Files:**
- Create: `scripts/install.sh`

Interactive installer with two modes: remote (curl | bash) and local (from unpacked archive).

- [ ] **Step 1: Write `scripts/install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="kalinichenko88/ai-digest"
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
ask()   { echo -en "${BOLD}$1${NC} "; }

echo -e "\n${BOLD}ai-digest installer${NC}\n"

# --- Remote mode: download archive first ---
if [ ! -f ".version" ]; then
  echo "Downloading latest release..."

  RELEASE_URL=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep "browser_download_url.*tar.gz" \
    | cut -d '"' -f 4)

  if [ -z "${RELEASE_URL}" ]; then
    error "Could not find latest release. Check https://github.com/${REPO}/releases"
    exit 1
  fi

  curl -sL "${RELEASE_URL}" | tar -xz
  cd ai-digest
  info "Downloaded and unpacked"
fi

# --- Check dependencies ---
echo ""
for cmd in docker claude gh yq; do
  if command -v "$cmd" &>/dev/null; then
    info "$cmd found"
  else
    warn "$cmd not found — install it before running ai-digest"
  fi
done

# --- Interactive setup ---
echo ""

ask "Digest language [en]:"
read -r LANG_INPUT
DIGEST_LANG="${LANG_INPUT:-en}"

ask "Output path for digests [~/digests]:"
read -r PATH_INPUT
OUTPUT_PATH="${PATH_INPUT:-~/digests}"

ask "GitHub token (optional, press Enter to skip):"
read -r GH_TOKEN

ask "Enable macOS notifications? [y/n, default: y]:"
read -r NOTIFY_INPUT
NOTIFICATION="true"
if [ "${NOTIFY_INPUT}" = "n" ] || [ "${NOTIFY_INPUT}" = "N" ]; then
  NOTIFICATION="false"
fi

# --- Write configs ---
echo ""

# delivery.yml
cat > config/delivery.yml << YAML
language: ${DIGEST_LANG}
output_path: ${OUTPUT_PATH}
notification: ${NOTIFICATION}
YAML
info "config/delivery.yml written"

# .env
if [ -n "${GH_TOKEN}" ]; then
  echo "GITHUB_TOKEN=${GH_TOKEN}" > .env
  info ".env written with GitHub token"
else
  cp .env.example .env
  info ".env created from template"
fi

# --- Pull Docker image ---
echo ""
if command -v docker &>/dev/null; then
  echo "Pulling Docker image..."
  docker pull "ghcr.io/${REPO}:latest"
  info "Docker image pulled"
else
  warn "Skipping Docker pull (docker not found)"
fi

# --- Summary ---
echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Edit ${BOLD}CLAUDE.md${NC} with your stack, interests, and topics to ignore"
echo -e "  2. Review ${BOLD}config/sources.yml${NC} to customize news sources"
echo -e "  3. Run: ${BOLD}./run.sh${NC}"
echo ""
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/install.sh`

- [ ] **Step 3: Verify syntax**

Run: `bash -n scripts/install.sh && echo "syntax ok"`

Expected: `syntax ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/install.sh
git commit -m "feat: add interactive install.sh for end-user setup"
```

---

### Task 4: Update `scripts/run.sh` — add `update` subcommand

**Files:**
- Modify: `scripts/run.sh`

Add `update` subcommand with safe self-update via exec-into-helper pattern.

- [ ] **Step 1: Read current `scripts/run.sh`**

Read the file to understand current structure before modifying.

- [ ] **Step 2: Rewrite `scripts/run.sh` with update subcommand**

The script must handle two modes:
- `./run.sh` — run the digest (existing behavior)
- `./run.sh update` — check for updates and apply them

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="kalinichenko88/ai-digest"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- Update subcommand ---
if [ "${1:-}" = "update" ]; then
  BOLD='\033[1m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  NC='\033[0m'

  info()  { echo -e "${GREEN}✓${NC} $1"; }
  warn()  { echo -e "${YELLOW}!${NC} $1"; }
  error() { echo -e "${RED}✗${NC} $1"; exit 1; }

  # Read current version
  if [ ! -f "${SCRIPT_DIR}/.version" ]; then
    error "No .version file found. Is this an ai-digest installation?"
  fi
  CURRENT="$(cat "${SCRIPT_DIR}/.version")"

  # Fetch latest version (unauthenticated)
  GITHUB_TOKEN_VAL=""
  if [ -f "${SCRIPT_DIR}/.env" ]; then
    GITHUB_TOKEN_VAL=$(grep -E '^GITHUB_TOKEN=' "${SCRIPT_DIR}/.env" 2>/dev/null | cut -d '=' -f2- || true)
  fi

  # Fetch latest version — conditional curl to avoid quoting issues
  if [ -n "${GITHUB_TOKEN_VAL}" ]; then
    RELEASE_JSON=$(curl -s -H "Authorization: token ${GITHUB_TOKEN_VAL}" "https://api.github.com/repos/${REPO}/releases/latest")
  else
    RELEASE_JSON=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest")
  fi
  LATEST=$(echo "${RELEASE_JSON}" | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/')

  if [ -z "${LATEST}" ]; then
    error "Could not fetch latest version"
  fi

  if [ "${CURRENT}" = "${LATEST}" ]; then
    info "Already up to date (v${CURRENT})"
    exit 0
  fi

  echo -e "Update available: ${YELLOW}v${CURRENT}${NC} → ${GREEN}v${LATEST}${NC}"

  # Download new release to temp
  UPDATE_TMPDIR="$(mktemp -d)"
  ARCHIVE_URL=$(echo "${RELEASE_JSON}" | grep "browser_download_url.*tar.gz" | head -1 | cut -d '"' -f 4)

  if [ -z "${ARCHIVE_URL}" ]; then
    rm -rf "${UPDATE_TMPDIR}"
    error "Could not find release archive URL"
  fi

  echo "Downloading v${LATEST}..."
  curl -sL "${ARCHIVE_URL}" -o "${UPDATE_TMPDIR}/release.tar.gz"
  tar -xzf "${UPDATE_TMPDIR}/release.tar.gz" -C "${TMPDIR}"

  NEW_DIR="${UPDATE_TMPDIR}/ai-digest"

  # Write helper script and exec into it
  cat > "${UPDATE_TMPDIR}/apply-update.sh" << 'HELPER'
#!/usr/bin/env bash
set -euo pipefail

NEW_DIR="$1"
TARGET_DIR="$2"
LATEST="$3"
REPO="$4"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }

# --- Merge configs with yq ---
if command -v yq &>/dev/null; then
  # sources.yml: append new sources not present in user config (by name)
  for section in rss github_releases; do
    NEW_NAMES=$(yq ".$section[].name" "${NEW_DIR}/config/sources.yml" 2>/dev/null || true)
    for name in $NEW_NAMES; do
      EXISTS=$(yq ".$section[] | select(.name == \"$name\")" "${TARGET_DIR}/config/sources.yml" 2>/dev/null || true)
      if [ -z "$EXISTS" ]; then
        YQ_TMP=$(mktemp)
        yq ".$section[] | select(.name == \"$name\")" "${NEW_DIR}/config/sources.yml" > "$YQ_TMP"
        yq -i ".$section += [load(\"$YQ_TMP\")]" "${TARGET_DIR}/config/sources.yml"
        rm -f "$YQ_TMP"
        info "Added new source: $name"
      fi
    done
  done

  # delivery.yml: add new keys, preserve existing values
  NEW_KEYS=$(yq 'keys | .[]' "${NEW_DIR}/config/delivery.yml" 2>/dev/null || true)
  for key in $NEW_KEYS; do
    EXISTS=$(yq ".$key" "${TARGET_DIR}/config/delivery.yml" 2>/dev/null || true)
    if [ "$EXISTS" = "null" ] || [ -z "$EXISTS" ]; then
      VALUE=$(yq ".$key" "${NEW_DIR}/config/delivery.yml")
      yq -i ".$key = \"$VALUE\"" "${TARGET_DIR}/config/delivery.yml"
      info "Added new config key: $key = $VALUE"
    fi
  done
else
  warn "yq not found — skipping config merge, configs unchanged"
fi

# --- Replace non-config files ---
cp -r "${NEW_DIR}/.claude/skills/"* "${TARGET_DIR}/.claude/skills/"
info "Skills updated"

cp "${NEW_DIR}/.claude/settings.json" "${TARGET_DIR}/.claude/settings.json"
info "settings.json updated"

cp "${NEW_DIR}/run.sh" "${TARGET_DIR}/run.sh"
chmod +x "${TARGET_DIR}/run.sh"
info "run.sh updated"

cp "${NEW_DIR}/install.sh" "${TARGET_DIR}/install.sh"
chmod +x "${TARGET_DIR}/install.sh"
info "install.sh updated"

cp "${NEW_DIR}/README.md" "${TARGET_DIR}/README.md"
info "README.md updated"

cp "${NEW_DIR}/.version" "${TARGET_DIR}/.version"
info "Version updated to v${LATEST}"

# --- Pull new Docker image ---
if command -v docker &>/dev/null; then
  echo "Pulling Docker image v${LATEST}..."
  docker pull "ghcr.io/${REPO}:${LATEST}" || docker pull "ghcr.io/${REPO}:latest"
  info "Docker image updated"
else
  warn "docker not found — skipping image pull"
fi

# Cleanup
rm -rf "$(dirname "$0")"

echo ""
echo -e "${GREEN}Updated to v${LATEST}!${NC}"
HELPER

  chmod +x "${UPDATE_TMPDIR}/apply-update.sh"
  exec "${UPDATE_TMPDIR}/apply-update.sh" "${NEW_DIR}" "${SCRIPT_DIR}" "${LATEST}" "${REPO}"
fi

# --- Default: run digest ---
LOGS_DIR="${SCRIPT_DIR}/logs"
mkdir -p "$LOGS_DIR"

LOGFILE="${LOGS_DIR}/$(date +%Y-%m-%d).md"
START_TIME=$(date +%s)

claude -p "Run /ai-digest skill" \
  --model sonnet \
  --max-turns 30 \
  --allowedTools "Read,Write,Bash(scripts/*),Agent,mcp__ai-digest-mcp__fetch_rss,mcp__ai-digest-mcp__fetch_all_rss,mcp__ai-digest-mcp__fetch_github_releases,mcp__ai-digest-mcp__validate_sources" \
  2>&1 | tee -a "$LOGFILE" &

CLAUDE_PID=$!

tail -f "$LOGFILE" 2>/dev/null &
TAIL_PID=$!

wait $CLAUDE_PID
EXIT_CODE=$?

kill $TAIL_PID 2>/dev/null || true

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "Exit code: ${EXIT_CODE}, Time: ${ELAPSED}s"
echo "Log: ${LOGFILE}"
```

- [ ] **Step 3: Verify syntax**

Run: `bash -n scripts/run.sh && echo "syntax ok"`

Expected: `syntax ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/run.sh
git commit -m "feat: add update subcommand to run.sh with safe self-update"
```

---

### Task 5: Create CI workflow (`.github/workflows/ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`
- Delete: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: ['**']
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: kalinichenko88/ai-digest

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Biome check
        run: npx biome check

      - name: Run tests
        run: npm test

  docker:
    name: Build & Push Docker Image
    needs: quality
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
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
            type=semver,pattern={{major}}
            type=raw,value=latest

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  release:
    name: Build & Publish Release
    needs: [quality, docker]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: echo "version=${GITHUB_REF_NAME#v}" >> "$GITHUB_OUTPUT"

      - name: Build release archive
        run: ./scripts/build-archive.sh "${{ steps.version.outputs.version }}"

      - name: Upload archive to release
        run: gh release upload "${{ github.ref_name }}" "ai-digest-v${{ steps.version.outputs.version }}.tar.gz" --clobber
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload install.sh to release
        run: gh release upload "${{ github.ref_name }}" scripts/install.sh --clobber
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish release (remove draft)
        run: gh release edit "${{ github.ref_name }}" --draft=false
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Note: `install.sh` is uploaded as a separate asset so `curl | bash` can fetch it directly from the release.

- [ ] **Step 2: Delete old workflow**

Run: `rm .github/workflows/docker-publish.yml`

- [ ] **Step 3: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "valid yaml"`

Expected: `valid yaml`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git rm .github/workflows/docker-publish.yml
git commit -m "feat: replace docker-publish with ci.yml — quality checks + release pipeline"
```

---

### Task 6: Create `/release` skill

**Files:**
- Create: `.claude/skills/release/SKILL.md`

- [ ] **Step 1: Write `.claude/skills/release/SKILL.md`**

```markdown
---
name: release
description: Create a new release — bump version, tag, generate changelog, create GitHub Release
user_invocable: true
arguments:
  - name: version
    description: Semver version to release (e.g., 1.0.0)
    required: true
---

# Release

Create a new release for ai-digest.

## Prerequisites

Before starting, validate ALL of the following. Stop and report if any check fails:

1. Working tree is clean: `git status --porcelain` returns empty
2. Current branch is `main`: `git branch --show-current` returns `main`
3. Version `{version}` is valid semver (MAJOR.MINOR.PATCH)
4. Tag `v{version}` does not exist: `git tag -l "v{version}"` returns empty
5. `gh` CLI is authenticated: `gh auth status` succeeds

## Steps

### Step 1: Bump version

Update version in these files:
- `.version` — replace contents with `{version}`
- `package.json` — update `"version"` field to `"{version}"`
- `README.md` — update any version references

### Step 2: Commit and tag

```bash
git add .version package.json README.md
git commit -m "release: v{version}"
git tag "v{version}"
```

### Step 3: Generate release description

Determine previous tag:
```bash
git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo ""
```

If previous tag exists, analyze commits between tags:
```bash
git log {prev_tag}..v{version} --oneline
```

If no previous tag, analyze all commits:
```bash
git log --oneline
```

Group changes into categories:
- **Features** — new functionality (commits starting with `feat:`)
- **Fixes** — bug fixes (commits starting with `fix:`)
- **Improvements** — refactoring, performance, DX (commits starting with `refactor:`, `perf:`, `chore:`, `docs:`)

Write a concise, human-readable description. Include:
- Summary of what's new (2-3 sentences)
- Categorized list of changes
- Docker image tag: `ghcr.io/kalinichenko88/ai-digest:{version}`
- Install command: `curl -sL https://github.com/kalinichenko88/ai-digest/releases/latest/download/install.sh | bash`

### Step 4: Push

```bash
git push origin main
git push origin "v{version}"
```

### Step 5: Create draft GitHub Release

> **Note:** `gh release create` requires the tag to exist on remote, so push happens first.
> The race condition with CI is not a practical concern — CI queue latency ensures the draft release
> is created before CI reaches the artifact upload step.

```bash
gh release create "v{version}" \
  --title "v{version}" \
  --notes "<generated description>" \
  --draft
```

After push, CI will:
1. Run quality checks (biome + vitest)
2. Build and push Docker image to GHCR
3. Build release archive and attach to this release
4. Remove draft flag — release becomes public

### Step 6: Verify

Report to user:
- Release URL: `https://github.com/kalinichenko88/ai-digest/releases/tag/v{version}`
- CI status: `gh run list --limit 1`
- Remind: "CI will publish the release once quality checks and builds pass"
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/release/SKILL.md
git commit -m "feat: add /release skill for version management"
```

---

### Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current `CLAUDE.md`**

- [ ] **Step 2: Add `/release` to skills section**

Add to the `## Claude Code Skills` section:

```markdown
- `/release <version>` — Create a new release (bump version, tag, changelog, GitHub Release)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add /release skill to CLAUDE.md"
```

---

### Task 8: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current `README.md`**

- [ ] **Step 2: Add installation section**

Add a new section after the existing quick start (or replace it) covering the end-user installation flow:

**Quick Install:**
```bash
curl -sL https://github.com/kalinichenko88/ai-digest/releases/latest/download/install.sh | bash
```

**Manual Install:**
1. Download latest release from GitHub Releases
2. Unpack: `tar -xzf ai-digest-v*.tar.gz`
3. Run: `cd ai-digest && ./install.sh`

**Updating:**
```bash
./run.sh update
```

- [ ] **Step 3: Update version badge/references if they exist**

Check for hardcoded version strings and update pattern.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add end-user install/update instructions to README"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run quality checks**

```bash
npx biome check
npm test
```

Both must pass.

- [ ] **Step 2: Verify archive build**

```bash
./scripts/build-archive.sh 0.1.0
tar -tzf ai-digest-v0.1.0.tar.gz
rm ai-digest-v0.1.0.tar.gz
```

Verify all expected files present, no source files included.

- [ ] **Step 3: Verify install.sh syntax**

```bash
bash -n scripts/install.sh && echo "ok"
bash -n scripts/run.sh && echo "ok"
bash -n scripts/build-archive.sh && echo "ok"
```

- [ ] **Step 4: Review all changes**

```bash
git log --oneline v0.1.0..HEAD 2>/dev/null || git log --oneline
```

Verify commit history is clean and logical.
