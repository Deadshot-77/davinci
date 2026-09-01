#!/usr/bin/env bash
M="/x/Projects/xpandrix-playground/davinci/evals/.measure"
P="X:/Projects/xpandrix-playground/davinci"
cd "$M/proj" || exit 1
export CLAUDE_CODE_FORK_SUBAGENT=0
export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0

run () {
  local label="$1"; shift
  local prompt="$1"
  echo "=== $label starting $(date +%H:%M:%S) ==="
  claude -p "$prompt"     --plugin-dir "$P"     --settings "$(cat "$M/settings.json")"     --permission-mode acceptEdits     --output-format stream-json --verbose     > "$M/$label.jsonl" 2> "$M/$label.err"
  echo "=== $label done exit=$? $(date +%H:%M:%S) ==="
}

run run1 "/davinci:build Add a short services section under the heading listing three services, and give the page a stylesheet so it is not unstyled. Two slices is right: the section first, then the styling."
run run2 "/davinci:build continue"
echo ALLDONE
