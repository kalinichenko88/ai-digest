#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-archive.sh <version>}"
ARCHIVE_NAME="ai-digest-v${VERSION}.tar.gz"
OUT_DIR="$(pwd)"
STAGING_DIR="$(mktemp -d)"
TARGET="${STAGING_DIR}/ai-digest"

# Copy from the repo, wherever this is called from; the archive goes to the current folder
cd "$(dirname "$0")/.."

mkdir -p "${TARGET}/.claude/skills"
mkdir -p "${TARGET}/config"

# Skills
cp -r .claude/skills/ai-digest "${TARGET}/.claude/skills/"
cp -r .claude/skills/add-source "${TARGET}/.claude/skills/"
cp -r .claude/skills/validate-sources "${TARGET}/.claude/skills/"

# Claude Code settings, and the MCP server, which Claude Code reads from .mcp.json
cp .claude/settings.json "${TARGET}/.claude/"
cp .mcp.json "${TARGET}/.mcp.json"

# Config templates
cp config/sources.yml "${TARGET}/config/"
cp config/delivery.yml "${TARGET}/config/"

# Scripts and root files
cp scripts/install.sh "${TARGET}/install.sh"
cp scripts/run.sh "${TARGET}/run.sh"
# run.sh update runs the apply-update.sh of the release it downloads
cp scripts/apply-update.sh "${TARGET}/apply-update.sh"
cp .env.example "${TARGET}/.env.example"
cp .version "${TARGET}/.version"
cp CHANGELOG.md "${TARGET}/CHANGELOG.md"
cp CLAUDE.md "${TARGET}/CLAUDE.md"
cp README.md "${TARGET}/README.md"

# Make scripts executable
chmod +x "${TARGET}/run.sh" "${TARGET}/install.sh"

# Create archive
tar -czf "${OUT_DIR}/${ARCHIVE_NAME}" -C "${STAGING_DIR}" ai-digest

# Cleanup
rm -rf "${STAGING_DIR}"

echo "${ARCHIVE_NAME}"
