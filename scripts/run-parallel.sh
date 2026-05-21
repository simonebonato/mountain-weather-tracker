#!/usr/bin/env bash
set -euo pipefail

# Codex flags for unattended runs.
# If your codex version supports --approval-policy, set it here, e.g.:
#   CODEX_AFK_FLAGS="--approval-policy always"
CODEX_AFK_FLAGS=""

usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  --from-issues        Read tasks from open GitHub issues
  --label <label>      Filter issues by label (default: parallel)
  --tasks <file>       Read tasks from a file (one per line, # = comment)
  --concurrency <n>    Max agents running at the same time (default: 3)
  --agent <name>       Agent to use in worktree mode: codex (default) or claude
  -h, --help           Show this help

Examples:
  $(basename "$0") --from-issues
  $(basename "$0") --from-issues --label sandcastle --concurrency 2
  $(basename "$0") --tasks tasks.md --concurrency 5
  $(basename "$0") --from-issues --agent claude --concurrency 1
EOF
  exit 1
}

FROM_ISSUES=false
LABEL="parallel"
TASKS_FILE=""
CONCURRENCY=3
AGENT="codex"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-issues) FROM_ISSUES=true; shift ;;
    --label) LABEL="$2"; shift 2 ;;
    --tasks) TASKS_FILE="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown flag: $1"; usage ;;
  esac
done

if ! $FROM_ISSUES && [[ -z "$TASKS_FILE" ]]; then
  usage
fi

# --- Resolve task list ---
TASKS=()

if $FROM_ISSUES; then
  if ! command -v gh &>/dev/null; then
    echo "error: gh CLI not found. Install: https://cli.github.com"
    exit 1
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && TASKS+=("$line")
  done < <(gh issue list --label "$LABEL" --state open --json number,title \
             --jq '.[] | "#\(.number) \(.title)"')
  if [[ ${#TASKS[@]} -eq 0 ]]; then
    echo "No open issues with label '$LABEL' found."
    exit 1
  fi
else
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    TASKS+=("$line")
  done < "$TASKS_FILE"
  if [[ ${#TASKS[@]} -eq 0 ]]; then
    echo "No tasks found in $TASKS_FILE."
    exit 1
  fi
fi

# --- Show tasks and confirm ---
echo ""
echo "Tasks to run in parallel (${#TASKS[@]}):"
for i in "${!TASKS[@]}"; do
  printf "  %d. %s\n" "$((i+1))" "${TASKS[$i]}"
done
echo ""
read -rp "Confirm? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# --- Detect execution mode ---
use_sandcastle=false
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  if [[ -f ".sandcastle/run.ts" && -f ".sandcastle/package.json" ]]; then
    use_sandcastle=true
  else
    echo "Docker available but .sandcastle/run.ts or package.json not found — falling back to worktree mode."
  fi
fi

# --- Sandcastle path ---
if $use_sandcastle; then
  echo "Docker detected. Running via sandcastle..."

  # Install deps on first use
  if [[ ! -f ".sandcastle/node_modules/.bin/tsx" ]]; then
    echo "Installing .sandcastle dependencies (first run)..."
    npm install --prefix .sandcastle --silent
  fi

  # Build Docker image on first use (bakes in host UID/GID)
  if ! docker image inspect "sandcastle:$(basename "$(pwd)")" &>/dev/null 2>&1; then
    echo "Building Docker image (first run)..."
    .sandcastle/node_modules/.bin/sandcastle docker build-image
  fi

  TASKS_FILE_TMP=$(mktemp)
  printf '%s\n' "${TASKS[@]}" > "$TASKS_FILE_TMP"
  SANDCASTLE_TASKS_FILE="$TASKS_FILE_TMP" \
  SANDCASTLE_CONCURRENCY="$CONCURRENCY" \
    .sandcastle/node_modules/.bin/tsx .sandcastle/run.ts
  rm -f "$TASKS_FILE_TMP"
  exit 0
fi

# --- Worktree path ---
echo "Running via git worktrees..."
BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD)
WORKTREE_ROOT=".worktrees"
mkdir -p "$WORKTREE_ROOT"

declare -a PIDS=()
declare -a BRANCHES=()

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' \
    | sed 's/-\+/-/g' | sed 's/^-//;s/-$//' | cut -c1-40
}

for task in "${TASKS[@]}"; do
  # Respect concurrency limit before launching the next agent
  while [[ $(jobs -r | wc -l | tr -d ' ') -ge $CONCURRENCY ]]; do
    sleep 1
  done

  slug=$(slugify "$task")
  branch="parallel/${slug}"
  worktree_path="${WORKTREE_ROOT}/${slug}"
  BRANCHES+=("$branch")

  git worktree add -b "$branch" "$worktree_path" "$BASE_BRANCH" 2>/dev/null \
    || git worktree add "$worktree_path" "$branch"

  (
    cd "$worktree_path"
    if [[ "$AGENT" == "claude" ]]; then
      claude "$task"
    else
      # shellcheck disable=SC2086
      codex $CODEX_AFK_FLAGS "$task"
    fi
  ) >> "${WORKTREE_ROOT}/${slug}.log" 2>&1 &

  PIDS+=($!)
  echo "  started: $branch  (pid $!  log: ${WORKTREE_ROOT}/${slug}.log)"
done

# --- Wait for all agents ---
echo ""
echo "Waiting for all agents to finish..."
failed=0
for i in "${!PIDS[@]}"; do
  if ! wait "${PIDS[$i]}"; then
    echo "  FAILED: ${BRANCHES[$i]}"
    failed=$((failed + 1))
  fi
done

echo ""
[[ $failed -gt 0 ]] && echo "$failed task(s) failed. Check logs in $WORKTREE_ROOT/."

echo "Done. Review branches:"
for branch in "${BRANCHES[@]}"; do
  echo "  git checkout $branch"
done
echo ""
echo "Clean up worktrees after review:  git worktree prune"
