#!/usr/bin/env bash
# Installs the release in NEW_DIR into the install in TARGET_DIR.
# run.sh update extracts the latest release into a temp folder and runs the
# apply-update.sh of that release, so the new version decides what it merges
# and copies. The run.sh that calls it can be older than this file: keep the
# four arguments (docs/adr/0002-run-the-update-helper-of-the-new-release.md).
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
# Only the Go yq (mikefarah): the Python yq of pip prints strings in quotes, which breaks the queries
if [[ "$(yq --version 2>/dev/null)" == *mikefarah* ]]; then
  # sources.yml: append the new sources that the user config does not have
  # rss holds mappings: match them by name
  for name in $(yq ".rss[].name" "${NEW_DIR}/config/sources.yml" 2>/dev/null || true); do
    EXISTS=$(yq ".rss[] | select(.name == \"$name\")" "${TARGET_DIR}/config/sources.yml" 2>/dev/null || true)
    if [ -z "$EXISTS" ]; then
      YQ_TMP=$(mktemp)
      yq ".rss[] | select(.name == \"$name\")" "${NEW_DIR}/config/sources.yml" > "$YQ_TMP"
      yq -i ".rss += [load(\"$YQ_TMP\")]" "${TARGET_DIR}/config/sources.yml"
      rm -f "$YQ_TMP"
      info "Added new source: $name"
    fi
  done
  # github_releases.repos holds plain strings: match them by value
  for repo in $(yq ".github_releases.repos[]" "${NEW_DIR}/config/sources.yml"); do
    if [ -z "$(yq ".github_releases.repos[] | select(. == \"$repo\")" "${TARGET_DIR}/config/sources.yml")" ]; then
      yq -i ".github_releases.repos += [\"$repo\"]" "${TARGET_DIR}/config/sources.yml"
      info "Added new source: $repo"
    fi
  done

  # delivery.yml needs no merge — loadDeliveryConfig defaults every key.
else
  warn "no yq of mikefarah/yq on PATH — skipping config merge, configs unchanged"
fi

# --- Replace non-config files ---
cp -r "${NEW_DIR}/.claude/skills/"* "${TARGET_DIR}/.claude/skills/"
info "Skills updated"

cp "${NEW_DIR}/.claude/settings.json" "${TARGET_DIR}/.claude/settings.json"
cp "${NEW_DIR}/.mcp.json" "${TARGET_DIR}/.mcp.json"
info "settings.json and .mcp.json updated"

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

echo ""
echo -e "${GREEN}Updated to v${LATEST}!${NC}"
