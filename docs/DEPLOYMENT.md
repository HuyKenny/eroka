# Deploy a přepnutí

## Worker eroka-img (fotky)
`npx wrangler deploy -c workers/img/wrangler.jsonc` (bez routy, pro staging/service binding) a v produkci
`--env production` (přidá routu `eroka.cz/img/*`). Musí existovat dřív než web (service binding `IMG`).

## Staging
`npx tsx scripts/deploy.ts --env staging [--secrets] [--no-import]` — záložka D1 Time Travel (do `backups/`),
migrace, import Worker, build (`CLOUDFLARE_ENV=staging`, `BUILD_ID=<git sha>`), kontrola tajemství, deploy, smoke test
se servisním tokenem Access. Data poprvé: `scripts/load-d1.sh staging <sql-dir>`, pak `POST /run/<n>` pro každý feed
a `POST /finalize`.

D1 `export` neumí databáze s FTS5 → zálohou je Time Travel: `wrangler d1 time-travel restore DB --env <env> --bookmark <b>`.

## Produkce — živě na eroka.cz od 27. 10. 2026 (jen se souhlasem Kennyho, `ERK_PRODUCTION_APPROVED=yes`)
**WordPress smazán 27. 10. 2026** (`bin/eroka-wp-smazat.py`, zálohy `backups/eroka-wp-final-*`, DNS Worker-only) → `rollback` už nemá kam vést.
Přepnutí/návrat: `scripts/cutover.py apply|rollback|status` (routy, WP Cache Rules ze zálohy
`backups/eroka-cf-zone-<datum>/cache-ruleset.json`, browser TTL, purge). Postup, který proběhl:
1. `scripts/load-d1.sh production <sql>` (čerstvý export z WP), `set-feed-secrets.py production`, deploy → test na
   `https://eroka.huy-kenny.workers.dev` (SEO parita, vizuál, `/go/` každého partnera, výkon).
2. Zóna eroka.cz: zálohovat a smazat Cache Rules z doby WP (vypínají Cache API Workeru), browser TTL = respektovat.
3. Routy `eroka.cz/*` a `www.eroka.cz/*` → Worker `eroka` přes CF API (smazání rout = okamžitý návrat na WP).
4. Purge zóny, kontrola `X-Eroka-Page-Cache: HIT`, GSC (property `https://eroka.cz/`) + odeslat sitemapu.
5. Po přepnutí: vypnout eroka v `bin/all-wp-cron.sh` a `bin/wp-udrzba.py`, hlídač `/api/health` (cron-job.org),
   týden GSC; WP smazat až po týdnu s finální zálohou a schválením.
