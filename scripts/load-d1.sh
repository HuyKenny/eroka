#!/usr/bin/env bash
# Loads the WordPress export SQL (scripts/migrate-from-wp.py output) into a D1 database.
#   scripts/load-d1.sh local   <sql-dir>    → local miniflare D1 (.wrangler/state), recreated from scratch
#   scripts/load-d1.sh staging <sql-dir>    → remote eroka-staging (schema must be fresh: migrations apply first)
# Production is loaded only at the cutover and needs ERK_PRODUCTION_APPROVED=yes.
set -euo pipefail
target="${1:?local|staging|production}"; dir="$(realpath "${2:?sql dir}")"
cd "$(dirname "$0")/.."
case "$target" in
  local)
    rm -rf .wrangler/state/v3/d1
    npx wrangler d1 migrations apply DB --local --persist-to .wrangler/state >/dev/null
    for f in "$dir"/*.sql; do npx wrangler d1 execute DB --local --persist-to .wrangler/state --file "$f" >/dev/null || { echo "CHYBA $f"; exit 1; }; done ;;
  staging|production)
    if [ "$target" = production ] && [ "${ERK_PRODUCTION_APPROVED:-}" != yes ]; then echo "production needs ERK_PRODUCTION_APPROVED=yes"; exit 2; fi
    for f in "$dir"/*.sql; do
      for try in 1 2 3; do
        CLOUDFLARE_ENV=$target npx wrangler d1 execute DB --env "$target" --remote --yes --file "$f" >/dev/null 2>&1 && break
        [ $try = 3 ] && { echo "CHYBA $f"; exit 1; }; sleep 5
      done
      echo "ok $f"
    done ;;
  *) echo "neznámý cíl $target"; exit 2 ;;
esac
npx wrangler d1 execute DB ${target/local/--local} $( [ "$target" = local ] && echo "--persist-to .wrangler/state" || echo "--env $target --remote" ) --json \
  --command "SELECT (SELECT COUNT(*) FROM products) products, (SELECT COUNT(*) FROM offers) offers, (SELECT COUNT(*) FROM posts) posts" | grep -A5 '"results"'
