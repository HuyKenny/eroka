// Product photos are taken from the partners' feeds and resized on the fly — nothing is stored (Kenny, 27. 10. 2026).
//  - wsrv.nl (Kenny's choice) for every shop it accepts
//  - our Worker eroka-img (/img/<w>/<base64url>.webp, workers/img) for the shops wsrv.nl refuses with
//    "Domain or TLD blocked by policy" (checked 27. 10. 2026: Růžový slon, ErosStar, Vibratory.net, Sexshop.cz)
// Růžový slon also has a smaller source variant (/product/detail/, ≤1000 px) — less to download and decode.

/** Hosts wsrv.nl refuses; keep in sync with HOSTS in workers/img/src/index.ts. */
const OWN = new Set(['cdn.ruzovyslon.cz', 'www.erosstar.cz', 'erosstar.cz', 'vibratory.net', 'www.vibratory.net', 'www.sexshop.cz', 'pictures.sexshop.cz']);
/** Widths both resizers are asked for (eroka-img accepts only these). */
export const WIDTHS = [160, 320, 480, 640, 960] as const;
export type Width = (typeof WIDTHS)[number];

export function imgUrl(url: string | null | undefined): string {
  const u = String(url ?? '').trim();
  return u.replace(/^https:\/\/cdn\.ruzovyslon\.cz\/content\/images\/product\/original\//, 'https://cdn.ruzovyslon.cz/content/images/product/detail/');
}

/** Feeds sometimes put text ("in stock") or a broken host into the image field (erk_opt_html 3b). */
export function validImage(url: string | null | undefined): string {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+\//i.test(u) || /%20/.test(u.split('/')[2] ?? '')) return '';
  return u;
}

function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL of the photo fitted inside w × w px (never enlarged), WebP. */
export function thumb(url: string | null | undefined, w: Width): string {
  const src = imgUrl(validImage(url));
  if (!src) return '';
  let host = '';
  try { host = new URL(src).hostname; } catch { return ''; }
  if (OWN.has(host)) return src.startsWith('https://') ? `/img/${w}/${b64url(src)}.webp` : src;
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&h=${w}&fit=inside&we&output=webp&q=76`;
}

/** src + srcset (1× / 2×) for an image shown at `css` px. */
export function picture(url: string | null | undefined, css: 160 | 240 | 320 | 480): { src: string; srcset: string } | null {
  const pairs: Record<number, [Width, Width]> = { 160: [160, 320], 240: [320, 480], 320: [320, 640], 480: [480, 960] };
  const [a, b] = pairs[css]!;
  const one = thumb(url, a);
  if (!one) return null;
  return { src: one, srcset: `${one} 1x, ${thumb(url, b)} 2x` };
}

/** Own uploads (article photos) as site-relative paths, so every host (staging, workers.dev) serves its own copy. */
export const ownUpload = (u: string | null | undefined) => String(u ?? '').replace(/^https?:\/\/(www\.)?eroka\.cz(?=\/wp-content\/)/, '');
