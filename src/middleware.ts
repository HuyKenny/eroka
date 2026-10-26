/**
 * Every on-demand request (port of the kakapo middleware):
 *  1. www → apex, host allow-list, staging whole host behind Access
 *  2. trailing-slash canonicalisation, legacy WordPress 301s and the D1 `redirects` table (Rank Math export)
 *  3. edge cache (Cache API) for public GET HTML. Key = host + path + whitelisted params + data_version + build id,
 *     all in the PATH (zone cache rules from the WordPress era strip query strings).
 *  4. security headers; non-production hosts get X-Robots-Tag noindex.
 */
import { defineMiddleware } from 'astro:middleware';
import { authenticateAdmin } from './lib/server/access';
import { allowedHosts, getEnv, isLocal } from './lib/server/env';
import { clientIp } from './lib/server/http';
import { dataVersion } from './lib/server/versions';
import { securityHeaders } from './lib/security';

/** Query params that change the rendered content (utm_*, fbclid … do not split the cache). */
const CONTENT_PARAMS = new Set(['s', 'post_type', 'orderby', 'min_price', 'max_price', 'filter_store', 'q']);
const NO_CACHE = [/^\/go\//, /^\/api\//, /^\/wp-content\//];
const CACHE_TTL = 600;

const LEGACY: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^\/(wp-)?sitemap\.xml$/, () => '/sitemap_index.xml'],
  [/^\/kategorie-produktu\/(.+)$/, (m) => '/' + m[1]!.split('/').filter(Boolean).pop() + '/'],
  [/^\/product\/(.+)$/, (m) => '/' + m[1]!.split('/').filter(Boolean).pop() + '/'],
  [/^\/category\/(.+)$/, (m) => '/' + m[1]!.split('/').filter(Boolean).pop() + '/'],
  [/^\/brandstore\/([^/]+)\/?(.*)$/, (m) => '/znacka/' + m[1] + '/' + (m[2] ?? '')],
  [/^\/produkt\/$/, () => '/'],
  [/^\/(shop|obchod|kosik|cart|checkout|pokladna|muj-ucet|my-account)\/$/, () => '/'],
  [/^\/(feed\/)?atom\/?$/, () => '/feed/'],
  // old brand base with a diacritic (Rank Math had hundreds of these pointing at /vibratory/)
  [/^\/(?:zna%C4%8Dka|znau010dka)\/(.+)$/i, (m) => '/znacka/' + m[1]],
  // feeds once put the availability text into image URLs: /<product>/in stock/
  [/^\/([^/]+)\/in(?:%20| )stock\/?$/i, (m) => '/' + m[1] + '/'],
  // WordPress feeds of single objects/archives
  [/^\/(.+)\/feed\/?$/, (m) => '/' + m[1] + '/'],
  // front page slug and the WooCommerce shop base
  [/^\/(domov|homepage)\/$/, () => '/'],
];

export function cacheKey(url: URL, version: string): string | null {
  const sp = new URLSearchParams();
  const entries = [...url.searchParams.entries()].filter(([k]) => CONTENT_PARAMS.has(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length > 8) return null;
  for (const [k, v] of entries) {
    if (v.length > 120) return null;
    sp.append(k, k === 's' || k === 'q' ? v.trim().toLowerCase() : v);
  }
  const q = sp.toString();
  return `https://${url.host}/__kc/${encodeURIComponent(version)}/${__BUILD_ID__}${url.pathname}${q ? '__q/' + encodeURIComponent(q) : ''}`;
}

function finish(res: Response, url: URL, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  const env = getEnv();
  for (const [k, v] of Object.entries(securityHeaders(env.ANALYTICS_ENABLED === '1'))) if (!out.headers.has(k)) out.headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  if (env.ENVIRONMENT !== 'production' || /^\/(go|api)\//.test(url.pathname)) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
const redirect = (to: string, status = 301) => new Response(null, { status, headers: { location: to, 'cache-control': 'public, max-age=3600' } });

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = ctx.url;
  if (ctx.isPrerendered) return next();
  const env = getEnv();

  const host = url.hostname.toLowerCase();
  if (env.ENVIRONMENT === 'production' && host === 'www.eroka.cz') return redirect('https://eroka.cz' + url.pathname + url.search, 301);

  const hosts = allowedHosts(env);
  if (!isLocal(env) && hosts.length && !hosts.includes(host)) {
    return finish(new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), url);
  }

  if (env.REQUIRE_ACCESS_EVERYWHERE === '1') {
    const auth = await authenticateAdmin(ctx.request, env);
    if (!auth.ok) return finish(new Response('Přístup jen pro přihlášené.', { status: auth.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }), url);
  }

  const isGet = ctx.request.method === 'GET' || ctx.request.method === 'HEAD';
  if (isGet) {
    // WordPress collapsed duplicate slashes and used lowercase slugs
    if (/\/\/+/.test(url.pathname)) return finish(redirect(url.pathname.replace(/\/\/+/g, '/') + url.search), url);
    for (const [re, to] of LEGACY) {
      const m = re.exec(url.pathname);
      if (m) return finish(redirect(to(m) + url.search), url);
    }
    // canonical trailing slash for pages (files like /sitemap_index.xml, /robots.txt, /wp-content/… keep theirs)
    if (!url.pathname.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(url.pathname) && !url.pathname.startsWith('/api/')) {
      return finish(redirect(url.pathname + '/' + url.search, 301), url);
    }
    if (!NO_CACHE.some((r) => r.test(url.pathname)) && url.pathname !== '/') {
      try {
        const r = await env.DB.prepare('SELECT to_path, status FROM redirects WHERE from_path = ?').bind(decodeURIComponent(url.pathname).toLowerCase()).first<{ to_path: string; status: number }>();
        if (r) return finish(r.status === 410 ? new Response('Gone', { status: 410, headers: { 'cache-control': 'public, max-age=3600' } }) : redirect(r.to_path + url.search, r.status), url);
      } catch { /* a DB hiccup must not break pages */ }
    }
  }

  const cacheable = isGet && !NO_CACHE.some((r) => r.test(url.pathname)) && !ctx.request.headers.has('authorization') && env.REQUIRE_ACCESS_EVERYWHERE !== '1';
  const cache = cacheable && typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;
  let key: string | null = null;
  if (cache) {
    try {
      key = cacheKey(url, await dataVersion());
      if (key) {
        const hit = await cache.match(key);
        if (hit) return finish(hit, url, { 'X-Eroka-Page-Cache': 'HIT', 'Cache-Control': 'public, max-age=0, must-revalidate' });
      }
    } catch { key = null; }
  }

  if (url.searchParams.has('s') && env.RL_SEARCH && !(await env.RL_SEARCH.limit({ key: clientIp(ctx.request) })).success) {
    return finish(new Response('Příliš mnoho vyhledávání, zkuste to za chvíli.', { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '30' } }), url);
  }

  const res = await next();
  const cc = res.headers.get('cache-control') ?? '';
  const ct = res.headers.get('content-type') ?? '';
  const isHtml = ct.includes('text/html');
  const isXml = ct.includes('xml');
  if (cache && key && res.status === 200 && (isHtml || isXml) && !res.headers.has('set-cookie') && !/private|no-store/.test(cc)) {
    const toStore = new Response(res.clone().body, res);
    toStore.headers.set('Cache-Control', `public, s-maxage=${CACHE_TTL}`);
    const put = cache.put(key, toStore).catch((e: unknown) => console.log('cache.put failed: ' + String(e)));
    if (ctx.locals.cfContext?.waitUntil) ctx.locals.cfContext.waitUntil(put); else await put;
    return finish(res, url, { 'X-Eroka-Page-Cache': 'MISS', 'Cache-Control': isXml ? 'public, max-age=3600' : 'public, max-age=0, must-revalidate' });
  }
  if (isHtml && !res.headers.has('cache-control')) return finish(res, url, { 'Cache-Control': 'public, max-age=0, must-revalidate' });
  return finish(res, url);
});
