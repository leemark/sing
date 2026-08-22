#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Running research agent (writes data.json, history.json, patches index.html)"
node scripts/research.mjs

if git diff --quiet data.json history.json index.html; then
  echo "==> No changes; nothing to commit."
  exit 0
fi

echo "==> Committing and pushing"
git add data.json history.json index.html
git commit -m "Research update: $(date -u +%Y-%m-%d)"
git push
echo "==> Done. Push will redeploy the site via GitHub Pages."
