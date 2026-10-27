// Image sources shared by the site (src/lib/img.ts builds /img/ URLs) and the eroka-img Worker (workers/img checks them).
// Product photos come from the partners' feeds; every shop domain (and its CDN) is listed, subdomains included.
// Checked against production data 27. 10. 2026 — a shop added to the feeds needs its image host here.

export const IMAGE_DOMAINS = [
  'ruzovyslon.cz', 'desirel.cz', 'i00.eu', 'lovesexshop.cz', 'erosstar.cz', 'flagranti.cz', 'sexshop51.cz', 'sexshop.cz',
  'vibratory.net', 'deeplove.cz', 'sexicekshop.cz', 'eroticcity.cz', 'intimfitness.cz', 'lekarnaave.cz', 'dialekarna.cz',
  'benu.cz', 'krasa.cz', 'drmax.cz', 'drmax.sk', 'cdn.shopify.com', 'notinoimg.com', 'vivantiscdn.net', 'vshcdn.net',
  'trenyrkarna.cz', 'lolipop.cz', 'rohlik.cz', 'knihydobrovsky.cz', 'vip-pradlo.cz', 'mojelekarna.cz', 'mrtns.sk',
  'kvelektro.cz', 'albi.cz', 'hubatacernoska.cz', 'actva.cz', 'xxxlutz.com', 'lekarnalemon.cz', 'lanotte.cz', 'rshop.sk',
  'sephora.eu', 'baumax.cz', 'myaustria.cz', 'aukro.cz',
];
/** Hosts that no longer resolve or return 404 for every image (27. 10. 2026) — skipped, the page uses another photo. */
export const DEAD_IMAGE_HOSTS = ['app.fieapp.com', 'img.4kids.cz', 'img.hracky-4kids.cz'];
/** Thumbnail widths (fitted inside w × w). */
export const WIDTHS = [160, 320, 480, 640, 960] as const;

export function imageHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (DEAD_IMAGE_HOSTS.includes(h)) return false;
  return IMAGE_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
}
