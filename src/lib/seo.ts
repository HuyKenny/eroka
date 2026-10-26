// Titles/descriptions = Rank Math templates of the WordPress site (backups/eroka-wp-export-2026-10-26/rankmath-settings.json):
//   product   "%title% – cena a recenze | Eroka.cz"        desc %excerpt%
//   category  "%term% %currentyear% – srovnání cen a nejlepší výběr | Eroka"   desc %term_description%
//   brand     "%term% | Eroka"                              desc %term_description%
//   post/page "%title% | Eroka"                             desc %excerpt%
//   paged archives keep their title (no %page% in the templates), search "%search_query% %page% | Eroka", 404 "Stránka nenalezena | Eroka".
// A per-object Rank Math title/description (seo_title/seo_desc) wins and may contain the same variables.
import { decode, stripTags } from './format';

const SEP = '|';
const SITE = 'Eroka';

export interface Vars { title?: string; term?: string; excerpt?: string; page?: number; pages?: number }

export function pageSuffix(page = 1, pages = 1): string {
  return page > 1 ? ` - Stránka ${page} z ${pages}` : '';
}

/** Expands the Rank Math variables used on eroka (unknown ones are dropped like Rank Math does with empty values). */
export function rmVars(tpl: string, v: Vars): string {
  const year = String(new Date().getFullYear());
  return tpl
    .replace(/%title%/g, v.title ?? '')
    .replace(/%term%/g, v.term ?? '')
    .replace(/%excerpt%/g, v.excerpt ?? '')
    .replace(/%term_description%/g, v.excerpt ?? '')
    .replace(/%sitename%/g, SITE)
    .replace(/%sep%/g, SEP)
    .replace(/%currentyear%/g, year)
    .replace(/%page%/g, pageSuffix(v.page, v.pages))
    .replace(/%[a-z_]+%/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function productTitle(name: string, custom = ''): string {
  return rmVars(custom || '%title% – cena a recenze | Eroka.cz', { title: decode(name) });
}
export function categoryTitle(name: string, custom: string): string {
  return rmVars(custom || '%term% %currentyear% – srovnání cen a nejlepší výběr | Eroka', { term: decode(name) });
}
/** Brand, blog category and the blog page keep the same title on /page/N/ (verified on the live site 26. 10.). */
export function termTitle(name: string): string {
  return rmVars('%term% %sep% %sitename%', { term: decode(name) });
}
export function postTitle(title: string, custom = ''): string {
  return rmVars(custom || '%title% %sep% %sitename%', { title: decode(title) });
}
export function searchTitle(q: string, page: number, pages: number): string {
  return rmVars('%search_query% %page% %sep% %sitename%', { page, pages }).replace(/^/, q + ' ').replace(/\s{2,}/g, ' ').trim();
}
export function descFrom(custom: string, html: string, v: Vars = {}): string {
  return custom ? rmVars(custom, { ...v, excerpt: stripTags(html) }) : stripTags(html);
}

/** Rank Math robots meta (index,follow + the max-* defaults the site uses). */
export function robots(noindex: boolean): string[] {
  return noindex ? ['follow', 'noindex'] : ['follow', 'index', 'max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large'];
}
