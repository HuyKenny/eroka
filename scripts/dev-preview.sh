#!/usr/bin/env bash
# Local preview of the built Worker over the local D1 (.wrangler/state) on port 8795 (8791 is kakapo's).
#   scripts/dev-preview.sh          → build + (re)start in the background, log tmp/eroka/dev.log in the workspace
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=8795
for p in $(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do kill "$p" || true; done
BUILD_ID="dev$(date +%s)" npx astro build >/dev/null
setsid npx wrangler dev -c dist/server/wrangler.json --local --persist-to .wrangler/state --port $PORT > ../../tmp/eroka/dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/robots.txt" && { echo "ready http://localhost:$PORT"; exit 0; }; sleep 1; done
echo "preview did not start, see tmp/eroka/dev.log"; exit 1
