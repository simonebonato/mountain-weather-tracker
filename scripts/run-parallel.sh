#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

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
  --tasks <file>       Read structured task blocks from a file
  --validate-only      Validate and print planned tasks without launching agents
  --no-review          Disable the reviewer stage
  --no-comment-status  Disable GitHub issue status comments
  --concurrency <n>    Max agents running at the same time (default: 1)
  --agent <name>       Agent to use in worktree mode: codex (default) or claude
  --model <model>      Claude model to use (default: claude-sonnet-4-6)
  --effort <level>     Thinking effort: low, normal, high (default: normal)
  -h, --help           Show this help

Examples:
  $(basename "$0") --from-issues
  $(basename "$0") --from-issues --label sandcastle --concurrency 2
  $(basename "$0") --tasks tasks.md --validate-only
  $(basename "$0") --tasks tasks.md --concurrency 2
  $(basename "$0") --from-issues --agent claude --concurrency 1
  $(basename "$0") --from-issues --agent claude --model claude-haiku-4-5-20251001 --effort low
EOF
  exit 1
}

FROM_ISSUES=false
LABEL="parallel"
TASKS_FILE=""
CONCURRENCY=1
AGENT="codex"
MODEL="gpt-5.3-codex"
EFFORT="normal"
VALIDATE_ONLY=false
NO_REVIEW=false
COMMENT_STATUS=true
ADAPT_ISSUES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-issues) FROM_ISSUES=true; shift ;;
    --label) LABEL="$2"; shift 2 ;;
    --tasks) TASKS_FILE="$2"; shift 2 ;;
    --validate-only) VALIDATE_ONLY=true; shift ;;
    --no-review) NO_REVIEW=true; shift ;;
    --no-comment-status) COMMENT_STATUS=false; shift ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --effort) EFFORT="$2"; shift 2 ;;
    --adapt-issues) ADAPT_ISSUES=true; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown flag: $1"; usage ;;
  esac
done

if ! $FROM_ISSUES && [[ -z "$TASKS_FILE" ]]; then
  usage
fi

if $ADAPT_ISSUES && ! $FROM_ISSUES; then
  echo "error: --adapt-issues requires --from-issues" >&2
  exit 1
fi

# --- Resolve task list ---
TASK_HEADINGS=()
TASK_SUMMARIES=()
TASK_FILES=()
TASK_FORBIDDEN=()
TASK_CHECKS=()
TASK_DONE=()
TASK_DETAILS=()
TASK_ISSUES=()
MISSING_FIELD="__RUN_PARALLEL_MISSING_FIELD__"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

task_count() {
  printf '%s' "${#TASK_HEADINGS[@]}"
}

set_task_field() {
  local index="$1"
  local field="$2"
  local value="$3"
  case "$field" in
    TASK) TASK_SUMMARIES[$index]="$value" ;;
    FILES) TASK_FILES[$index]="$value" ;;
    "DO NOT TOUCH") TASK_FORBIDDEN[$index]="$value" ;;
    CHECK) TASK_CHECKS[$index]="$value" ;;
    "DONE WHEN") TASK_DONE[$index]="$value" ;;
    DETAILS) TASK_DETAILS[$index]="$value" ;;
  esac
}

append_task_field() {
  local index="$1"
  local field="$2"
  local value="$3"
  local current
  case "$field" in
    TASK) current="${TASK_SUMMARIES[$index]:-}" ;;
    FILES) current="${TASK_FILES[$index]:-}" ;;
    "DO NOT TOUCH") current="${TASK_FORBIDDEN[$index]:-}" ;;
    CHECK) current="${TASK_CHECKS[$index]:-}" ;;
    "DONE WHEN") current="${TASK_DONE[$index]:-}" ;;
    DETAILS) current="${TASK_DETAILS[$index]:-}" ;;
    *) return ;;
  esac

  if [[ -n "$current" ]]; then
    set_task_field "$index" "$field" "${current}"$'\n'"${value}"
  else
    set_task_field "$index" "$field" "$value"
  fi
}

reparse_task_body() {
  local i="$1"
  local body="$2"
  local body_file line current_field=""
  body_file=$(mktemp)
  printf '%s\n' "$body" > "$body_file"

  TASK_SUMMARIES[$i]="$MISSING_FIELD"
  TASK_FILES[$i]="$MISSING_FIELD"
  TASK_FORBIDDEN[$i]="$MISSING_FIELD"
  TASK_CHECKS[$i]="$MISSING_FIELD"
  TASK_DONE[$i]="$MISSING_FIELD"
  TASK_DETAILS[$i]=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^##[[:space:]]+Task: ]] && { current_field=""; continue; }
    if [[ "$line" =~ ^(TASK|FILES|DO[[:space:]]+NOT[[:space:]]+TOUCH|CHECK|DONE[[:space:]]+WHEN|DETAILS):[[:space:]]*(.*)$ ]]; then
      current_field="${BASH_REMATCH[1]}"
      set_task_field "$i" "$current_field" "${BASH_REMATCH[2]}"
      continue
    fi
    [[ -n "$current_field" ]] && append_task_field "$i" "$current_field" "$line"
  done < "$body_file"
  rm -f "$body_file"
}

parse_task_blocks() {
  local input_file="$1"
  local line current_field=""
  local current_index=-1
  local current_issue=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^###[[:space:]]+RUNNER[[:space:]]+ISSUE[[:space:]]+([0-9]+)[[:space:]]*$ ]]; then
      current_issue="${BASH_REMATCH[1]}"
      continue
    fi

    if [[ "$line" =~ ^##[[:space:]]+Task:[[:space:]]*(.+)[[:space:]]*$ ]]; then
      TASK_HEADINGS+=("$(trim "${BASH_REMATCH[1]}")")
      TASK_SUMMARIES+=("$MISSING_FIELD")
      TASK_FILES+=("$MISSING_FIELD")
      TASK_FORBIDDEN+=("$MISSING_FIELD")
      TASK_CHECKS+=("$MISSING_FIELD")
      TASK_DONE+=("$MISSING_FIELD")
      TASK_DETAILS+=("")
      TASK_ISSUES+=("$current_issue")
      current_index=$((${#TASK_HEADINGS[@]} - 1))
      current_field=""
      continue
    fi

    if [[ $current_index -lt 0 ]]; then
      [[ -z "$(trim "$line")" || "$line" == \#* ]] && continue
      echo "error: content found before first '## Task:' heading: $line" >&2
      return 1
    fi

    if [[ "$line" =~ ^(TASK|FILES|DO[[:space:]]+NOT[[:space:]]+TOUCH|CHECK|DONE[[:space:]]+WHEN|DETAILS):[[:space:]]*(.*)$ ]]; then
      current_field="${BASH_REMATCH[1]}"
      set_task_field "$current_index" "$current_field" "${BASH_REMATCH[2]}"
      continue
    fi

    if [[ -n "$current_field" ]]; then
      append_task_field "$current_index" "$current_field" "$line"
      continue
    fi

    [[ -z "$(trim "$line")" ]] && continue
    echo "error: Task $((current_index + 1)) (${TASK_HEADINGS[$current_index]}): content must belong to a field: $line" >&2
    return 1
  done < "$input_file"
}

is_literal_command() {
  local command_text
  command_text="$(trim "$1")"
  [[ "$command_text" =~ ^[A-Za-z0-9_./-]+([[:space:]]|$) ]] || return 1
  [[ "$command_text" =~ ^(run|execute|perform|check|verify|make[[:space:]]+sure|ensure)([[:space:]]|$) ]] && return 1
  return 0
}

contains_glob_pattern() {
  local value="$1"
  [[ "$value" == *"*"* || "$value" == *"?"* || "$value" == *"["* || "$value" == *"]"* ]]
}

validate_task() {
  # Prints error lines for task i to stdout. Returns 1 if any errors found.
  local i="$1"
  local heading="${TASK_HEADINGS[$i]}"
  local errors=0 required value field

  if [[ -z "$(trim "$heading")" ]]; then
    echo "Task $((i + 1)): empty task heading"
    errors=$((errors + 1))
  fi

  for required in TASK FILES "DO NOT TOUCH" CHECK "DONE WHEN"; do
    case "$required" in
      TASK)           value="${TASK_SUMMARIES[$i]:-}" ;;
      FILES)          value="${TASK_FILES[$i]:-}" ;;
      "DO NOT TOUCH") value="${TASK_FORBIDDEN[$i]:-}" ;;
      CHECK)          value="${TASK_CHECKS[$i]:-}" ;;
      "DONE WHEN")    value="${TASK_DONE[$i]:-}" ;;
    esac
    field="$(trim "$value")"
    if [[ "$value" == "$MISSING_FIELD" ]]; then
      echo "Task $((i + 1)) ($heading): missing required field $required"
      errors=$((errors + 1))
    elif [[ -z "$field" ]]; then
      echo "Task $((i + 1)) ($heading): empty required field $required"
      errors=$((errors + 1))
    fi
  done

  if [[ "${TASK_CHECKS[$i]:-}" != "$MISSING_FIELD" && -n "$(trim "${TASK_CHECKS[$i]:-}")" ]] \
      && ! is_literal_command "${TASK_CHECKS[$i]}"; then
    echo "Task $((i + 1)) ($heading): CHECK must be a literal runnable command"
    errors=$((errors + 1))
  fi

  if contains_glob_pattern "${TASK_FILES[$i]:-}"; then
    echo "Task $((i + 1)) ($heading): FILES must use exact paths; glob support is future work"
    errors=$((errors + 1))
  fi

  if [[ "$(trim "${TASK_FORBIDDEN[$i]:-}")" != "none" ]] \
      && contains_glob_pattern "${TASK_FORBIDDEN[$i]:-}"; then
    echo "Task $((i + 1)) ($heading): DO NOT TOUCH must use exact paths; glob support is future work"
    errors=$((errors + 1))
  fi

  [[ $errors -eq 0 ]]
}

validate_task_blocks() {
  local errors=0 i task_errors

  if [[ $(task_count) -eq 0 ]]; then
    echo "error: no structured task blocks found. Start each task with '## Task:'." >&2
    return 1
  fi

  for i in "${!TASK_HEADINGS[@]}"; do
    if ! task_errors=$(validate_task "$i"); then
      printf '%s\n' "$task_errors" >&2
      errors=$((errors + 1))
    fi
  done

  [[ $errors -eq 0 ]]
}

call_claude_for_adaptation() {
  local i="$1"
  local validation_errors="$2"
  local current_body prompt
  current_body=$(format_task_block "$i")
  prompt="The following GitHub issue body does not conform to the required parallel runner task format.

Validation errors:
${validation_errors}

Current issue body:
${current_body}

Required format:
## Task: <short imperative heading>

TASK: <one-sentence summary>
FILES: <comma-separated exact file paths>
DO NOT TOUCH: <comma-separated exact file paths, or 'none'>
CHECK: <single literal runnable command>
DONE WHEN:
- <acceptance criterion>

Rules:
- Every field is required.
- FILES and DO NOT TOUCH must be exact paths, no globs.
- CHECK must be a literal runnable command, not prose.
- One task per issue.

Output ONLY the reformatted task block, nothing else."
  claude --dangerously-skip-permissions --model "$MODEL" --effort "$EFFORT" "$prompt" 2>/dev/null
}

adapt_invalid_issues() {
  local i task_errors issue heading answer adapted_body
  for i in "${!TASK_HEADINGS[@]}"; do
    if ! task_errors=$(validate_task "$i"); then
      issue="${TASK_ISSUES[$i]:-}"
      heading="${TASK_HEADINGS[$i]}"

      while true; do
        printf '%s\n' "$task_errors" >&2
        printf 'Adapt issue #%s ("%s")? [y/N] ' "$issue" "$heading"
        read -r answer
        if [[ ! "$answer" =~ ^[Yy]$ ]]; then
          echo "Aborted." >&2
          return 1
        fi

        adapted_body=$(call_claude_for_adaptation "$i" "$task_errors")
        printf '\n--- Reformatted task block ---\n%s\n--- End ---\n\n' "$adapted_body"

        printf 'Use this reformatted block? [y/N] '
        read -r answer
        if [[ ! "$answer" =~ ^[Yy]$ ]]; then
          continue
        fi

        gh issue edit "$issue" --body "$adapted_body"
        reparse_task_body "$i" "$adapted_body"

        if ! task_errors=$(validate_task "$i"); then
          continue
        fi

        printf 'Run issue #%s now? [y/N] ' "$issue"
        read -r answer
        break
      done
    fi
  done
}

format_task_block() {
  local i="$1"
  printf '## Task: %s\n\n' "${TASK_HEADINGS[$i]}"
  printf 'TASK: %s\n' "${TASK_SUMMARIES[$i]}"
  printf 'FILES: %s\n' "${TASK_FILES[$i]}"
  printf 'DO NOT TOUCH: %s\n' "${TASK_FORBIDDEN[$i]}"
  if [[ -n "$(trim "${TASK_DETAILS[$i]:-}")" ]]; then
    printf 'DETAILS: %s\n' "${TASK_DETAILS[$i]}"
  fi
  printf 'CHECK: %s\n' "${TASK_CHECKS[$i]}"
  printf 'DONE WHEN: %s\n' "${TASK_DONE[$i]}"
}

print_plan() {
  echo "Validated $(task_count) task(s)."
  for i in "${!TASK_HEADINGS[@]}"; do
    printf '%d. %s\n' "$((i + 1))" "${TASK_HEADINGS[$i]}"
    printf '   task: %s\n' "$(trim "${TASK_SUMMARIES[$i]}")"
    printf '   files: %s\n' "$(trim "${TASK_FILES[$i]}")"
    printf '   do not touch: %s\n' "$(trim "${TASK_FORBIDDEN[$i]}")"
    printf '   check: %s\n' "$(trim "${TASK_CHECKS[$i]}")"
  done
}

split_paths() {
  local value="$1"
  printf '%s\n' "$value" | tr ',' '\n' | while IFS= read -r path; do
    path="$(trim "$path")"
    [[ -n "$path" && "$path" != "none" ]] && printf '%s\n' "$path"
  done
}

path_in_list() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [[ "$needle" == "$item" ]] && return 0
  done
  return 1
}

changed_files() {
  git status --porcelain --untracked-files=all | while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    line="${line:3}"
    if [[ "$line" == *" -> "* ]]; then
      line="${line##* -> }"
    fi
    printf '%s\n' "$line"
  done
}

contract_rules() {
  cat <<'EOF'
Follow project instructions first.
Agents may read outside FILES for context.
Agents may only edit files listed in FILES.
Files listed in DO NOT TOUCH must not be edited.
Stop and report the needed task update if broader edit scope is required.
The runner owns checks, scope validation, commits, and GitHub status updates.
EOF
}

load_role_prompt() {
  local role="$1"
  local i="$2"
  local agents_dir="${RUNNER_AGENTS_DIR:-$SCRIPT_DIR/../agents}"
  local prompt_file="$agents_dir/${role}.md"
  if [[ ! -f "$prompt_file" ]]; then
    echo "error: role prompt file not found: $prompt_file" >&2
    exit 1
  fi
  local tb_file
  tb_file=$(mktemp)
  {
    contract_rules
    printf '\n'
    format_task_block "$i"
  } > "$tb_file"
  awk -v tb="$tb_file" '
    /\{\{TASK_BLOCK\}\}/ {
      while ((getline line < tb) > 0) print line
      next
    }
    { print }
  ' "$prompt_file"
  rm -f "$tb_file"
}

run_agent_stage() {
  local role="$1"
  local prompt="$2"
  export RUNNER_PARALLEL_STAGE="$role"
  if $use_sandcastle; then
    local prompt_file exit_code
    prompt_file=$(mktemp)
    printf '%s' "$prompt" > "$prompt_file"
    if [[ -n "${SANDCASTLE_RUNNER:-}" ]]; then
      SANDCASTLE_TASKS_FILE="$prompt_file" \
      SANDCASTLE_STAGE="$role" \
      SANDCASTLE_WORKDIR="$(pwd)" \
        bash -c "$SANDCASTLE_RUNNER"
    else
      SANDCASTLE_TASKS_FILE="$prompt_file" \
      SANDCASTLE_STAGE="$role" \
      SANDCASTLE_WORKDIR="$(pwd)" \
        "${SANDCASTLE_ROOT}/.sandcastle/node_modules/.bin/tsx" \
        "${SANDCASTLE_ROOT}/.sandcastle/run.ts"
    fi
    exit_code=$?
    rm -f "$prompt_file"
    return $exit_code
  elif [[ "$AGENT" == "claude" ]]; then
    claude --dangerously-skip-permissions --model "$MODEL" --effort "$EFFORT" "$prompt"
  else
    # shellcheck disable=SC2086
    codex $CODEX_AFK_FLAGS "$prompt"
  fi
}

validate_scope() {
  local heading="$1"
  local files_value="$2"
  local forbidden_value="$3"
  local changed file
  local allowed=()
  local forbidden=()
  while IFS= read -r file; do allowed+=("$file"); done < <(split_paths "$files_value")
  while IFS= read -r file; do forbidden+=("$file"); done < <(split_paths "$forbidden_value")

  while IFS= read -r changed; do
    [[ -z "$changed" ]] && continue
    if (( ${#forbidden[@]} > 0 )) && path_in_list "$changed" "${forbidden[@]}"; then
      echo "$heading: forbidden file modified: $changed" >&2
      return 1
    fi
    if ! path_in_list "$changed" "${allowed[@]}"; then
      echo "$heading: modified file outside FILES: $changed" >&2
      return 1
    fi
  done < <(changed_files)
}

commit_allowed_changes() {
  local heading="$1"
  local stage="$2"
  local files_value="$3"
  local file
  local allowed=()
  while IFS= read -r file; do allowed+=("$file"); done < <(split_paths "$files_value")
  for file in "${allowed[@]}"; do
    [[ -e "$file" || -d "$file" ]] && git add -- "$file"
  done
  if ! git diff --cached --quiet; then
    git commit -m "parallel-runner $stage: $heading"
  fi
}

run_task_check() {
  local command_text="$1"
  local log_file="$2"
  bash -lc "$command_text" >> "$log_file" 2>&1
}

post_issue_comment() {
  local issue="$1"
  local body="$2"
  if $FROM_ISSUES && $COMMENT_STATUS && [[ -n "$issue" ]]; then
    gh issue comment "$issue" --body "$body"
  fi
}

create_github_pr() {
  local issue="$1"
  local branch="$2"
  local heading="$3"
  local success="$4"
  [[ -n "$issue" ]] || return 0
  git push -u origin "$branch"
  if [[ "$success" == "true" ]]; then
    gh pr create --title "$heading" --body "Closes #$issue" --head "$branch"
  else
    gh pr create --draft --title "$heading" --body "Refs #$issue" --head "$branch"
  fi
}

has_pipeline_changes() {
  local base_ref="$1"
  ! git diff --quiet "$base_ref"..HEAD || [[ -n "$(changed_files)" ]]
}

run_task_pipeline() {
  local i="$1"
  local branch="$2"
  local log_file="$3"
  local heading="${TASK_HEADINGS[$i]}"
  local issue="${TASK_ISSUES[$i]:-}"
  local base_ref
  local failure_output
  base_ref=$(git rev-parse HEAD)

  post_issue_comment "$issue" "Started runner pipeline for '$heading' on branch '$branch'."

  echo "[$heading] implementer starting"
  if ! run_agent_stage "implementer" "$(load_role_prompt "implementer" "$i")" >> "$log_file" 2>&1; then
    echo "[$heading] implementer agent failed"
    post_issue_comment "$issue" "Implementer failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
    if has_pipeline_changes "$base_ref"; then
      create_github_pr "$issue" "$branch" "$heading" "false"
    fi
    return 1
  fi

  if ! failure_output=$(validate_scope "$heading" "${TASK_FILES[$i]}" "${TASK_FORBIDDEN[$i]}" 2>&1); then
    printf '%s\n' "$failure_output" | tee -a "$log_file"
    echo "[$heading] implementer scope failed"
    post_issue_comment "$issue" "Implementer scope validation failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
    if has_pipeline_changes "$base_ref"; then
      create_github_pr "$issue" "$branch" "$heading" "false"
    fi
    return 1
  fi

  if ! run_task_check "${TASK_CHECKS[$i]}" "$log_file"; then
    echo "[$heading] implementer check failed"
    post_issue_comment "$issue" "Implementer check failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
    if has_pipeline_changes "$base_ref"; then
      create_github_pr "$issue" "$branch" "$heading" "false"
    fi
    return 1
  fi

  if ! failure_output=$(validate_scope "$heading" "${TASK_FILES[$i]}" "${TASK_FORBIDDEN[$i]}" 2>&1); then
    printf '%s\n' "$failure_output" | tee -a "$log_file"
    echo "[$heading] implementer scope failed after check"
    post_issue_comment "$issue" "Implementer post-check scope validation failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
    if has_pipeline_changes "$base_ref"; then
      create_github_pr "$issue" "$branch" "$heading" "false"
    fi
    return 1
  fi

  commit_allowed_changes "$heading" "implementer" "${TASK_FILES[$i]}" >> "$log_file" 2>&1
  echo "[$heading] implementer passed"
  post_issue_comment "$issue" "Implementer passed for '$heading'."

  if ! $NO_REVIEW; then
    echo "[$heading] reviewer starting"
    if ! run_agent_stage "reviewer" "$(load_role_prompt "reviewer" "$i")" >> "$log_file" 2>&1; then
      echo "[$heading] reviewer agent failed"
      post_issue_comment "$issue" "Reviewer failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
      if has_pipeline_changes "$base_ref"; then
        create_github_pr "$issue" "$branch" "$heading" "false"
      fi
      return 1
    fi

    if ! failure_output=$(validate_scope "$heading" "${TASK_FILES[$i]}" "${TASK_FORBIDDEN[$i]}" 2>&1); then
      printf '%s\n' "$failure_output" | tee -a "$log_file"
      echo "[$heading] reviewer scope failed"
      post_issue_comment "$issue" "Reviewer scope validation failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
      if has_pipeline_changes "$base_ref"; then
        create_github_pr "$issue" "$branch" "$heading" "false"
      fi
      return 1
    fi

    if ! run_task_check "${TASK_CHECKS[$i]}" "$log_file"; then
      echo "[$heading] reviewer check failed"
      post_issue_comment "$issue" "Reviewer check failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
      if has_pipeline_changes "$base_ref"; then
        create_github_pr "$issue" "$branch" "$heading" "false"
      fi
      return 1
    fi

    if ! failure_output=$(validate_scope "$heading" "${TASK_FILES[$i]}" "${TASK_FORBIDDEN[$i]}" 2>&1); then
      printf '%s\n' "$failure_output" | tee -a "$log_file"
      echo "[$heading] reviewer scope failed after check"
      post_issue_comment "$issue" "Reviewer post-check scope validation failed for '$heading'. Branch: '$branch'. Log: '$log_file'."
      if has_pipeline_changes "$base_ref"; then
        create_github_pr "$issue" "$branch" "$heading" "false"
      fi
      return 1
    fi

    commit_allowed_changes "$heading" "reviewer" "${TASK_FILES[$i]}" >> "$log_file" 2>&1
    echo "[$heading] reviewer passed"
    post_issue_comment "$issue" "Reviewer passed for '$heading'."
  fi

  if $FROM_ISSUES; then
    create_github_pr "$issue" "$branch" "$heading" "true"
  fi
  echo "[$heading] pipeline passed"
}

if $FROM_ISSUES; then
  if ! command -v gh &>/dev/null; then
    echo "error: gh CLI not found. Install: https://cli.github.com"
    exit 1
  fi
  issues_tmp=$(mktemp)
  gh issue list --label "$LABEL" --state open --json number,body --jq '.[] | "### RUNNER ISSUE \(.number)\n\(.body)\n"' > "$issues_tmp"
  parse_task_blocks "$issues_tmp"
  rm -f "$issues_tmp"
  if [[ $(task_count) -eq 0 ]]; then
    echo "No open issues with label '$LABEL' found."
    exit 1
  fi
else
  parse_task_blocks "$TASKS_FILE"
fi

if ! validate_task_blocks; then
  if $ADAPT_ISSUES; then
    adapt_invalid_issues || exit 1
    validate_task_blocks
  else
    exit 1
  fi
fi

if $VALIDATE_ONLY; then
  print_plan
  exit 0
fi

# --- Validate role prompt files exist before confirming ---
agents_dir="${RUNNER_AGENTS_DIR:-$SCRIPT_DIR/../agents}"
for _role in implementer reviewer; do
  _prompt_file="$agents_dir/${_role}.md"
  if [[ ! -f "$_prompt_file" ]]; then
    echo "error: role prompt file not found: $_prompt_file" >&2
    exit 1
  fi
done
unset _role _prompt_file

# --- Show tasks and confirm ---
echo ""
echo "Tasks to run ($(task_count), concurrency: $CONCURRENCY):"
for i in "${!TASK_HEADINGS[@]}"; do
  printf "  %d. %s\n" "$((i+1))" "${TASK_HEADINGS[$i]}"
  printf "     files: %s\n" "$(trim "${TASK_FILES[$i]}")"
  printf "     check: %s\n" "$(trim "${TASK_CHECKS[$i]}")"
done
echo ""
read -rp "Confirm? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
echo ""

# --- Detect execution mode ---
use_sandcastle=false
if [[ "${SANDCASTLE_FORCE:-false}" == "true" ]]; then
  use_sandcastle=true
elif [[ "$AGENT" == "codex" ]] && command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  if [[ -f ".sandcastle/run.ts" && -f ".sandcastle/package.json" ]]; then
    use_sandcastle=true
  else
    echo "Docker available but .sandcastle/run.ts or package.json not found — falling back to worktree mode."
  fi
fi

# --- Sandcastle setup (if applicable) ---
if $use_sandcastle && [[ -z "${SANDCASTLE_RUNNER:-}" ]]; then
  echo "Sandcastle mode active. Preparing Docker environment..."
  if [[ ! -f ".sandcastle/node_modules/.bin/tsx" ]]; then
    echo "Installing .sandcastle dependencies (first run)..."
    npm install --prefix .sandcastle --silent
  fi
  if ! docker image inspect "sandcastle:$(basename "$(pwd)")" &>/dev/null 2>&1; then
    echo "Building Docker image (first run)..."
    .sandcastle/node_modules/.bin/sandcastle docker build-image
  fi
fi

# --- Worktree path ---
echo "Running via git worktrees..."
BASE_BRANCH=$(git rev-parse --abbrev-ref HEAD)
SANDCASTLE_ROOT="$(pwd)"
WORKTREE_ROOT=".worktrees"
mkdir -p "$WORKTREE_ROOT"

declare -a PIDS=()
declare -a BRANCHES=()

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' \
    | sed 's/-\+/-/g' | sed 's/^-//;s/-$//' | cut -c1-40
}

for i in "${!TASK_HEADINGS[@]}"; do
  # Respect concurrency limit before launching the next agent
  while [[ $(jobs -r | wc -l | tr -d ' ') -ge $CONCURRENCY ]]; do
    sleep 1
  done

  slug=$(slugify "${TASK_HEADINGS[$i]}")
  if [[ -n "${TASK_ISSUES[$i]:-}" ]]; then
    branch="parallel/issue-${TASK_ISSUES[$i]}-${slug}"
    worktree_path="${WORKTREE_ROOT}/issue-${TASK_ISSUES[$i]}-${slug}"
  else
    branch="parallel/${slug}"
    worktree_path="${WORKTREE_ROOT}/${slug}"
  fi
  log_path="$(pwd)/${WORKTREE_ROOT}/${slug}.log"
  BRANCHES+=("$branch")

  git worktree add -b "$branch" "$worktree_path" "$BASE_BRANCH" 2>/dev/null \
    || git worktree add "$worktree_path" "$branch"

  (
    cd "$worktree_path"
    run_task_pipeline "$i" "$branch" "$log_path"
  ) &

  PIDS+=($!)
  echo "  started: $branch  (pid $!  log: $log_path)"
done

# --- Wait for all agents ---
echo ""
echo "Waiting for all agents to finish..."
failed=0
for i in "${!PIDS[@]}"; do
  if ! wait "${PIDS[$i]}"; then
    echo "  FAILED: ${BRANCHES[$i]}"
    echo "    log: ${WORKTREE_ROOT}/$(slugify "${TASK_HEADINGS[$i]}").log"
    failed=$((failed + 1))
  else
    echo "  PASSED: ${BRANCHES[$i]}"
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
[[ $failed -gt 0 ]] && exit 1
exit 0
