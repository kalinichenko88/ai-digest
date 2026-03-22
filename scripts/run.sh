#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
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
