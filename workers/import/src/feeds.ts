// Partner feeds of eroka (former Content Egg modules Feed__1 … Feed__16). Feed URLs carry tokens → secrets
// FEED_URL_<n> (scripts/set-feed-secrets.py reads credentials/.eroka-feeds.json). Deeplink prefixes and tracking
// parameters are public (they are in every outgoing link) and live here.
// Link rule = Content Egg: deeplink ? deeplink + encodeURIComponent(product URL) : product URL + tracking params.
export interface FeedDef {
  id: number;            // n of Feed__n (offers.feed = 'Feed__n')
  name: string;
  domain: string;
  format: 'google' | 'heureka';
  deeplink: string;
  tracking: string;
  /** false = feed not imported and its offers hidden (finalizeDay). Re-enable = set true + deploy. */
  enabled?: boolean;
}

export const FEEDS: FeedDef[] = [
  { id: 1, name: 'Desirel', domain: 'desirel.cz', format: 'google', deeplink: 'https://go.dognet.com/?chid=gUNqvkOT&url=', tracking: '' },
  { id: 2, name: 'DeepLove', domain: 'deeplove.cz', format: 'heureka', deeplink: 'https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=a815cacb&desturl=', tracking: '' },
  { id: 3, name: 'SexíčekShop', domain: 'sexicekshop.cz', format: 'google', deeplink: 'https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=253967b7&desturl=', tracking: '' },
  // Benu + Krása (Affiliateport): back on 27. 10. 2026 with the full-scope key; Krása's new asset 541 fails upstream (403), 233 works
  { id: 4, name: 'Benu', domain: 'benu.cz', format: 'google', deeplink: '', tracking: '' },
  { id: 5, name: 'LékárnaAVE', domain: 'lekarnaave.cz', format: 'google', deeplink: 'https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=221d8c10&desturl=', tracking: '' },
  { id: 6, name: 'RůžovýSlon', domain: 'ruzovyslon.cz', format: 'google', deeplink: '', tracking: 'a_box=9pwxgh4w&a_ch=eroka' },
  { id: 7, name: 'LovesexShop', domain: 'lovesexshop.cz', format: 'google', deeplink: 'https://go.dognet.com/?chid=gUNqvkOT&url=', tracking: '' },
  { id: 8, name: 'Vibratory.net', domain: 'vibratory.net', format: 'heureka', deeplink: 'https://go.dognet.com/?chid=gUNqvkOT&url=', tracking: '' },
  { id: 9, name: 'Flagranti', domain: 'flagranti.cz', format: 'heureka', deeplink: 'https://go.dognet.com/?chid=gUNqvkOT&url=', tracking: '' },
  // 27. 10. 2026: 544 items, none matches a catalogue product (pharmacy assortment) — switched off
  { id: 10, name: 'Dialekarna', domain: 'dialekarna.cz', format: 'heureka', deeplink: 'https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=d90f8294&desturl=', tracking: '', enabled: false },
  { id: 11, name: 'Krása', domain: 'krasa.cz', format: 'heureka', deeplink: '', tracking: '' },
  { id: 12, name: 'Sexshop', domain: 'sexshop.cz', format: 'google', deeplink: '', tracking: 'a_box=rbrcvpst&a_ch=eroka' },
  { id: 13, name: 'Intimfitness', domain: 'intimfitness.cz', format: 'heureka', deeplink: '', tracking: 'a_box=rbrcvpst' },
  { id: 14, name: 'ErosStar.cz', domain: 'erosstar.cz', format: 'google', deeplink: '', tracking: 'id=13929' },
  { id: 15, name: 'SexShop51', domain: 'sexshop51.cz', format: 'heureka', deeplink: '', tracking: 'a_box=rqvzbq9m&a_ch=eroka' },
  { id: 16, name: 'EroticCity.cz', domain: 'eroticcity.cz', format: 'heureka', deeplink: 'https://ehub.cz/system/scripts/click.php?a_aid=052443b7&a_bid=fe04fe84&desturl=', tracking: '' },
];

export const feedKey = (f: FeedDef) => `Feed__${f.id}`;

/** Final affiliate URL. Affiliateport feeds (Benu, Krása) carry the click URL HTML-escaped once more ("&amp;"). */
export function affiliateUrl(f: FeedDef, productUrl: string): string {
  const u = productUrl.trim().replace(/&amp;/g, '&');
  if (f.deeplink) return f.deeplink + encodeURIComponent(u);
  if (f.tracking && !u.includes(f.tracking)) return u + (u.includes('?') ? '&' : '?') + f.tracking;
  return u;
}
