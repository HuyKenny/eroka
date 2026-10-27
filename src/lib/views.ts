// View models for each page type: data from D1 + SEO meta (title, description, canonical, prev/next, robots, JSON-LD)
// matching the WordPress/Rank Math output. Templates only render what these return.
import {
  ancestry, brandList, catImages, catTree, cardsByIds, comments, facets, listPosts, listProducts, loadBrand, loadCategory, loadPost, loadProduct,
  postCat, postsBySlugs, relatedPosts, relatedProducts, searchProducts, siteCache,
  type Card, type Cat, type Offer, type Post, type PostCard,
} from './db';
import { isFiltered, parseFilters, toListQuery, toQuery } from './filters';
import { BASE, OG_DEFAULT, PER_PAGE, POSTS_PER_PAGE, isoPrague } from './site';
import { brandTitle, categoryTitle, descFrom, postTitle, productTitle, robots, searchTitle, termTitle } from './seo';
import { cislo, decode } from './format';
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

// ---------- category ----------
export async function categoryView(db: D1Database, catId: number, page: number, sp: URLSearchParams) {
  const [cat, tree, fc, brands, imgs] = await Promise.all([loadCategory(db, catId), catTree(db), facets(db, `f:${catId}`), brandList(db), catImages(db)]);
  if (!cat) return null;
  const f = parseFilters(sp);
  const filtered = isFiltered(f);
  const q = toListQuery(f, page, brands, fc);
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
  const title = categoryTitle(cat.name, cat.seo_title, page);
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` }))];
  const noindex = cat.noindex === 1 || cat.seo_robots.includes('noindex');
  const magSlugs = (links.magbox as Record<string, string[]>)[cat.slug] ?? links.magbox_default;
  const meta: Meta = {
    title, description: descFrom(cat.seo_desc, cat.description_html, { term: decode(cat.name) },
      fc?.n ? `Porovnejte ceny ${cislo(fc.n)} produktů z kategorie ${decode(cat.name)} v ${fc.s.length} ověřených e-shopech.${fc.lo ? ` Nejlevněji od ${cislo(fc.lo)} Kč.` : ''}` : '', page),
    // filtered / re-sorted listings: noindex, follow and no canonical (the indexable listing is the plain URL)
    ...(noindex || filtered ? {} : { canonical: url }), robots: filtered ? ['noindex', 'follow'] : robots(noindex, cat.seo_robots),
    ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)],
    jsonLd: [breadcrumbLd(crumbs), itemListLd(abs(base), decode(cat.name), items)].filter(Boolean),
  };
  return {
    meta, cat, crumbs, items, total, page, pages, base, f, qs: toQuery(f), kids, kidsTitle, tree, fc, brands, imgs,
    magbox: magSlugs.map((s) => ({ slug: s, title: (links.titulky as Record<string, string>)[s] ?? s })),
    isFiltered: filtered,
  };
}

// ---------- brand ----------
export async function brandView(db: D1Database, slug: string, page: number, sp: URLSearchParams) {
  const [b, tree, brands] = await Promise.all([loadBrand(db, slug), catTree(db), brandList(db)]);
  if (!b) return null;
  const fc = await facets(db, `fb:${b.id}`);
  const f = parseFilters(sp);
  f.znacka = [];
  const filtered = isFiltered(f);
  const q = toListQuery(f, page, brands, fc, tree);
  const { items, total } = await listProducts(db, { brand: b.id }, q, b.count);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages && page > 1) return null;
  const base = `/znacka/${b.slug}/`;
  const url = abs(pagePath(base, page));
  const title = brandTitle(b.name, page);
  // brands with fewer than 3 products are thin pages: noindex (and left out of the sitemap)
  const thin = b.noindex === 1 || b.count < 3;
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, { name: decode(b.name), url: base }];
  const meta: Meta = {
    title, description: descFrom('', b.description_html, {}, fc?.n ? `${decode(b.name)}: porovnejte ceny ${cislo(fc.n)} produktů v ${fc.s.length} ověřených e-shopech.${fc.lo ? ` Nejlevněji od ${cislo(fc.lo)} Kč.` : ''}` : '', page),
    ...(thin || filtered ? {} : { canonical: url }), robots: filtered ? ['noindex', 'follow'] : robots(thin),
    ...(page > 1 && !filtered ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages && !filtered ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)], adultOnly: true,
    jsonLd: [breadcrumbLd(crumbs), itemListLd(abs(base), decode(b.name), items)].filter(Boolean),
  };
  return { meta, brand: b, crumbs, items, total, page, pages, base, f, qs: toQuery(f), tree, fc, brands, isFiltered: filtered };
}

// ---------- search ----------
export async function searchView(db: D1Database, query: string, page: number) {
  const [tree, brands] = await Promise.all([catTree(db), brandList(db)]);
  const { items, total } = await searchProducts(db, query, page);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const meta: Meta = { title: searchTitle(query, page, pages), description: '', robots: ['follow', 'noindex'], graph: [], jsonLd: [] };
  const { cats, brs } = matchNames(query, tree, brands);
  return { meta, query, items, total, page, pages, tree, cats, brs };
}

/** Categories and brands whose name contains every typed word (diacritics-insensitive) — search page + suggestions. */
export function matchNames(query: string, tree: Awaited<ReturnType<typeof catTree>>, brands: Awaited<ReturnType<typeof brandList>>) {
  const fold = (t: string) => decode(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return { cats: [] as Cat[], brs: [] as Array<{ slug: string; name: string; count: number }> };
  const hit = (name: string) => { const n = fold(name); return words.every((w) => n.includes(w)); };
  const cats = [...tree.byId.values()].filter((c) => c.count_total > 0 && !c.noindex && hit(c.name)).sort((a, b) => b.count_total - a.count_total).slice(0, 6);
  const brs = [...brands.byId.values()].filter((b) => b.slug !== 'ostatni' && hit(b.name)).sort((a, b) => b.count - a.count).slice(0, 6);
  return { cats, brs };
}

// ---------- product ----------
export async function productView(db: D1Database, id: number) {
  const [data, tree] = await Promise.all([loadProduct(db, id), catTree(db)]);
  if (!data) return null;
  const { product: p, offers, catIds, history, brand, params } = data;
  const name = decode(p.name);
  // breadcrumb/category: a noindex category (e.g. "Ostatní") only when the product has no other
  const cats = [p.primary_cat, ...catIds].map((i) => tree.byId.get(i)).filter((c): c is Cat => !!c);
  const primary = cats.find((c) => !c.noindex) ?? cats[0];
  const chain = primary ? ancestry(tree, primary.id) : [];
  const url = abs(`/${p.slug}/`);
  const title = productTitle(p.name, p.seo_title);
  // seo_desc = Rank Math description or the raw (untexturized) short description from the migration
  const prices0 = offers.map((o) => o.price);
  const description = descFrom(p.seo_desc, p.short_html, { title: name },
    offers.length ? `${name} – porovnejte ceny v ${new Set(offers.map((o) => o.domain)).size} obchodech, nejlevněji od ${cislo(Math.min(...prices0))} Kč.` : '');
  // without any offer the page is thin and a Product snippet without offers is invalid → noindex, no Product node
  const noindex = p.noindex === 1 || offers.length === 0;
  const inStock = offers.filter((o) => o.stock !== -1);
  const best: Offer | undefined = (inStock.length ? inStock : offers)[0];
  const prices = offers.map((o) => o.price);
  const stats = { n: offers.length, shops: new Set(offers.map((o) => o.domain)).size, min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 };
  const img = validImage(p.image);
  const crumbs: Crumb[] = [{ name: 'Domů', url: '/' }, ...chain.map((c) => ({ name: decode(c.name), url: `/${c.slug}/` })), { name, url: `/${p.slug}/` }];
  const skip = new Set(['ostatni', 'nezarazene', 'venusiny-kulicky-a-cinky']);
  const relCats = catIds.map((cid) => tree.byId.get(cid)).filter((c): c is Cat => !!c && !skip.has(c.slug)).slice(0, 6);
  const related = await relatedProducts(db, primary?.id ?? 0, p.id, p.min_price || 0);
  let gallery: string[] = [];
  try { gallery = p.images ? (JSON.parse(p.images) as string[]).map(validImage).filter(Boolean) : []; } catch { /* no gallery */ }
  const graph: unknown[] = [
    ...(img ? [{ '@type': 'ImageObject', '@id': img, url: img, inLanguage: 'cs' }] : []),
    { '@type': 'ItemPage', '@id': url + '#webpage', url, name: title, datePublished: isoPrague(p.created_at), dateModified: isoPrague(p.updated_at), isPartOf: { '@id': BASE + '/#website' }, ...(img ? { primaryImageOfPage: { '@id': img } } : {}), inLanguage: 'cs' },
    ...(offers.length ? [{
      '@type': 'Product', '@id': url + '#richSnippet', name, description, sku: String(p.id),
      ...(brand && brand.slug !== 'ostatni' ? { brand: { '@type': 'Brand', name: decode(brand.name) } } : {}),
      ...(primary ? { category: decode(primary.name) } : {}),
      mainEntityOfPage: { '@id': url + '#webpage' },
      ...(p.ean ? { gtin: p.ean } : {}),
      ...(img ? { image: [{ '@type': 'ImageObject', url: img }] } : {}),
      // price comparison: one AggregateOffer over all shops (lowPrice/highPrice/offerCount)
      ...(best ? {
        offers: {
          '@type': 'AggregateOffer', priceCurrency: 'CZK', lowPrice: String(Math.round(stats.min)), highPrice: String(Math.round(stats.max)), offerCount: String(stats.n),
          availability: inStock.length ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', url,
        },
      } : {}),
    }] : []),
  ];
  const meta: Meta = {
    title, description, ...(noindex ? {} : { canonical: url }), robots: robots(noindex), ogType: 'product', ogImage: img || OG_DEFAULT, graph,
    jsonLd: [breadcrumbLd(crumbs)],
    extraMeta: [
      { property: 'og:updated_time', content: isoPrague(p.updated_at) },
      ...(best ? [{ property: 'product:price:amount', content: String(Math.round(best.price)) }, { property: 'product:price:currency', content: 'CZK' }, { property: 'product:availability', content: best.stock === -1 ? 'out of stock' : 'instock' }] : []),
    ],
  };
  return { meta, p, name, offers, best, stats, history, brand, primary, crumbs, relCats, related, tree, img, gallery, params };
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
  const author = { '@type': 'Person', '@id': BASE + '/#autor-ester', name: 'Ester' };
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
  const title = cat ? termTitle(cat.name, page) : termTitle('Magazín: rady a tipy o erotických pomůckách', page);
  const meta: Meta = {
    title, description: descFrom('', cat ? cat.description : '', {}, cat ? `Články z rubriky ${decode(cat.name)} v magazínu Eroka.cz: praktické rady, tipy a průvodci výběrem.` : 'Praktické rady bez mýtů a zbytečného studu: průvodci výběrem erotických pomůcek, tipy pro páry, recenze a novinky.', page),
    canonical: url, robots: robots(false),
    ...(page > 1 ? { prev: abs(pagePath(base, page - 1)) } : {}),
    ...(page < pages ? { next: abs(pagePath(base, page + 1)) } : {}),
    graph: [collection(url, title)], jsonLd: [],
  };
  return { meta, items, total, page, pages, base, cat };
}

export interface HomeBlocks { deals: number[]; popular: number[]; brands: Array<[number, number]>; shops: Array<[string, number]>; products: number; offers: number }
export async function homeView(db: D1Database) {
  const MAG = ['eroticke-darky', 'jak-ozivit-vztah', 'nejlepsi-masturbator-pro-muze-2026-velke-srovnani-a-pruvodce-vyberem-bez-trapasu', 'klitoris-jak-najit-a-stimulovat'];
  const [tree, brands, imgs, raw, mag] = await Promise.all([catTree(db), brandList(db), catImages(db), siteCache(db, 'home'), postsBySlugs(db, MAG)]);
  let home: HomeBlocks = { deals: [], popular: [], brands: [], shops: [], products: 0, offers: 0 };
  try { if (raw) home = JSON.parse(raw) as HomeBlocks; } catch { /* nightly block missing */ }
  const cards = await cardsByIds(db, [...home.deals, ...home.popular]);
  const by = new Map(cards.map((c) => [c.id, c]));
  const pick = (ids: number[]) => ids.map((i) => by.get(i)).filter((x): x is Card => !!x);
  return { tree, brands, imgs, home, deals: pick(home.deals), popular: pick(home.popular), mag };
}

export type { Card, Cat, Post, PostCard };
