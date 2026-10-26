// Product photos are hotlinked from ~26 shop CDNs in full size (often 1000–2000 px JPEGs). They go through the
// wsrv.nl proxy (same as kakapo): resized, WebP, cached at its edge. Own files (/wp-content/…, eroka.cz) are never
// proxied — the zone WAF may block the proxy; article cards use the WordPress medium_large variant instead.
const PROXY = 'wsrv.nl';

export function imgUrl(url: string | null | undefined, width: number, quality = 75): string {
  const u = String(url ?? '').trim();
  if (u === '' || u[0] === '/' || !/^https?:\/\//i.test(u)) return u;
  let host = '';
  try { host = new URL(u).hostname.toLowerCase(); } catch { return ''; }
  if (host === PROXY || host === 'eroka.cz' || host.endsWith('.eroka.cz')) return u;
  const q = new URLSearchParams({ url: u, w: String(Math.max(1, width | 0)), h: String(Math.max(1, width | 0)), fit: 'contain', cbg: 'white', q: String(quality), output: 'webp', we: '' });
  return `https://${PROXY}/?${q.toString()}`;
}

export function imgSrcset(url: string | null | undefined, width: number, quality = 75): string {
  const one = imgUrl(url, width, quality);
  if (!one.startsWith('https://' + PROXY)) return '';
  return `${one} 1x, ${imgUrl(url, width * 2, quality)} 2x`;
}

/** Feeds sometimes put text ("in stock") or a broken host into the image field (erk_opt_html 3b). */
export function validImage(url: string | null | undefined): string {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+\//i.test(u) || /%20/.test(u.split('/')[2] ?? '')) return '';
  return u;
}
