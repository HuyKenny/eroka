// Titles and descriptions (optimised 27. 10. 2026, Kenny: shorter titles, no "recenze" the pages do not have, descriptions
// ≤ 155 characters, a filled-in template where the object has no text, " – strana N" on paged listings):
//   product   "{name} – srovnání cen | Eroka"            category "{term}: srovnání cen {year} | Eroka"
//   brand     "{term}: srovnání cen a modelů | Eroka"       post/page "{title} | Eroka"
// A per-object title/description from Rank Math (seo_title/seo_desc) still wins and may contain its variables.
import { decode, stripTags } from './format';

const SEP = '|';
const SITE = 'Eroka';

export interface Vars { title?: string; term?: string; excerpt?: string; page?: number; pages?: number }

function pageSuffix(page = 1, pages = 1): string {
  return page > 1 ? ` - Stránka ${page} z ${pages}` : '';
}

/** Expands the Rank Math variables used on eroka (unknown ones are dropped like Rank Math does with empty values). */
function rmVars(tpl: string, v: Vars): string {
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

/** " – strana N" before the site name on paged listings. */
export function paged(title: string, page = 1): string {
  if (page <= 1) return title;
  const i = title.lastIndexOf(` ${SEP} `);
  return i > 0 ? `${title.slice(0, i)} – strana ${page}${title.slice(i)}` : `${title} – strana ${page}`;
}
export function productTitle(name: string, custom = ''): string {
  return rmVars(custom || '%title% – srovnání cen | Eroka', { title: decode(name) });
}
export function categoryTitle(name: string, custom: string, page = 1): string {
  return paged(rmVars(custom || '%term%: srovnání cen %currentyear% | Eroka', { term: decode(name) }), page);
}
export function brandTitle(name: string, page = 1): string {
  return paged(rmVars('%term%: srovnání cen a modelů %sep% %sitename%', { term: decode(name) }), page);
}
/** Blog category and the blog itself. */
export function termTitle(name: string, page = 1): string {
  return paged(rmVars('%term% %sep% %sitename%', { term: decode(name) }), page);
}
export function postTitle(title: string, custom = ''): string {
  return rmVars(custom || '%title% %sep% %sitename%', { title: decode(title) });
}
export function searchTitle(q: string, page: number, pages: number): string {
  return rmVars('%search_query% %page% %sep% %sitename%', { page, pages }).replace(/^/, q + ' ').replace(/\s{2,}/g, ' ').trim();
}
/** Meta description: Rank Math override or the object's text, cut to ~155 characters at a word boundary; `fallback`
 *  (a filled-in template) when there is no text at all; "Strana N: " on paged listings. */
export function descFrom(custom: string, html: string, v: Vars = {}, fallback = '', page = 1): string {
  const text = (custom ? rmVars(custom, { ...v, excerpt: stripTags(html) }) : stripTags(html)) || fallback;
  return (page > 1 && text ? `Strana ${page}: ` : '') + clamp(text, page > 1 ? 145 : 155);
}
export function clamp(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.6 ? cut.slice(0, i) : t.slice(0, max)).replace(/[\s,;:–(-]+$/, '') + '…';
}

/** Rank Math robots meta: follow/nofollow, index/noindex, extra flags from the object (noimageindex …), max-* defaults. */
export function robots(noindex: boolean, extra = ''): string[] {
  const flags = extra.split(',').map((x) => x.trim()).filter((x) => x && !['index', 'noindex', 'follow', 'nofollow'].includes(x));
  const nofollow = extra.split(',').map((x) => x.trim()).includes('nofollow');
  const head = [nofollow ? 'nofollow' : 'follow', noindex ? 'noindex' : 'index', ...flags];
  return noindex ? head : [...head, 'max-snippet:-1', 'max-video-preview:-1', 'max-image-preview:large'];
}
