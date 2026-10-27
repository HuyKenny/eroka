// Read model over D1. Every page is 1–2 db.batch() round trips; the category tree (375 rows) is memoised per
// isolate for a minute, so breadcrumbs, chips and card labels never hit D1 again.
import { PER_PAGE, POSTS_PER_PAGE } from './site';

export interface Cat {
  id: number; slug: string; name: string; parent: number; count_total: number; count_direct: number;
  noindex: number; menu_order: number;
}
export interface CatFull extends Cat { description_html: string; second_html: string; seo_title: string; seo_desc: string; seo_robots: string }
export interface Card {
  id: number; slug: string; name: string; image: string; min_price: number; offer_count: number; shop_count: number;
  best_domain: string; primary_cat: number; go_slug: string | null;
}
export interface Product extends Card {
  short_html: string; desc_html: string; ean: string; brand_id: number; created_at: string; updated_at: string;
  noindex: number; seo_title: string; seo_desc: string; max_price: number; best_offer_id: number;
}
export interface Offer {
  id: number; feed: string; title: string; domain: string; price: number; price_old: number; stock: number;
  go_slug: string; updated_at: string; img: string;
}
export interface Brand { id: number; slug: string; name: string; description_html: string; count: number; noindex: number }
export interface Post {
  id: number; type: 'post' | 'page'; slug: string; title: string; content_html: string; excerpt: string;
  published_at: string; modified_at: string; cat_id: number; image: string; image_card: string; image_alt: string; image_w: number; image_h: number;
  noindex: number; seo_title: string; seo_desc: string; seo_robots: string;
}
export type PostCard = Pick<Post, 'id' | 'slug' | 'title' | 'excerpt' | 'published_at' | 'image' | 'image_card' | 'image_alt' | 'image_w' | 'image_h' | 'cat_id'>;
export interface PostCat { id: number; slug: string; name: string; description: string; count: number }

const CARD_COLS = `p.id, p.slug, p.name, p.image, p.min_price, p.offer_count, p.shop_count, p.best_domain, p.primary_cat, o.go_slug`;
const CARD_JOIN = `LEFT JOIN offers o ON o.id = p.best_offer_id`;

let catMemo: { at: number; byId: Map<number, Cat>; bySlug: Map<string, Cat>; kids: Map<number, Cat[]> } | null = null;
export async function catTree(db: D1Database) {
  if (catMemo && Date.now() - catMemo.at < 60_000) return catMemo;
  const rows = (await db.prepare('SELECT id, slug, name, parent, count_total, count_direct, noindex, menu_order FROM categories').all<Cat>()).results;
  const byId = new Map(rows.map((c) => [c.id, c]));
  const bySlug = new Map(rows.map((c) => [c.slug, c]));
  const kids = new Map<number, Cat[]>();
  for (const c of rows) (kids.get(c.parent) ?? kids.set(c.parent, []).get(c.parent)!).push(c);
  catMemo = { at: Date.now(), byId, bySlug, kids };
  return catMemo;
}
/** Root → … → cat (inclusive). */
export function ancestry(tree: Awaited<ReturnType<typeof catTree>>, id: number): Cat[] {
  const out: Cat[] = [];
  const seen = new Set<number>();
  let c = tree.byId.get(id);
  while (c && !seen.has(c.id)) { out.unshift(c); seen.add(c.id); c = tree.byId.get(c.parent); }
  return out;
}

export async function resolveSlug(db: D1Database, slug: string): Promise<{ kind: string; ref_id: number } | null> {
  return db.prepare('SELECT kind, ref_id FROM slugs WHERE slug = ?').bind(slug).first();
}

/** WordPress redirect_guess_404_permalink: a published object whose slug starts with the requested one. */
export async function guessSlug(db: D1Database, slug: string): Promise<string | null> {
  if (slug.length < 4) return null;
  const r = await db.prepare("SELECT slug FROM slugs WHERE slug > ? AND slug < ? AND kind IN ('product','post','page') ORDER BY slug LIMIT 1")
    .bind(slug, slug + '￿').first<{ slug: string }>();
  return r?.slug ?? null;
}

export type Sort = 'date' | 'price' | 'price-desc' | 'popularity';
export interface ListQuery { page: number; sort: Sort; min?: number | undefined; max?: number | undefined }

function sortSql(s: Sort): string {
  switch (s) {
    case 'price': return 'p.min_price = 0, p.min_price ASC, p.id DESC';
    case 'price-desc': return 'p.min_price DESC, p.id DESC';
    case 'popularity': return 'p.total_sales DESC, p.id DESC';
    default: return 'x.created_at DESC, x.product_id DESC';
  }
}

/** Products of a category (incl. children, as WooCommerce) or a brand: one page of cards + total. */
export async function listProducts(db: D1Database, by: { cat?: number; brand?: number }, q: ListQuery, knownTotal?: number): Promise<{ items: Card[]; total: number }> {
  const [tbl, col, id] = by.cat ? ['cat_products', 'cat_id', by.cat] : ['brand_products', 'brand_id', by.brand!];
  const filt: string[] = [];
  const binds: unknown[] = [id];
  if (q.min !== undefined) { filt.push('p.min_price >= ?'); binds.push(q.min); }
  if (q.max !== undefined) { filt.push('p.min_price <= ?'); binds.push(q.max); }
  const where = `x.${col} = ? AND p.status = 'publish'` + (filt.length ? ' AND ' + filt.join(' AND ') : '');
  const off = (q.page - 1) * PER_PAGE;
  const list = db.prepare(`SELECT ${CARD_COLS} FROM ${tbl} x JOIN products p ON p.id = x.product_id ${CARD_JOIN} WHERE ${where} ORDER BY ${sortSql(q.sort)} LIMIT ${PER_PAGE} OFFSET ${off}`).bind(...binds);
  if (knownTotal !== undefined && !filt.length) {
    return { items: (await list.all<Card>()).results, total: knownTotal };
  }
  const cnt = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} x JOIN products p ON p.id = x.product_id WHERE ${where}`).bind(...binds);
  const [a, b] = await db.batch([list, cnt]);
  return { items: a!.results as Card[], total: Number((b!.results[0] as { n: number }).n) };
}

export async function loadCategory(db: D1Database, id: number): Promise<CatFull | null> {
  return db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<CatFull>();
}

export async function loadProduct(db: D1Database, id: number) {
  const [p, offers, cats, hist] = await db.batch([
    db.prepare(`SELECT p.*, o.go_slug FROM products p ${CARD_JOIN} WHERE p.id = ?`).bind(id),
    db.prepare('SELECT id, feed, title, domain, price, price_old, stock, go_slug, updated_at, img FROM offers WHERE product_id = ? AND active = 1 ORDER BY price ASC').bind(id),
    db.prepare('SELECT cat_id FROM cat_products WHERE product_id = ? AND direct = 1').bind(id),
    db.prepare('SELECT day, min_price FROM price_history WHERE product_id = ? ORDER BY day').bind(id),
  ]);
  const product = (p!.results[0] as Product | undefined) ?? null;
  if (!product) return null;
  const brand = product.brand_id ? await db.prepare('SELECT id, slug, name FROM brands WHERE id = ?').bind(product.brand_id).first<Pick<Brand, 'id' | 'slug' | 'name'>>() : null;
  return {
    product,
    offers: offers!.results as Offer[],
    catIds: (cats!.results as Array<{ cat_id: number }>).map((r) => r.cat_id),
    history: hist!.results as Array<{ day: string; min_price: number }>,
    brand,
  };
}

/** Related products (WooCommerce picks random products from the same categories; we take the neighbours by date). */
export async function relatedProducts(db: D1Database, catId: number, exclude: number, createdAt: string, n = 8): Promise<Card[]> {
  if (!catId) return [];
  const [older, newer] = await db.batch([
    db.prepare(`SELECT ${CARD_COLS} FROM cat_products x JOIN products p ON p.id = x.product_id ${CARD_JOIN} WHERE x.cat_id = ? AND x.created_at < ? AND p.status = 'publish' ORDER BY x.created_at DESC LIMIT ?`).bind(catId, createdAt, n),
    db.prepare(`SELECT ${CARD_COLS} FROM cat_products x JOIN products p ON p.id = x.product_id ${CARD_JOIN} WHERE x.cat_id = ? AND x.created_at > ? AND p.status = 'publish' ORDER BY x.created_at ASC LIMIT ?`).bind(catId, createdAt, n),
  ]);
  const a = older!.results as Card[];
  const b = newer!.results as Card[];
  const out: Card[] = [];
  for (let i = 0; out.length < n && (i < a.length || i < b.length); i++) {
    if (a[i] && a[i]!.id !== exclude) out.push(a[i]!);
    if (out.length < n && b[i] && b[i]!.id !== exclude) out.push(b[i]!);
  }
  return out;
}

export async function cardsByIds(db: D1Database, ids: number[]): Promise<Card[]> {
  if (!ids.length) return [];
  const rows = (await db.prepare(`SELECT ${CARD_COLS} FROM products p ${CARD_JOIN} WHERE p.id IN (${ids.slice(0, 90).map(() => '?').join(',')}) AND p.status = 'publish'`).bind(...ids.slice(0, 90)).all<Card>()).results;
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((i) => by.get(i)).filter((x): x is Card => !!x);
}

export async function loadBrand(db: D1Database, slug: string): Promise<Brand | null> {
  return db.prepare('SELECT * FROM brands WHERE slug = ?').bind(slug).first<Brand>();
}

export async function loadPost(db: D1Database, id: number): Promise<Post | null> {
  return db.prepare('SELECT * FROM posts WHERE id = ? AND status = \'publish\'').bind(id).first<Post>();
}

const POST_CARD = 'id, slug, title, excerpt, published_at, image, image_card, image_alt, image_w, image_h, cat_id';
export async function listPosts(db: D1Database, page: number, catId?: number): Promise<{ items: PostCard[]; total: number }> {
  const where = "type = 'post' AND status = 'publish'" + (catId ? ' AND cat_id = ?' : '');
  const b = catId ? [catId] : [];
  const [a, c] = await db.batch([
    db.prepare(`SELECT ${POST_CARD} FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ${POSTS_PER_PAGE} OFFSET ${(page - 1) * POSTS_PER_PAGE}`).bind(...b),
    db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${where}`).bind(...b),
  ]);
  return { items: a!.results as PostCard[], total: Number((c!.results[0] as { n: number }).n) };
}
export async function postsBySlugs(db: D1Database, slugs: string[]): Promise<PostCard[]> {
  if (!slugs.length) return [];
  const rows = (await db.prepare(`SELECT ${POST_CARD} FROM posts WHERE type = 'post' AND status = 'publish' AND slug IN (${slugs.map(() => '?').join(',')})`).bind(...slugs).all<PostCard & { slug: string }>()).results;
  const by = new Map(rows.map((r) => [r.slug, r]));
  return slugs.map((s) => by.get(s)).filter((x): x is PostCard => !!x);
}
export async function relatedPosts(db: D1Database, post: Post, n = 4): Promise<PostCard[]> {
  return (await db.prepare(`SELECT ${POST_CARD} FROM posts WHERE type = 'post' AND status = 'publish' AND id <> ? AND cat_id = ? ORDER BY published_at DESC LIMIT ?`).bind(post.id, post.cat_id, n).all<PostCard>()).results;
}
export async function postCat(db: D1Database, id: number): Promise<PostCat | null> {
  return db.prepare('SELECT * FROM post_categories WHERE id = ?').bind(id).first<PostCat>();
}
export async function comments(db: D1Database, postId: number) {
  return (await db.prepare('SELECT id, author, created_at, content_html FROM comments WHERE post_id = ? ORDER BY created_at').bind(postId).all<{ id: number; author: string; created_at: string; content_html: string }>()).results;
}

/** FTS5 product search (name + brand), diacritics-insensitive. Prefix match on every term. */
export async function searchProducts(db: D1Database, query: string, page: number): Promise<{ items: Card[]; total: number }> {
  const terms = query.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1).slice(0, 6);
  if (!terms.length) return { items: [], total: 0 };
  const match = terms.map((t) => `"${t.replace(/"/g, '')}"*`).join(' ');
  const off = (page - 1) * PER_PAGE;
  const [ids, cnt] = await db.batch([
    db.prepare(`SELECT rowid AS id FROM product_fts WHERE product_fts MATCH ? ORDER BY rank LIMIT ${PER_PAGE} OFFSET ${off}`).bind(match),
    db.prepare('SELECT COUNT(*) AS n FROM product_fts WHERE product_fts MATCH ?').bind(match),
  ]);
  const list = (ids!.results as Array<{ id: number }>).map((r) => r.id);
  return { items: await cardsByIds(db, list), total: Number((cnt!.results[0] as { n: number }).n) };
}

export async function siteCache(db: D1Database, key: string): Promise<string | null> {
  return (await db.prepare('SELECT value FROM site_cache WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
}
