import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';

export const prerender = false;
// Production serves the WordPress robots.txt byte for byte (parity); staging is closed.
const PROD = `User-agent: *
Disallow: /wp-content/uploads/wc-logs/
Disallow: /wp-content/uploads/woocommerce_transient_files/
Disallow: /wp-content/uploads/woocommerce_uploads/
Disallow: /*?add-to-cart=
Disallow: /*?*add-to-cart=
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

Sitemap: https://eroka.cz/sitemap_index.xml
`;
export const GET: APIRoute = () => {
  const prod = getEnv().ENVIRONMENT === 'production';
  return new Response(prod ? PROD : 'User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'public, max-age=3600' } });
};
