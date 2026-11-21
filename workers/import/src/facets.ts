// Nightly precomputation for the redesigned listings and homepage (finalizeDay, after price history):
//  1. discount (the best offer's old price from the feed) and popularity
//  2. sort keys copied into cat_products (every sort is an index range scan)
//  3. filter facets per category / brand (brands, shops, params, price range) → site_cache 'f:<cat>' / 'fb:<brand>'
//  4. homepage blocks (deals, popular, brands, shops) → 'home'; one product photo per category → 'cats:img'
// Facet counts are for the unfiltered listing (as on most comparison sites); filtered results are counted live.

import { RULES } from './category-rules';

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
  // WHERE IS NOT guard (18. 11.): D1 účtuje "rows written" za KAŽDÝ řádek dotčený UPDATE, ne jen změněný —
  // bez téhle podmínky se každý běh přepisovaly všechny produkty/cat_products stejnou hodnotou (eroka 22,9 M
  // zápisů/měsíc, 9× rozpočet). S podmínkou se zapíšou jen řádky, kde se hodnota opravdu liší.
  const discExpr = `MIN(70,
      COALESCE((SELECT CAST(ROUND((o.price_old - o.price) * 100.0 / o.price_old) AS INTEGER) FROM offers o WHERE o.id = products.best_offer_id AND o.active = 1 AND o.price_old > o.price), 0))`;
  await db.prepare(`UPDATE products SET disc_pct = ${discExpr} WHERE disc_pct IS NOT ${discExpr}`).run();
  await db.prepare("UPDATE products SET disc_pct = 0 WHERE (disc_pct < 3 OR min_price = 0) AND disc_pct != 0").run();
  // clicks count once per visitor and day (ip_hash rotates daily) — a few IPs cannot push a product up
  const popExpr = `total_sales * 5 + shop_count * 3 + in_stock * 5 + 20 * COALESCE((SELECT n FROM c WHERE c.product_id = products.id), 0)`;
  await db.prepare(`WITH c AS (SELECT product_id, COUNT(DISTINCT ip_hash || substr(clicked_at, 1, 10)) AS n FROM clicks WHERE clicked_at >= ? AND ip_hash <> '' GROUP BY product_id)
    UPDATE products SET pop = ${popExpr} WHERE pop IS NOT (${popExpr})`).bind(clicksSince).run();
  const rules = await applyCategoryRules(db);
  // 2. sort keys
  await db.prepare(`UPDATE cat_products SET
      min_price = (SELECT p.min_price FROM products p WHERE p.id = cat_products.product_id),
      pop = (SELECT p.pop FROM products p WHERE p.id = cat_products.product_id),
      disc = (SELECT p.disc_pct FROM products p WHERE p.id = cat_products.product_id)
      WHERE min_price IS NOT (SELECT p.min_price FROM products p WHERE p.id = cat_products.product_id)
         OR pop IS NOT (SELECT p.pop FROM products p WHERE p.id = cat_products.product_id)
         OR disc IS NOT (SELECT p.disc_pct FROM products p WHERE p.id = cat_products.product_id)`).run();

  // 3. facets
  // one aggregation at a time, retried when D1 reports "overloaded" (16. 11.: eight parallel GROUP BYs over cat_products
  // exceeded the 10 s resource window once the audience hub passed 6 800 rows, finalize returned 1101)
  let queue: Promise<unknown> = Promise.resolve();
  const all = <T>(sql: string, ...b: unknown[]): Promise<T[]> => {
    const run = async (): Promise<T[]> => {
      for (let i = 0; ; i++) {
        try { return (await db.prepare(sql).bind(...b).all<T>()).results; }
        catch (e) {
          if (i >= 5 || !/overloaded/i.test(String(e))) throw e;
          await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
        }
      }
    };
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  };
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
    // one grouped pass (a correlated SUM per brand hit the D1 CPU limit with 1 000 brands × 23k products)
    all<{ id: number; n: number }>(`SELECT b.id, b.count AS n FROM brands b JOIN (SELECT brand_id, SUM(pop) AS s FROM products GROUP BY brand_id) t ON t.brand_id = b.id
      WHERE b.noindex = 0 AND b.slug <> 'ostatni' AND b.count > 0 ORDER BY t.s DESC LIMIT 24`),
    all<{ k: string; n: number }>(`SELECT domain AS k, COUNT(DISTINCT product_id) AS n FROM offers WHERE active = 1 GROUP BY domain ORDER BY n DESC`),
    all<{ products: number; offers: number }>(`SELECT (SELECT COUNT(*) FROM products WHERE status = 'publish' AND offer_count > 0) AS products, (SELECT COUNT(*) FROM offers WHERE active = 1) AS offers`),
    // top 6 photos per category through idx_cp_pop (a window over all of cat_products timed out at 23k products)
    all<{ id: number; img: string; parent: number; pop: number }>(`SELECT x.cat_id AS id, p.image AS img, c.parent, x.pop FROM categories c
      JOIN cat_products x ON x.cat_id = c.id AND x.product_id IN (SELECT x2.product_id FROM cat_products x2 JOIN products p2 ON p2.id = x2.product_id
        WHERE x2.cat_id = c.id AND p2.status = 'publish' AND p2.image <> '' AND p2.offer_count > 0 AND p2.noindex = 0 ORDER BY x2.pop DESC LIMIT 6)
      JOIN products p ON p.id = x.product_id ORDER BY x.cat_id, x.pop DESC`),
  ]);
  const home = {
    deals: pick(deals, 12), popular: pick(popular, 12),
    brands: topBrands.map((r) => [r.id, r.n]), shops: topShops.map((r) => [r.k, r.n]),
    products: totals[0]?.products ?? 0, offers: totals[0]?.offers ?? 0,
  };
  stmts.push(put(db, 'home', JSON.stringify(home), now));
  // one photo per category; sibling tiles (same parent) never repeat a photo — take the next most popular product
  const usedBy = new Map<number, Set<string>>();
  const catPhoto: Record<number, string> = {};
  const byCat = new Map<number, typeof catImg>();
  for (const r of catImg) (byCat.get(r.id) ?? byCat.set(r.id, []).get(r.id)!).push(r);
  for (const [id, rows] of [...byCat].sort((a, b) => a[0] - b[0])) {
    const used = usedBy.get(rows[0]!.parent) ?? usedBy.set(rows[0]!.parent, new Set()).get(rows[0]!.parent)!;
    const pick = rows.find((r) => !used.has(r.img)) ?? rows[0]!;
    used.add(pick.img);
    catPhoto[id] = pick.img;
  }
  stmts.push(put(db, 'cats:img', JSON.stringify(catPhoto), now));
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
  return { categories: cat.size, brands: brand.size, deals: home.deals.length, rule_rows: rules.rows, rule_added: rules.added, rule_removed: rules.removed };
}

/** Category rules (category-rules.ts) → cat_products rows with direct = 2. Computed in memory, written as a diff
 *  (no moment with emptied categories), then category counts are refreshed. Returns members per rule category. */
export async function applyCategoryRules(db: D1Database): Promise<{ rows: number; added: number; removed: number; per: Record<string, number> }> {
  const all = async <T>(sql: string) => (await db.prepare(sql).all<T>()).results;
  const [cats, members, prods, params, brands] = await Promise.all([
    all<{ id: number; slug: string; parent: number }>('SELECT id, slug, parent FROM categories'),
    all<{ c: number; p: number; d: number }>('SELECT cat_id AS c, product_id AS p, direct AS d FROM cat_products'),
    all<{ id: number; name: string; brand_id: number }>("SELECT id, name, brand_id FROM products WHERE status = 'publish'"),
    all<{ p: number; k: string; v: string }>('SELECT product_id AS p, key AS k, value AS v FROM product_params'),
    all<{ id: number; slug: string }>('SELECT id, slug FROM brands'),
  ]);
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const parent = new Map(cats.map((c) => [c.id, c.parent]));
  const chain = (id: number) => { const out: number[] = []; const seen = new Set<number>(); let c: number | undefined = id; while (c && !seen.has(c)) { out.push(c); seen.add(c); c = parent.get(c); } return out; };
  const member = new Map<number, Set<number>>();
  const existing = new Set<string>();
  for (const r of members) {
    if (r.d === 2) { existing.add(`${r.c}:${r.p}`); continue; }
    (member.get(r.c) ?? member.set(r.c, new Set()).get(r.c)!).add(r.p);
  }
  const name = new Map(prods.map((p) => [p.id, p.name]));
  const brandSlug = new Map(brands.map((b) => [b.id, b.slug]));
  const brandOf = new Map(prods.map((p) => [p.id, brandSlug.get(p.brand_id) ?? '']));
  const prm = new Map<string, Set<number>>();
  for (const r of params) (prm.get(`${r.k}=${r.v}`) ?? prm.set(`${r.k}=${r.v}`, new Set()).get(`${r.k}=${r.v}`)!).add(r.p);
  const desired = new Set<string>();
  const per: Record<string, number> = {};
  for (const rule of RULES) {
    const target = bySlug.get(rule.cat);
    if (!target) { per[rule.cat] = -1; continue; }
    const hit = new Set<number>();
    for (const cl of rule.any) {
      let pool: Iterable<number>;
      if (cl.within.includes('*')) pool = name.keys();
      else { const u = new Set<number>(); for (const s of cl.within) { const c = bySlug.get(s); for (const p of (c && member.get(c.id)) ?? []) u.add(p); } pool = u; }
      const pv = cl.param ? cl.param.values.map((v) => prm.get(`${cl.param!.key}=${v}`) ?? new Set<number>()) : null;
      for (const p of pool) {
        const n = name.get(p);
        if (n === undefined) continue;
        if (cl.name && !cl.name.test(n)) continue;
        if (pv && !pv.some((set) => set.has(p))) continue;
        if (cl.brand && !cl.brand.includes(brandOf.get(p) ?? '')) continue;
        if (rule.not && rule.not.test(n)) continue;
        hit.add(p);
      }
    }
    for (const p of hit) {
      for (const t of chain(target.id)) {
        const m = member.get(t) ?? member.set(t, new Set()).get(t)!;
        if (m.has(p)) continue;
        m.add(p);
        desired.add(`${t}:${p}`);
      }
    }
    per[rule.cat] = member.get(target.id)?.size ?? 0;
  }
  const toDel = [...existing].filter((k) => !desired.has(k));
  const toAdd = [...desired].filter((k) => !existing.has(k));
  const group = (keys: string[]) => { const g = new Map<number, number[]>(); for (const k of keys) { const [c, p] = k.split(':').map(Number); (g.get(c!) ?? g.set(c!, []).get(c!)!).push(p!); } return g; };
  const stmts: D1PreparedStatement[] = [];
  for (const [c, ps] of group(toDel)) for (let i = 0; i < ps.length; i += 90) {
    const part = ps.slice(i, i + 90);
    stmts.push(db.prepare(`DELETE FROM cat_products WHERE direct = 2 AND cat_id = ? AND product_id IN (${part.map(() => '?').join(',')})`).bind(c, ...part));
  }
  for (const [c, ps] of group(toAdd)) for (let i = 0; i < ps.length; i += 90) {
    const part = ps.slice(i, i + 90);
    stmts.push(db.prepare(`INSERT OR IGNORE INTO cat_products (cat_id, created_at, product_id, direct, min_price, pop, disc)
      SELECT ?, created_at, id, 2, min_price, pop, disc_pct FROM products WHERE id IN (${part.map(() => '?').join(',')})`).bind(c, ...part));
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  if (stmts.length) {
    await db.prepare(`UPDATE categories SET count_total = (SELECT COUNT(*) FROM cat_products x JOIN products p ON p.id = x.product_id WHERE x.cat_id = categories.id AND p.status = 'publish')`).run();
  }
  return { rows: desired.size, added: toAdd.length, removed: toDel.length, per };
}
