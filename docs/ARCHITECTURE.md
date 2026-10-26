# Architektura

```
eroka.cz/*, www → Worker "eroka" (Astro SSR, @astrojs/cloudflare 14.3.4)
  middleware.ts: host allow-list → Access (staging celý host) → www→apex → lomítko 301 → LEGACY 301
                 → D1 redirects → Cache API (klíč /__kc/<data_version>/<BUILD_ID>/<path>, TTL 600 s) → bezpečnostní hlavičky
  [...path].astro → lib/dispatch.ts: tabulka slugs (produkt > kategorie > článek > stránka > rubrika), /page/N/,
                    jinak odhad slugu (redirect_guess_404_permalink) → 404
  /znacka/<slug>/(page/N/)  /go/<slug>/ (302 z D1, allow-list hostů, boti 204, klik do D1)
  sitemap_index.xml + <rankmath-jméno>.xml ze site_cache, robots.txt, /feed/, /api/health
Worker "eroka-import" (cron */10 1–5 UTC): 1 feed za běh → finalizace dne (stale feedy, historie cen, sitemapy, data_version)
D1 eroka-production / eroka-staging (schéma migrations/0001, 0002)
```

## Datový model (D1)
- `slugs` — jeden lookup pro všechny URL v kořeni; kolize řeší migrace (`/pouta-na-ruce/` = produkt jako na WP).
- `products` — katalog 1:1 s WordPressem (ID a slugy zachované), denormalizované ceny (min/max/počet nabídek/
  nejlepší nabídka), přepočítává importér (`recomputeProducts`).
- `offers` — nabídky obchodů; `target_url` = finální affiliate URL vracená `/go/` byte po bytu, `go_slug` = starý
  slug Content Egg (staré odkazy fungují), `content_hash` = zápis jen při změně.
- `cat_products` — členství v kategorii rozbalené na všechny předky (WooCommerce archivy zahrnují podkategorie),
  klíč `(cat_id, created_at, product_id)` = výpis „od nejnovějších“ je jeden rozsah indexu.
- `posts` (články + stránky, HTML z `content.rendered`), `post_categories`, `comments` (jen čtení), `redirects`,
  `price_history` (denní minimum, jen změny), `clicks`, `site_cache` (sitemapy, `data_version`), `product_fts` (FTS5).

## Proč takhle
- Katalog je pevný (Kenny 26. 10.: 1:1 jako dnes) — feedy jen přidávají a obnovují nabídky existujících produktů.
- Obrázky produktů se hotlinkují jako na WP: proxy wsrv.nl erotické domény odmítá; Růžový slon má variantu
  `/product/detail/` (≤1000 px). Další krok by byly Cloudflare Image Transformations (placené).
- Uploads článků (497 souborů, 58 MB) jsou statické assety ve `public/wp-content/uploads/` (stejné URL jako na WP).
