# eroka.cz — Astro + Cloudflare

Srovnávač cen erotických pomůcek. Od 26. 10. 2026 převod z WordPressu (Rehub + WooCommerce + Content Egg na WEDOS)
na Astro SSR Worker + D1 — stejný vzor jako `apps/kakapo`. Podrobnosti v [`docs/`](docs/).

| Co | Kde |
|---|---|
| Web (Astro 7.3.8 SSR, Worker `eroka` / `eroka-staging`) | `src/`, `wrangler.jsonc` |
| Import nabídek z feedů (Worker `eroka-import`) | `workers/import/` |
| D1 schéma | `migrations/` |
| Převod z WordPressu | `scripts/export-from-wp.py` → `scripts/migrate-from-wp.py` → `scripts/load-d1.sh` |
| Deploy | `npx tsx scripts/deploy.ts --env staging [--secrets]` (produkce jen s `ERK_PRODUCTION_APPROVED=yes`) |
| SEO parita se živým webem | `python3 scripts/seo-parity.py <base>` |
| Lokální náhled | `scripts/dev-preview.sh` → http://localhost:8795 (port 8791 má kakapo) |

Přístupy: `credentials/.eroka-credentials.env` (účet, D1, Access AUD, soli, import secret),
`credentials/.eroka-feeds.json` (URL feedů s tokeny, CJ). Nic z toho nepatří do repa.
