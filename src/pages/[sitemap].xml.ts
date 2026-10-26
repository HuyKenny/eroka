// Rank Math sitemap files: post-sitemap.xml, page-sitemap.xml, category-sitemap.xml, product-sitemapN.xml,
// product_brand-sitemapN.xml, product_cat-sitemapN.xml — served from site_cache (lib/sitemap.ts).
import type { APIRoute } from 'astro';
import { getEnv } from '../lib/server/env';
import { siteCache } from '../lib/db';

export const prerender = false;
const NAME = /^(post-sitemap|page-sitemap|category-sitemap|product-sitemap\d+|product_brand-sitemap\d+|product_cat-sitemap\d+)$/;
export const GET: APIRoute = async ({ params }) => {
  const name = String(params.sitemap ?? '');
  const xml = NAME.test(name) ? await siteCache(getEnv().DB, `sitemap:${name}`) : null;
  if (!xml) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=UTF-8', 'x-robots-tag': 'noindex, follow' } });
};
