#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Running research agent (writes data.json)"
node scripts/research.mjs

if git diff --quiet data.json; then
  echo "==> data.json unchanged; nothing to commit."
  exit 0
fi

echo "==> Committing and pushing"
git add data.json
git commit -m "Research update: $(date -u +%Y-%m-%d)"
git push
echo "==> Done. Push will redeploy the site via GitHub Pages."
