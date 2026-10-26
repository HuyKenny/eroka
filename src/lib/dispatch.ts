// Resolves every root path the way WordPress did on eroka:
//   /<slug>/                → product | product category | post | page | blog category (slugs table, product wins)
//   /<slug>/page/<n>/       → paged product category / blog category / the blog page
//   /page/<n>/?s=…          → paged search
//   unknown /<slug>/        → redirect_guess_404_permalink (a published slug starting with it) or 404
import { guessSlug, resolveSlug } from './db';

export type Route =
  | { kind: 'product' | 'category' | 'post' | 'page' | 'postcat'; id: number; page: number }
  | { kind: 'blog'; page: number }
  | { kind: 'search'; page: number }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

export async function dispatch(db: D1Database, pathname: string, sp: URLSearchParams): Promise<Route> {
  let path: string;
  try { path = decodeURIComponent(pathname); } catch { return { kind: 'notfound' }; }
  const seg = path.split('/').filter(Boolean);
  let page = 1;
  if (seg.length >= 2 && seg[seg.length - 2] === 'page' && /^\d+$/.test(seg[seg.length - 1]!)) {
    page = Number(seg.pop());
    seg.pop();
    if (page <= 1) return { kind: 'redirect', to: '/' + seg.map(encodeURIComponent).join('/') + (seg.length ? '/' : '') };
  }
  if (seg.length === 0) return sp.has('s') ? { kind: 'search', page } : page > 1 ? { kind: 'redirect', to: '/' } : { kind: 'notfound' };
  if (seg.length !== 1) return { kind: 'notfound' };
  const slug = seg[0]!.toLowerCase();
  if (slug !== seg[0]) return { kind: 'redirect', to: `/${encodeURIComponent(slug)}/` };
  const r = await resolveSlug(db, slug);
  if (r) {
    if (r.kind === 'page' && slug === 'blog') return { kind: 'blog', page };
    if (page > 1 && r.kind !== 'category' && r.kind !== 'postcat') return { kind: 'notfound' };
    return { kind: r.kind as 'product', id: r.ref_id, page };
  }
  if (page === 1) {
    const g = await guessSlug(db, slug);
    if (g) return { kind: 'redirect', to: `/${encodeURIComponent(g)}/` };
  }
  return { kind: 'notfound' };
}
