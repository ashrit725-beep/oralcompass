#!/usr/bin/env bash
# PostToolUse hook: whenever Claude edits user-facing copy or templates, run the advice linter and surface violations.
# Reads the tool input JSON from stdin (Claude Code hook protocol) and lints the touched file if it is a copy/template source.
set -euo pipefail
input="$(cat || true)"
file="$(printf '%s' "$input" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))
except Exception: print("")' 2>/dev/null || true)"
case "$file" in
  *web/src/lib/copy.ts|*api/app/templates*|*notifications*|*copy*.ts|*fixtures/plans/*.json)
    if ! python3 tools/advice_lint.py "$file" >/tmp/oralcompass_lint.out 2>&1; then
      echo "ADVICE LINT FAILED for $file — rewrite as information, not advice:" >&2
      cat /tmp/oralcompass_lint.out >&2
      exit 2
    fi ;;
esac
exit 0
