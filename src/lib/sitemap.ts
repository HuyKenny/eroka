// Sitemaps with the Rank Math file names Google already knows (sitemap_index.xml, product-sitemapN.xml …, 200 URLs
// per file). Materialised into site_cache by rebuildSitemaps() (import Worker after each run); the routes only read.
// Imported by both Workers — depends on a D1 handle only.
import { BASE, isoPrague } from './site';

const PER_FILE = 200;

interface U { loc: string; mod: string }
// D1 keeps WordPress' local (Europe/Prague) dates → W3C datetime with the Prague offset
const utc = (s: string | null | undefined) => isoPrague(String(s ?? ''));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
function urlset(urls: U[]): string {
  return HEAD + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `\t<url>\n\t\t<loc>${esc(u.loc)}</loc>${u.mod ? `\n\t\t<lastmod>${u.mod}</lastmod>` : ''}\n\t</url>`).join('\n') + '\n</urlset>';
}
const latest = (urls: U[]) => urls.reduce((m, u) => (u.mod > m ? u.mod : m), '');

export async function collect(db: D1Database): Promise<Record<string, U[]>> {
  const all = async <T>(sql: string) => (await db.prepare(sql).all<T>()).results;
  const [posts, pages, products, cats, brands, pcats] = await Promise.all([
    all<{ slug: string; m: string }>("SELECT slug, modified_at AS m FROM posts WHERE type = 'post' AND status = 'publish' AND noindex = 0 ORDER BY published_at DESC"),
    all<{ slug: string; m: string }>("SELECT slug, modified_at AS m FROM posts WHERE type = 'page' AND status = 'publish' AND noindex = 0 AND slug NOT IN ('domov','produkt','blog') ORDER BY published_at DESC"),
    // only indexable products (with offers); lastmod = content change or the last change of the lowest price
    all<{ slug: string; m: string }>(`SELECT slug, MAX(updated_at, COALESCE((SELECT MAX(h.day) || ' 00:00:00' FROM price_history h WHERE h.product_id = p.id), '')) AS m
       FROM products p WHERE status = 'publish' AND noindex = 0 AND offer_count > 0 ORDER BY m DESC, id DESC`),
    all<{ slug: string; m: string }>(`SELECT c.slug, (SELECT MAX(p.updated_at) FROM cat_products x JOIN products p ON p.id = x.product_id WHERE x.cat_id = c.id) AS m
       FROM categories c WHERE c.noindex = 0 AND c.count_total >= 5 AND c.seo_robots NOT LIKE '%noindex%'
         AND NOT EXISTS (SELECT 1 FROM slugs s WHERE s.slug = c.slug AND s.kind <> 'category')
         AND NOT EXISTS (SELECT 1 FROM redirects r WHERE r.from_path = '/' || c.slug || '/') ORDER BY c.count_total DESC`),
    all<{ slug: string; m: string }>(`SELECT b.slug, (SELECT MAX(p.updated_at) FROM brand_products x JOIN products p ON p.id = x.product_id WHERE x.brand_id = b.id) AS m
       FROM brands b WHERE b.noindex = 0 AND b.count >= 3 AND NOT EXISTS (SELECT 1 FROM slugs s WHERE s.slug = b.slug AND s.kind = 'product') ORDER BY b.count DESC`),
    all<{ slug: string; m: string }>(`SELECT c.slug, (SELECT MAX(modified_at) FROM posts p WHERE p.cat_id = c.id AND p.type = 'post' AND p.status = 'publish') AS m FROM post_categories c WHERE c.count > 0`),
  ]);
  const map = (rows: Array<{ slug: string; m: string }>, pre = '/') => rows.map((r) => ({ loc: `${BASE}${pre}${r.slug}/`, mod: utc(r.m) }));
  const out: Record<string, U[]> = {};
  out['post-sitemap'] = map(posts);
  const pg = map(pages);
  const lastPost = latest(out['post-sitemap']!);
  out['page-sitemap'] = [{ loc: BASE + '/', mod: latest([...pg, ...out['post-sitemap']!]) }, { loc: BASE + '/blog/', mod: lastPost }, ...pg];
  const chunk = (name: string, list: U[]) => { for (let i = 0, n = 1; i < list.length; i += PER_FILE, n++) out[`${name}${n}`] = list.slice(i, i + PER_FILE); };
  chunk('product-sitemap', map(products));
  out['category-sitemap'] = map(pcats);
  chunk('product_brand-sitemap', map(brands, '/znacka/'));
  chunk('product_cat-sitemap', map(cats));
  return out;
}

export async function rebuildSitemaps(db: D1Database): Promise<{ files: number; urls: number }> {
  const files = await collect(db);
  const now = new Date().toISOString();
  const order = ['post-sitemap', 'page-sitemap', ...Object.keys(files).filter((k) => k.startsWith('product-sitemap')), 'category-sitemap',
    ...Object.keys(files).filter((k) => k.startsWith('product_brand-sitemap')), ...Object.keys(files).filter((k) => k.startsWith('product_cat-sitemap'))];
  const index = HEAD + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    order.filter((k) => files[k]?.length).map((k) => `\t<sitemap>\n\t\t<loc>${BASE}/${k}.xml</loc>\n\t\t<lastmod>${latest(files[k]!)}</lastmod>\n\t</sitemap>`).join('\n') + '\n</sitemapindex>';
  const put = (k: string, v: string) => db.prepare('INSERT INTO site_cache (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, v, now);
  const stmts = [put('sitemap:index', index), put('sitemap:files', JSON.stringify(order.filter((k) => files[k]?.length)))];
  for (const k of order) if (files[k]?.length) stmts.push(put(`sitemap:${k}`, urlset(files[k]!)));
  // drop files that no longer exist (catalogue shrank)
  stmts.push(db.prepare(`DELETE FROM site_cache WHERE key LIKE 'sitemap:%' AND updated_at <> ?`).bind(now));
  for (let i = 0; i < stmts.length; i += 25) await db.batch(stmts.slice(i, i + 25));
  return { files: order.length, urls: Object.values(files).reduce((n, l) => n + l.length, 0) };
}
