// Nightly precomputation for the redesigned listings and homepage (finalizeDay, after price history):
//  1. discount (the best offer's old price from the feed) and popularity
//  2. sort keys copied into cat_products (every sort is an index range scan)
//  3. filter facets per category / brand (brands, shops, params, price range) → site_cache 'f:<cat>' / 'fb:<brand>'
//  4. homepage blocks (deals, popular, brands, shops) → 'home'; one product photo per category → 'cats:img'
// Facet counts are for the unfiltered listing (as on most comparison sites); filtered results are counted live.

const put = (db: D1Database, key: string, value: string, now: string) =>
  db.prepare('INSERT INTO site_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(key, value, now);

type Facet = { n: number; lo: number; hi: number; st: number; d: number; b: Array<[number, number]>; s: Array<[string, number]>; p: Record<string, Array<[string, number]>>; c?: Array<[number, number]> };
const empty = (): Facet => ({ n: 0, lo: 0, hi: 0, st: 0, d: 0, b: [], s: [], p: {} });

/** numeric params are bucketed for filters; the bucket ids are shared with src/lib/params.ts */
export const BUCKETS: Record<string, Array<[string, number, number]>> = {
  delka: [['do-12', 0, 12], ['12-16', 12, 16], ['16-20', 16, 20], ['nad-20', 20, 999]],
  prumer: [['do-3', 0, 3], ['3-4', 3, 4], ['4-5', 4, 5], ['nad-5', 5, 999]],
};
const bucketCase = (k: string) => `CASE ${BUCKETS[k]!.map(([id, a, b]) => `WHEN CAST(pp.value AS REAL) >= ${a} AND CAST(pp.value AS REAL) < ${b} THEN '${id}'`).join(' ')} END`;

export async function rebuildFacets(db: D1Database, day: string): Promise<Record<string, number>> {
  const clicksSince = new Date(Date.parse(day) - 30 * 86400_000).toISOString().slice(0, 10) + ' 00:00:00';
  // 1. discount + popularity
  // only the shop's own old price counts: the daily minimum moves whenever an offer appears or disappears, so a
  // "drop" against price history is no discount (27. 10.: history-based values gave dozens of false −80 %)
  await db.prepare(`UPDATE products SET disc_pct = MIN(70,
      COALESCE((SELECT CAST(ROUND((o.price_old - o.price) * 100.0 / o.price_old) AS INTEGER) FROM offers o WHERE o.id = products.best_offer_id AND o.active = 1 AND o.price_old > o.price), 0))`).run();
  await db.prepare("UPDATE products SET disc_pct = 0 WHERE disc_pct < 3 OR min_price = 0").run();
  await db.prepare(`WITH c AS (SELECT product_id, COUNT(*) AS n FROM clicks WHERE clicked_at >= ? GROUP BY product_id)
    UPDATE products SET pop = total_sales * 5 + shop_count * 3 + in_stock * 5 + 20 * COALESCE((SELECT n FROM c WHERE c.product_id = products.id), 0)`).bind(clicksSince).run();
  // 2. sort keys
  await db.prepare(`UPDATE cat_products SET
      min_price = (SELECT p.min_price FROM products p WHERE p.id = cat_products.product_id),
      pop = (SELECT p.pop FROM products p WHERE p.id = cat_products.product_id),
      disc = (SELECT p.disc_pct FROM products p WHERE p.id = cat_products.product_id)`).run();

  // 3. facets
  const all = async <T>(sql: string, ...b: unknown[]) => (await db.prepare(sql).bind(...b).all<T>()).results;
  const base = `FROM cat_products x JOIN products p ON p.id = x.product_id WHERE p.status = 'publish'`;
  const [stats, brands, shops, params, nums, bstats, bcats, bshops] = await Promise.all([
    all<{ id: number; n: number; lo: number; hi: number; st: number; d: number }>(`SELECT x.cat_id AS id, COUNT(*) AS n, MIN(NULLIF(p.min_price, 0)) AS lo, MAX(p.min_price) AS hi, SUM(p.in_stock) AS st, SUM(p.disc_pct >= 10) AS d ${base} GROUP BY x.cat_id`),
    all<{ id: number; k: number; n: number }>(`SELECT x.cat_id AS id, p.brand_id AS k, COUNT(*) AS n ${base} AND p.brand_id > 0 GROUP BY x.cat_id, p.brand_id`),
    all<{ id: number; k: string; n: number }>(`SELECT x.cat_id AS id, o.domain AS k, COUNT(DISTINCT x.product_id) AS n FROM cat_products x JOIN offers o ON o.product_id = x.product_id AND o.active = 1 GROUP BY x.cat_id, o.domain`),
    all<{ id: number; k: string; v: string; n: number }>(`SELECT x.cat_id AS id, pp.key AS k, pp.value AS v, COUNT(*) AS n FROM cat_products x JOIN product_params pp ON pp.product_id = x.product_id WHERE pp.key NOT IN ('delka','prumer') GROUP BY x.cat_id, pp.key, pp.value`),
    all<{ id: number; k: string; v: string; n: number }>(`SELECT x.cat_id AS id, pp.key AS k, ${bucketCase('delka')} AS v, COUNT(*) AS n FROM cat_products x JOIN product_params pp ON pp.product_id = x.product_id WHERE pp.key = 'delka' GROUP BY x.cat_id, v
      UNION ALL SELECT x.cat_id AS id, pp.key AS k, ${bucketCase('prumer')} AS v, COUNT(*) AS n FROM cat_products x JOIN product_params pp ON pp.product_id = x.product_id WHERE pp.key = 'prumer' GROUP BY x.cat_id, v`),
    all<{ id: number; n: number; lo: number; hi: number; st: number; d: number }>(`SELECT brand_id AS id, COUNT(*) AS n, MIN(NULLIF(min_price, 0)) AS lo, MAX(min_price) AS hi, SUM(in_stock) AS st, SUM(disc_pct >= 10) AS d FROM products WHERE status = 'publish' AND brand_id > 0 GROUP BY brand_id`),
    all<{ id: number; k: number; n: number }>(`SELECT p.brand_id AS id, x.cat_id AS k, COUNT(*) AS n ${base} AND x.direct = 1 AND p.brand_id > 0 GROUP BY p.brand_id, x.cat_id`),
    all<{ id: number; k: string; n: number }>(`SELECT p.brand_id AS id, o.domain AS k, COUNT(DISTINCT p.id) AS n FROM products p JOIN offers o ON o.product_id = p.id AND o.active = 1 WHERE p.brand_id > 0 GROUP BY p.brand_id, o.domain`),
  ]);
  const cat = new Map<number, Facet>();
  const fc = (id: number) => cat.get(id) ?? cat.set(id, empty()).get(id)!;
  for (const r of stats) Object.assign(fc(r.id), { n: r.n, lo: Math.floor(r.lo ?? 0), hi: Math.ceil(r.hi ?? 0), st: r.st ?? 0, d: r.d ?? 0 });
  for (const r of brands) fc(r.id).b.push([r.k, r.n]);
  for (const r of shops) fc(r.id).s.push([r.k, r.n]);
  for (const r of [...params, ...nums]) if (r.v) (fc(r.id).p[r.k] ??= []).push([r.v, r.n]);
  const brand = new Map<number, Facet>();
  const fb = (id: number) => brand.get(id) ?? brand.set(id, { ...empty(), c: [] }).get(id)!;
  for (const r of bstats) Object.assign(fb(r.id), { n: r.n, lo: Math.floor(r.lo ?? 0), hi: Math.ceil(r.hi ?? 0), st: r.st ?? 0, d: r.d ?? 0 });
  for (const r of bcats) fb(r.id).c!.push([r.k, r.n]);
  for (const r of bshops) fb(r.id).s.push([r.k, r.n]);
  const desc = <T extends [unknown, number]>(l: T[]) => l.sort((a, b) => b[1] - a[1]);
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const [id, f] of cat) {
    f.b = desc(f.b).slice(0, 60); f.s = desc(f.s);
    for (const k of Object.keys(f.p)) f.p[k] = desc(f.p[k]!).slice(0, 16);
    stmts.push(put(db, `f:${id}`, JSON.stringify(f), now));
  }
  for (const [id, f] of brand) { f.c = desc(f.c!).slice(0, 30); f.s = desc(f.s); stmts.push(put(db, `fb:${id}`, JSON.stringify(f), now)); }

  // 4. homepage + category photos
  const pick = (rows: Array<{ id: number; c: number }>, n: number) => {
    const per = new Map<number, number>(); const out: number[] = [];
    for (const r of rows) { const k = per.get(r.c) ?? 0; if (k >= 2) continue; per.set(r.c, k + 1); out.push(r.id); if (out.length >= n) break; }
    return out;
  };
  const card = `status = 'publish' AND noindex = 0 AND offer_count > 0 AND in_stock = 1 AND image <> ''`;
  const [deals, popular, topBrands, topShops, totals, catImg] = await Promise.all([
    all<{ id: number; c: number }>(`SELECT id, primary_cat AS c FROM products WHERE ${card} AND disc_pct >= 10 ORDER BY disc_pct DESC, pop DESC LIMIT 300`),
    all<{ id: number; c: number }>(`SELECT id, primary_cat AS c FROM products WHERE ${card} ORDER BY pop DESC, shop_count DESC LIMIT 300`),
    all<{ id: number; n: number }>(`SELECT b.id, b.count AS n FROM brands b WHERE b.noindex = 0 AND b.slug <> 'ostatni' AND b.count > 0 ORDER BY (SELECT COALESCE(SUM(p.pop), 0) FROM products p WHERE p.brand_id = b.id) DESC LIMIT 24`),
    all<{ k: string; n: number }>(`SELECT domain AS k, COUNT(DISTINCT product_id) AS n FROM offers WHERE active = 1 GROUP BY domain ORDER BY n DESC`),
    all<{ products: number; offers: number }>(`SELECT (SELECT COUNT(*) FROM products WHERE status = 'publish' AND offer_count > 0) AS products, (SELECT COUNT(*) FROM offers WHERE active = 1) AS offers`),
    all<{ id: number; img: string }>(`SELECT cat_id AS id, image AS img FROM (SELECT x.cat_id, p.image, ROW_NUMBER() OVER (PARTITION BY x.cat_id ORDER BY x.pop DESC, p.shop_count DESC) AS rn
      FROM cat_products x JOIN products p ON p.id = x.product_id WHERE p.status = 'publish' AND p.image <> '' AND p.offer_count > 0 AND p.noindex = 0) WHERE rn = 1`),
  ]);
  const home = {
    deals: pick(deals, 12), popular: pick(popular, 12),
    brands: topBrands.map((r) => [r.id, r.n]), shops: topShops.map((r) => [r.k, r.n]),
    products: totals[0]?.products ?? 0, offers: totals[0]?.offers ?? 0,
  };
  stmts.push(put(db, 'home', JSON.stringify(home), now));
  stmts.push(put(db, 'cats:img', JSON.stringify(Object.fromEntries(catImg.map((r) => [r.id, r.img]))), now));
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
  return { categories: cat.size, brands: brand.size, deals: home.deals.length };
}
