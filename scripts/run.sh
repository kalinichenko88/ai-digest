#!/usr/bin/env bash
set -euo pipefail

REPO="kalinichenko88/ai-digest"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Detect if running from archive root (run.sh next to .version) or repo (scripts/run.sh)
if [ -f "${SCRIPT_DIR}/.version" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
else
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
fi

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
  if [ ! -f "${PROJECT_DIR}/.version" ]; then
    error "No .version file found. Is this an ai-digest installation?"
  fi
  CURRENT="$(cat "${PROJECT_DIR}/.version")"

  # Fetch latest version (unauthenticated, with optional token)
  GITHUB_TOKEN_VAL=""
  if [ -f "${PROJECT_DIR}/.env" ]; then
    GITHUB_TOKEN_VAL=$(grep -E '^GITHUB_TOKEN=' "${PROJECT_DIR}/.env" 2>/dev/null | cut -d '=' -f2- || true)
  fi

  # Fetch latest release: token from .env → gh auth → unauthenticated curl
  if [ -n "${GITHUB_TOKEN_VAL}" ]; then
    RELEASE_JSON=$(curl -s -H "Authorization: token ${GITHUB_TOKEN_VAL}" "https://api.github.com/repos/${REPO}/releases/latest")
  elif command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    RELEASE_JSON=$(gh api "repos/${REPO}/releases/latest")
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

  # Download new release to temp (use UPDATE_TMPDIR to avoid shadowing POSIX TMPDIR)
  UPDATE_TMPDIR="$(mktemp -d)"
  ARCHIVE_URL=$(echo "${RELEASE_JSON}" | grep "browser_download_url.*tar.gz" | head -1 | cut -d '"' -f 4)

  if [ -z "${ARCHIVE_URL}" ]; then
    rm -rf "${UPDATE_TMPDIR}"
    error "Could not find release archive URL"
  fi

  echo "Downloading v${LATEST}..."
  curl -sL "${ARCHIVE_URL}" -o "${UPDATE_TMPDIR}/release.tar.gz"
  tar -xzf "${UPDATE_TMPDIR}/release.tar.gz" -C "${UPDATE_TMPDIR}"

  NEW_DIR="${UPDATE_TMPDIR}/ai-digest"

  if [ ! -d "${NEW_DIR}" ]; then
    rm -rf "${UPDATE_TMPDIR}"
    error "Unexpected archive layout: expected ai-digest/ directory"
  fi

  # Write helper script and exec into it (safe self-update)
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
      YQ_TMP=$(mktemp)
      yq ".$key" "${NEW_DIR}/config/delivery.yml" > "$YQ_TMP"
      yq -i ".$key = load(\"$YQ_TMP\")" "${TARGET_DIR}/config/delivery.yml"
      rm -f "$YQ_TMP"
      info "Added new config key: $key"
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

# Cleanup via trap (safe — avoids deleting script while running)
SELF_TMPDIR="$(dirname "$0")"
trap 'rm -rf "$SELF_TMPDIR"' EXIT

echo ""
echo -e "${GREEN}Updated to v${LATEST}!${NC}"
HELPER

  chmod +x "${UPDATE_TMPDIR}/apply-update.sh"
  exec "${UPDATE_TMPDIR}/apply-update.sh" "${NEW_DIR}" "${PROJECT_DIR}" "${LATEST}" "${REPO}"
fi

# --- Default: run digest ---
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).md"

mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

START_TIME=$(date +%s)

echo "[$(date '+%Y-%m-%d %H:%M')] Starting ai-digest run" >> "$LOG_FILE"

# Run Claude in background, append stdout to log
claude -p "Run ai-digest skill" \
  --model sonnet \
  --max-turns 30 \
  --allowedTools "Read" "Write" "Bash" "Agent" "mcp__ai-digest-mcp" \
  >> "$LOG_FILE" 2>&1 &

CLAUDE_PID=$!

# Stream log in real-time
tail -f "$LOG_FILE" &
TAIL_PID=$!

# Wait for Claude to finish, then stop tail
wait $CLAUDE_PID
EXIT_CODE=$?
kill $TAIL_PID 2>/dev/null

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))

echo "[$(date '+%Y-%m-%d %H:%M')] Finished with exit code $EXIT_CODE (${ELAPSED}s elapsed)" >> "$LOG_FILE"
echo "Done (${ELAPSED}s, exit code $EXIT_CODE)"
exit $EXIT_CODE
