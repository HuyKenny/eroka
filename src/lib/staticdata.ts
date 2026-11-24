// Data files for the client-side listing filters and the site search (Cloudflare Workers Free, 24. 11. 2026). Every page is
// a static file now and Workers static assets ignore the query string, so ?orderby= / ?min_price= / ?znacka= … and /?s=
// are evaluated in the browser (src/scripts/staticky.ts). These endpoints run only in the nightly build: the SSR app is
// rendered locally over the SQLite state and crawled (scripts/static/build.py), listing pages point at their file with
// data-src="/data/l/<base>.json" (zmraz.py follows it) and the search page at /data/search.json, which build.py splits into
// /data/s/<xx>.json buckets (two-letter word prefixes) + /data/s/index.json. Thumbnail URLs (/img/…) are rewritten to the
// R2 copies by the post-crawl step like in the HTML.
import { CARD_COLS, CARD_JOIN, brandList, catTree, facets, listProducts, loadBrand, type Card, type ListQuery } from './db';
import { SORTS } from './filters';
import { BUCKETS, PARAM_LABEL, PARAM_ORDER, valueSlug, type ParamKey } from './params';
import { decode, texturize } from './format';
import { picture } from './img';
import { shopName } from './shops';
import { listingLandings } from './views';

/** Diacritics-insensitive form used by the search on both sides (same code in src/scripts/staticky.ts). */
export const fold = (t: string) => decode(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Dictionary: value → index (domains, filter tokens). */
class Dict {
  list: string[] = [];
  private map = new Map<string, number>();
  id(v: string): number {
    let i = this.map.get(v);
    if (i === undefined) { i = this.list.length; this.list.push(v); this.map.set(v, i); }
    return i;
  }
}

/** Card = [id, slug, name, img 1×, img 2×, price, offers, shops, domain index, in stock, discount %, go slug] (components/Karta.astro).
 *  `lean` (listing and search files): no 2× URL — the browser derives it from the 1× one (same R2 key / wsrv width); every
 *  published product is in a category whose frozen listing pages show it, so its 2× thumbnail exists. The go slug only where the card links to the shop. */
function cardRow(p: Card, dom: Dict, lean = false): unknown[] {
  const img = picture(p.image, 240);
  const x2 = img && !lean ? (img.srcset.split(', ')[1] ?? '').replace(/ 2x$/, '') : '';
  return [p.id, p.slug, texturize(decode(p.name)), img?.src ?? '', x2, Math.round(p.min_price * 100) / 100, p.offer_count, p.shop_count,
    dom.id(p.best_domain), p.in_stock ? 1 : 0, p.disc_pct, p.offer_count === 1 ? goShort(p.slug, p.go_slug ?? '') : ''];
}
/** go slug = "<slug>-<hash>" in most rows → "~<hash>" (staticky.ts expands it). */
const goShort = (slug: string, go: string) => (go.startsWith(slug + '-') ? '~' + go.slice(slug.length + 1) : go);
/** Common prefix/suffix of the absolute thumbnail URLs (wsrv.nl …&w=320&h=320&…) cut off the rows → ip; the browser puts them back.
 *  Site-relative /img/ URLs stay whole: the post-crawl step rewrites them to the R2 copies in place. */
function packImages(rows: unknown[][], col: number): [string, string] {
  const urls = rows.map((r) => r[col] as string).filter(Boolean);
  if (!urls.length || !urls.every((u) => u.startsWith('https://'))) return ['', ''];
  let pre = urls[0]!, suf = urls[0]!;
  for (const u of urls) {
    while (!u.startsWith(pre)) pre = pre.slice(0, -1);
    while (!u.endsWith(suf)) suf = suf.slice(1);
  }
  pre = pre.slice(0, pre.lastIndexOf('=') + 1 || 0);   // whole query parameters only
  suf = suf.slice(suf.indexOf('&') < 0 ? suf.length : suf.indexOf('&'));
  if (pre.length + suf.length < 12) return ['', ''];
  for (const r of rows) if (r[col]) r[col] = (r[col] as string).slice(pre.length, (r[col] as string).length - suf.length);
  return [pre, suf];
}
const domains = (dom: Dict) => dom.list.map((d) => [d, shopName(d)]);
const all = (sort: ListQuery['sort']): ListQuery => ({ page: 1, sort, brands: [], shops: [], stock: false, disc: false, params: [], all: true });

/**
 * One listing (category `<slug>` or brand `znacka/<slug>`) with everything the filters need:
 *   c: card rows (+ filter token indexes) in the default order, o: row order for every sort (SQL of lib/db.ts, so ties and
 *   left-out rows match the old SSR), t: filter tokens (b:<brand> o:<shop> k:<category> p_<key>:<value or bucket>),
 *   lb: chip labels of the tokens, l: facet landings (one filter value → its indexable landing), pk: parameter order.
 */
export async function listingData(db: D1Database, path: string): Promise<unknown | null> {
  const tree = await catTree(db);
  let by: { cat?: number; brand?: number };
  let landings: Record<string, string> = {};
  let fcKey: string;
  if (path.startsWith('znacka/')) {
    const b = await loadBrand(db, path.slice(7));
    if (!b) return null;
    by = { brand: b.id };
    fcKey = `fb:${b.id}`;
  } else {
    const c = tree.bySlug.get(path);
    if (!c) return null;
    by = { cat: c.id };
    fcKey = `f:${c.id}`;
    landings = await listingLandings(db, c.id);
  }
  const fc = await facets(db, fcKey);
  const dom = new Dict();
  const rows = new Map<number, unknown[]>();
  const order: Record<string, number[]> = {};
  const rowOf = new Map<number, number>();
  for (const [s] of SORTS) {
    const { items } = await listProducts(db, by, all(s));
    order[s] = items.map((p) => {
      let i = rowOf.get(p.id);
      if (i === undefined) { i = rowOf.size; rowOf.set(p.id, i); rows.set(p.id, cardRow(p, dom, true)); }
      return i;
    });
  }
  // filter tokens of the listing's products (joins instead of id lists: D1 binds at most 100 parameters)
  const [tbl, col, id] = by.cat ? ['cat_products', 'cat_id', by.cat] : ['brand_products', 'brand_id', by.brand!];
  const tok = new Dict();
  const tokens = new Map<number, Set<number>>();
  const add = (pid: number, t: string) => { if (rows.has(pid)) (tokens.get(pid) ?? tokens.set(pid, new Set()).get(pid)!).add(tok.id(t)); };
  const q = <T>(sql: string) => db.prepare(sql).bind(id).all<T>().then((r) => r.results);
  const brands = await brandList(db);
  if (by.cat) {
    for (const r of await q<{ p: number; b: number }>(`SELECT p.id AS p, p.brand_id AS b FROM ${tbl} x JOIN products p ON p.id = x.product_id WHERE x.${col} = ?`)) {
      const b = brands.byId.get(r.b);
      if (b) add(r.p, 'b:' + b.slug);
    }
  } else {
    // brand pages filter by category (the facet's categories only)
    const want = new Set((fc?.c ?? []).map(([cid]) => cid));
    for (const r of await q<{ p: number; c: number }>(`SELECT x2.product_id AS p, x2.cat_id AS c FROM ${tbl} x JOIN cat_products x2 ON x2.product_id = x.product_id WHERE x.${col} = ?`)) {
      const c = tree.byId.get(r.c);
      if (c && want.has(c.id)) add(r.p, 'k:' + c.slug);
    }
  }
  for (const r of await q<{ p: number; d: string }>(`SELECT DISTINCT o.product_id AS p, o.domain AS d FROM ${tbl} x JOIN offers o ON o.product_id = x.product_id WHERE x.${col} = ? AND o.active = 1`)) add(r.p, 'o:' + r.d);
  const labels: Record<string, string> = {};
  for (const r of await q<{ p: number; k: string; v: string }>(`SELECT pp.product_id AS p, pp.key AS k, pp.value AS v FROM ${tbl} x JOIN product_params pp ON pp.product_id = x.product_id WHERE x.${col} = ?`)) {
    const k = r.k as ParamKey;
    if (!PARAM_ORDER.includes(k)) continue;
    const b = BUCKETS[k];
    if (b) {
      const n = Number(r.v);
      for (const [bid, label, a, z] of b) if (n >= a && n < z) { add(r.p, `p_${k}:${bid}`); labels[`p_${k}:${bid}`] = `${PARAM_LABEL[k]}: ${label}`; }
    } else {
      const t = `p_${k}:${valueSlug(r.v)}`;
      add(r.p, t);
      labels[t] ??= `${PARAM_LABEL[k]}: ${r.v}`;
    }
  }
  const lb: Record<string, string> = {};
  for (const t of tok.list) {
    const [kind, v] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)];
    lb[t] = kind === 'b' ? decode(brands.bySlug.get(v)?.name ?? v) : kind === 'o' ? shopName(v) : kind === 'k' ? decode(tree.bySlug.get(v)?.name ?? v) : labels[t] ?? v;
  }
  const c = [...rows.entries()].map(([pid, row]) => [...row, [...(tokens.get(pid) ?? [])]]);
  const ip = packImages(c, 3);
  return { n: order.pop?.length ?? c.length, d: domains(dom), ip, t: tok.list, lb, l: landings, pk: PARAM_ORDER, o: order, c };
}

/** Search corpus: every published product (name + brand, folded) in popularity order, + categories and brands for the chips/suggestions. */
export async function searchData(db: D1Database): Promise<unknown> {
  const [tree, brands] = await Promise.all([catTree(db), brandList(db)]);
  const dom = new Dict();
  const res = await db.prepare(`SELECT ${CARD_COLS}, COALESCE(b.name, '') AS brand FROM products p ${CARD_JOIN} LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.status = 'publish' ORDER BY p.pop DESC, p.id DESC`).all<Card & { brand: string }>();
  const rows = res.results.map((p) => [fold(`${p.name} ${p.brand === 'Ostatní' ? '' : p.brand}`), ...cardRow(p, dom, true)]);
  const cats = [...tree.byId.values()].filter((c) => c.count_total > 0 && !c.noindex).sort((a, b) => b.count_total - a.count_total).map((c) => [decode(c.name), c.slug, c.count_total]);
  const brs = [...brands.byId.values()].filter((b) => b.slug !== 'ostatni').sort((a, b) => b.count - a.count).map((b) => [decode(b.name), b.slug, b.count]);
  const ip = packImages(rows, 4);
  return { meta: { d: domains(dom), ip, cats, brands: brs }, rows };
}
