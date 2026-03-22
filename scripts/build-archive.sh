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
