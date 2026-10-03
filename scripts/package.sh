#!/usr/bin/env bash
# Package the repository for handoff: excludes node_modules, build output, caches, virtual environments, secrets and local data.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-OralCompass-codeLinc11.zip}"
rm -f "$OUT"
zip -qr "$OUT" . \
  -x "*/node_modules/*" "*/dist/*" "*/.vite/*" "*/__pycache__/*" "*/.pytest_cache/*" "*.pyc" "*/.venv/*" "*/venv/*" \
     "*.env" "*/.env.*" "*/shots/*" "*/.DS_Store" "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
