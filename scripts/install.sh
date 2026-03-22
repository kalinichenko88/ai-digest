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
for cmd in docker claude yq; do
  if command -v "$cmd" &>/dev/null; then
    info "$cmd found"
  else
    warn "$cmd not found — install it before running ai-digest"
  fi
done

# --- Interactive setup ---
# Read from /dev/tty so prompts work even when piped (curl | bash)
echo ""

ask "Digest language [en]:"
read -r LANG_INPUT < /dev/tty
DIGEST_LANG="${LANG_INPUT:-en}"

ask "Output path for digests [~/digests]:"
read -r PATH_INPUT < /dev/tty
OUTPUT_PATH="${PATH_INPUT:-~/digests}"

ask "GitHub token (optional, press Enter to skip):"
read -r GH_TOKEN < /dev/tty

ask "Enable macOS notifications? [y/n, default: y]:"
read -r NOTIFY_INPUT < /dev/tty
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
