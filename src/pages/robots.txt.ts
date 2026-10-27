import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';

export const prerender = false;
// Production robots.txt (27. 10. 2026; the WordPress/WooCommerce rules are gone with WordPress): affiliate exits and the
// API are not for crawlers (thumbnails under /img/ stay crawlable for image search). Staging is closed.
const PROD = `User-agent: *
Disallow: /go/
Disallow: /api/

Sitemap: https://eroka.cz/sitemap_index.xml
`;
export const GET: APIRoute = () => {
  const prod = getEnv().ENVIRONMENT === 'production';
  return new Response(prod ? PROD : 'User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'public, max-age=3600' } });
};
