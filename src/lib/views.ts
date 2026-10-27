// View models for each page type: data from D1 + SEO meta (title, description, canonical, prev/next, robots, JSON-LD)
// matching the WordPress/Rank Math output. Templates only render what these return.
import {
  ancestry, catTree, cardsByIds, comments, listPosts, listProducts, loadBrand, loadCategory, loadPost, loadProduct,
  postCat, postsBySlugs, relatedPosts, relatedProducts, searchProducts,
  type Card, type Cat, type Offer, type Post, type PostCard, type Sort,
} from './db';
import { BASE, OG_DEFAULT, PER_PAGE, POSTS_PER_PAGE, isoPrague } from './site';
import { categoryTitle, descFrom, postTitle, productTitle, robots, searchTitle, termTitle } from './seo';
import { decode, stripTags, untexturize } from './format';
import { validImage } from './img';
import links from '../data/prolinkovani.json';

export interface Meta {
  title: string; description: string; canonical?: string; prev?: string; next?: string; robots: string[];
  ogType?: string; ogImage?: string; graph: unknown[]; jsonLd: unknown[]; extraMeta?: Array<{ property?: string; name?: string; content: string }>;
  /** Rank Math prints the organisation as AdultEntertainment only on taxonomy archives. */
  adultOnly?: boolean;
}
export interface Crumb { name: string; url?: string }

const abs = (p: string) => BASE + p;
const pagePath = (base: string, n: number) => (n <= 1 ? base : `${base}page/${n}/`);
function breadcrumbLd(items: Crumb[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: abs(c.url ?? '/') })),
  };
}
function itemListLd(url: string, name: string, items: Card[]) {
  const list = items.slice(0, 20);
  if (!list.length) return null;
  return {
    '@context': 'https://schema.org', '@type': 'ItemList', '@id': url + '#products', name, numberOfItems: list.length,
    itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/${p.slug}/`), name: decode(p.name) })),
  };
}
function collection(url: string, title: string) {
  return { '@type': 'CollectionPage', '@id': url + '#webpage', url, name: title, isPartOf: { '@id': BASE + '/#website' }, inLanguage: 'cs' };
}

// ---------- listing query (?orderby, ?min_price, ?max_price) ----------
export function listQuery(sp: URLSearchParams, page: number) {
  const o = sp.get('orderby') ?? '';
  const sort: Sort = o === 'price' || o === 'price-desc' || o === 'popularity' ? o : 'date';
  const num = (k: string) => { const v = sp.get(k); if (v === null || v.trim() === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined; };
  return { page, sort, min: num('min_price'), max: num('max_price') };
}
const filtered = (q: ReturnType<typeof listQuery>) => q.sort !== 'date' || q.min !== undefined || q.max !== undefined;
function queryString(q: ReturnType<typeof listQuery>): string {
  const sp = new URLSearchParams();
  if (q.sort !== 'date') sp.set('orderby', q.sort);
  if (q.min !== undefined) sp.set('min_price', String(q.min));
  if (q.max !== undefined) sp.set('max_price', String(q.max));
  const s = sp.toString();
  return s ? '?' + s : '';
}

// ---------- category ----------
export async function categoryView(db: D1Database, catId: number, page: number, sp: URLSearchParams) {
  const [cat, tree] = await Promise.all([loadCategory(db, catId), catTree(db)]);
  if (!cat) return null;
  const q = listQuery(sp, page);
  const { items, total } = await listProducts(db, { cat: cat.id }, q, cat.count_total);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages) return null;
  const chain = ancestry(tree, cat.id);
  let kids = (tree.kids.get(cat.id) ?? []).filter((c) => c.count_total > 0);
  let kidsTitle = 'Podkategorie';
  if (!kids.length && cat.parent) {
    kids = (tree.kids.get(cat.parent) ?? []).filter((c) => c.count_total > 0 && c.id !== cat.id);
    kidsTitle = 'Související kategorie';
  }
  kids = kids.sort((a, b) => b.count_total - a.count_total).slice(0, 16);
  const base = `/${cat.slug}/`;
  const url = abs(pagePath(base, page));
  const title = categoryTitle(cat.name, cat.seo_title);
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` }))];
  const noindex = cat.noindex === 1 || cat.seo_robots.includes('noindex');
  const magSlugs = (links.magbox as Record<string, string[]>)[cat.slug] ?? links.magbox_default;
  const meta: Meta = {
    title, description: descFrom(cat.seo_desc, cat.description_html, { term: decode(cat.name) }),
    ...(noindex ? {} : { canonical: url }), robots: robots(noindex, cat.seo_robots),
    ...(page > 1 ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)],
    jsonLd: [breadcrumbLd(crumbs), itemListLd(abs(base), decode(cat.name), items)].filter(Boolean),
  };
  return {
    meta, cat, crumbs, items, total, page, pages, base, q, qs: queryString(q), kids, kidsTitle, tree,
    magbox: magSlugs.map((s) => ({ slug: s, title: (links.titulky as Record<string, string>)[s] ?? s })),
    isFiltered: filtered(q),
  };
}

// ---------- brand ----------
export async function brandView(db: D1Database, slug: string, page: number, sp: URLSearchParams) {
  const b = await loadBrand(db, slug);
  if (!b) return null;
  const q = listQuery(sp, page);
  const [{ items, total }, tree] = await Promise.all([listProducts(db, { brand: b.id }, q, b.count), catTree(db)]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages && page > 1) return null;
  const base = `/znacka/${b.slug}/`;
  const url = abs(pagePath(base, page));
  const title = termTitle(b.name);
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, { name: decode(b.name), url: base }];
  const meta: Meta = {
    title, description: stripTags(b.description_html), ...(b.noindex ? {} : { canonical: url }), robots: robots(b.noindex === 1),
    ...(page > 1 ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)], adultOnly: true,
    jsonLd: [breadcrumbLd(crumbs), itemListLd(abs(base), decode(b.name), items)].filter(Boolean),
  };
  return { meta, brand: b, crumbs, items, total, page, pages, base, q, qs: queryString(q), tree, isFiltered: filtered(q) };
}

// ---------- search ----------
export async function searchView(db: D1Database, query: string, page: number) {
  const tree = await catTree(db);
  const { items, total } = await searchProducts(db, query, page);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const meta: Meta = { title: searchTitle(query, page, pages), description: '', robots: ['follow', 'noindex'], graph: [], jsonLd: [] };
  return { meta, query, items, total, page, pages, tree };
}

// ---------- product ----------
export async function productView(db: D1Database, id: number) {
  const [data, tree] = await Promise.all([loadProduct(db, id), catTree(db)]);
  if (!data) return null;
  const { product: p, offers, catIds, history, brand } = data;
  const name = decode(p.name);
  const primary = tree.byId.get(p.primary_cat) ?? tree.byId.get(catIds[0] ?? 0);
  const chain = primary ? ancestry(tree, primary.id) : [];
  const url = abs(`/${p.slug}/`);
  const title = productTitle(p.name, p.seo_title);
  // Rank Math printed the raw short description; the REST export has it texturized (– „“ …)
  const description = p.seo_desc ? descFrom(p.seo_desc, p.short_html, { title: name }) : untexturize(stripTags(p.short_html));
  const inStock = offers.filter((o) => o.stock !== -1);
  const best: Offer | undefined = (inStock.length ? inStock : offers)[0];
  const prices = offers.map((o) => o.price);
  const stats = { n: offers.length, shops: new Set(offers.map((o) => o.domain)).size, min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 };
  const img = validImage(p.image);
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` })), { name, url: `/${p.slug}/` }];
  const skip = new Set(['ostatni', 'nezarazene', 'venusiny-kulicky-a-cinky']);
  const relCats = catIds.map((cid) => tree.byId.get(cid)).filter((c): c is Cat => !!c && !skip.has(c.slug)).slice(0, 6);
  const related = await relatedProducts(db, primary?.id ?? 0, p.id, p.created_at);
  const graph: unknown[] = [
    ...(img ? [{ '@type': 'ImageObject', '@id': img, url: img, inLanguage: 'cs' }] : []),
    { '@type': 'ItemPage', '@id': url + '#webpage', url, name: title, datePublished: isoPrague(p.created_at), dateModified: isoPrague(p.updated_at), isPartOf: { '@id': BASE + '/#website' }, ...(img ? { primaryImageOfPage: { '@id': img } } : {}), inLanguage: 'cs' },
    {
      '@type': 'Product', '@id': url + '#richSnippet', name, description,
      ...(brand && brand.slug !== 'ostatni' ? { brand: { '@type': 'Brand', name: decode(brand.name) } } : {}),
      ...(primary ? { category: decode(primary.name) } : {}),
      mainEntityOfPage: { '@id': url + '#webpage' },
      ...(p.ean ? { gtin: p.ean } : {}),
      ...(img ? { image: [{ '@type': 'ImageObject', url: img }] } : {}),
      ...(best ? {
        offers: {
          '@type': 'Offer', price: String(Math.round(best.price)), priceCurrency: 'CZK', priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
          availability: best.stock === -1 ? 'http://schema.org/OutOfStock' : 'http://schema.org/InStock', itemCondition: 'NewCondition', url,
          seller: { '@type': 'Organization', '@id': BASE + '/', name: 'Eroka', url: BASE, logo: BASE + '/wp-content/uploads/2026/02/Eroka_logo-e1770493799374.png' },
        },
      } : {}),
    },
  ];
  const meta: Meta = {
    title, description, ...(p.noindex ? {} : { canonical: url }), robots: robots(p.noindex === 1), ogType: 'product', ogImage: img || OG_DEFAULT, graph,
    jsonLd: [breadcrumbLd(crumbs)],
    extraMeta: [
      { property: 'og:updated_time', content: isoPrague(p.updated_at) },
      ...(best ? [{ property: 'product:price:amount', content: String(Math.round(best.price)) }, { property: 'product:price:currency', content: 'CZK' }, { property: 'product:availability', content: best.stock === -1 ? 'out of stock' : 'instock' }] : []),
    ],
  };
  return { meta, p, name, offers, best, stats, history, brand, primary, crumbs, relCats, related, tree, img };
}

/** Split the product description at the empty Content Egg headings ("Kde koupit … nejlevněji", "Vývoj ceny …"):
 *  their blocks (offer table, price chart) are rendered by the template in the same place. */
export function splitDescription(html: string): { before: string; offersHeading: string; middle: string; historyHeading: string; after: string } {
  const re = (w: string) => new RegExp(`<h3[^>]*>\\s*${w}[^<]*</h3>`, 'i');
  let s = html;
  const mo = re('Kde koupit').exec(s);
  const out = { before: s, offersHeading: '', middle: '', historyHeading: '', after: '' };
  if (mo) {
    out.before = s.slice(0, mo.index);
    out.offersHeading = mo[0];
    s = s.slice(mo.index + mo[0].length);
    out.middle = s;
  }
  const mh = re('Vývoj ceny').exec(mo ? out.middle : out.before);
  if (mh) {
    const src = mo ? out.middle : out.before;
    const head = src.slice(0, mh.index);
    if (mo) out.middle = head; else out.before = head;
    out.historyHeading = mh[0];
    out.after = src.slice(mh.index + mh[0].length);
  }
  return out;
}

// ---------- posts / pages ----------
export async function postView(db: D1Database, id: number) {
  const post = await loadPost(db, id);
  if (!post) return null;
  const url = abs(`/${post.slug}/`);
  const title = postTitle(post.title, post.seo_title);
  const description = descFrom(post.seo_desc, post.excerpt || post.content_html, { title: decode(post.title) });
  const img = post.image;
  if (post.type === 'page') {
    const meta: Meta = {
      title, description, ...(post.noindex ? {} : { canonical: url }), robots: robots(post.noindex === 1, post.seo_robots), ogImage: img || OG_DEFAULT,
      graph: [{ '@type': 'WebPage', '@id': url + '#webpage', url, name: title, datePublished: isoPrague(post.published_at), dateModified: isoPrague(post.modified_at), isPartOf: { '@id': BASE + '/#website' }, inLanguage: 'cs' }],
      jsonLd: [],
    };
    return { meta, post, cat: null, related: [] as PostCard[], comments: [], shopCats: [] as Cat[] };
  }
  const [cat, related, coms, tree] = await Promise.all([postCat(db, post.cat_id), relatedPosts(db, post), comments(db, post.id), catTree(db)]);
  const author = { '@type': 'Person', '@id': BASE + '/author/openclaw/', name: 'Ester', url: BASE + '/author/openclaw/' };
  const graph: unknown[] = [
    ...(img ? [{ '@type': 'ImageObject', '@id': img, url: img, ...(post.image_w ? { width: String(post.image_w), height: String(post.image_h) } : {}), ...(post.image_alt ? { caption: post.image_alt } : {}), inLanguage: 'cs' }] : []),
    { '@type': 'WebPage', '@id': url + '#webpage', url, name: title, datePublished: isoPrague(post.published_at), dateModified: isoPrague(post.modified_at), isPartOf: { '@id': BASE + '/#website' }, ...(img ? { primaryImageOfPage: { '@id': img } } : {}), inLanguage: 'cs' },
    author,
    {
      '@type': 'BlogPosting', headline: title, description, datePublished: isoPrague(post.published_at), dateModified: isoPrague(post.modified_at),
      author: { '@id': author['@id'], name: 'Ester' }, publisher: { '@id': BASE + '/#organization' }, ...(img ? { image: { '@id': img } } : {}),
      inLanguage: 'cs', '@id': url + '#richSnippet', isPartOf: { '@id': url + '#webpage' }, mainEntityOfPage: { '@id': url + '#webpage' },
    },
  ];
  const meta: Meta = {
    title, description, ...(post.noindex ? {} : { canonical: url }), robots: robots(post.noindex === 1, post.seo_robots), ogImage: img || OG_DEFAULT, graph, jsonLd: [],
    extraMeta: [{ property: 'article:published_time', content: isoPrague(post.published_at) }, { property: 'article:modified_time', content: isoPrague(post.modified_at) }],
  };
  // "Kde vybrat a koupit za nejlepší cenu" (eroka_article_cat_targets): explicit map, else reverse of the magbox map
  let targets = (links.clanek_kategorie as Record<string, string[]>)[post.slug] ?? [];
  if (!targets.length) for (const [c, arts] of Object.entries(links.magbox as Record<string, string[]>)) if (arts.includes(post.slug)) targets.push(c);
  const shopCats = [...new Set(targets)].slice(0, 4).map((s) => tree.bySlug.get(s)).filter((c): c is Cat => !!c);
  return { meta, post, cat, related, comments: coms, shopCats };
}

export async function blogView(db: D1Database, page: number, catId?: number) {
  const { items, total } = await listPosts(db, page, catId);
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  if (page > pages && page > 1) return null;
  const cat = catId ? await postCat(db, catId) : null;
  const base = cat ? `/${cat.slug}/` : '/blog/';
  const url = abs(pagePath(base, page));
  const title = termTitle(cat ? cat.name : 'Blog');
  const meta: Meta = {
    title, description: cat ? stripTags(cat.description) : '', canonical: url, robots: robots(false),
    ...(page > 1 ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)], jsonLd: [],
  };
  return { meta, items, total, page, pages, base, cat };
}

export async function homeView(db: D1Database) {
  const tree = await catTree(db);
  const MAG_MAIN = ['eroticke-darky', 'jak-ozivit-vztah', 'klitoris-jak-najit-a-stimulovat', 'bod-g-jak-najit-a-stimulovat', 'nejlepsi-sexualni-polohy', 'jak-na-eroticke-hry'];
  const MAG_MORE = ['co-je-dildo-prakticky-pruvodce-vyberem-bez-trapasu', 'jak-vybrat-analni-kolik-nejen-pro-muze-kompletni-pruvodce-pro-zacatecniky-bez-bolesti-a-tabu', 'nejlepsi-masturbator-pro-muze-2026-velke-srovnani-a-pruvodce-vyberem-bez-trapasu', 'erekcni-krouzek-jak-funguje-jak-vybrat-ten-spravny-a-proc-ho-musite-zkusit'];
  const [main, more, best, total] = await Promise.all([
    postsBySlugs(db, MAG_MAIN),
    postsBySlugs(db, MAG_MORE),
    bestsellers(db, tree),
    db.prepare("SELECT COUNT(*) AS n FROM products WHERE status = 'publish'").first<{ n: number }>(),
  ]);
  return { tree, main, more, best, total: Number(total?.n ?? 0) };
}

/** Homepage "Nejprodávanější pomůcky": WooCommerce [products orderby=popularity] over five categories, 10 items. */
async function bestsellers(db: D1Database, tree: Awaited<ReturnType<typeof catTree>>): Promise<Card[]> {
  const slugs = ['vibratory', 'parove-vibratory', 'damske-eroticke-pradlo', 'lubrikacni-gely-a-oleje', 'masazni-oleje-a-svicky'];
  const ids = slugs.map((s) => tree.bySlug.get(s)?.id).filter((x): x is number => !!x);
  if (!ids.length) return [];
  const rows = (await db.prepare(`SELECT DISTINCT x.product_id AS id, p.total_sales FROM cat_products x JOIN products p ON p.id = x.product_id
     WHERE x.cat_id IN (${ids.map(() => '?').join(',')}) AND p.status = 'publish' AND p.offer_count > 0 ORDER BY p.total_sales DESC, p.id DESC LIMIT 10`).bind(...ids).all<{ id: number }>()).results;
  return cardsByIds(db, rows.map((r) => r.id));
}

export type { Card, Cat, Post, PostCard };
