// Product photos are hotlinked from the shops' CDNs (as on WordPress). An image proxy is not an option: wsrv.nl
// refuses adult shop domains ("Domain or TLD blocked by policy", checked 26. 10. 2026 for ruzovyslon.cz,
// vibratory.net, erosstar.cz). Růžový slon (≈70 % of products) has its own smaller variant: /product/detail/
// (≤1000 px, ~5× smaller than /product/original/). Cloudflare Image Transformations would be the next step (paid).

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
