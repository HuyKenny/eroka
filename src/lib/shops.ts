// Shop display names (offers only carry the domain), their favicons (public/wp-content/uploads/ce-logos) and full logos
// (public/a/ob, 27. 10. 2026: from KuponMat and the shops' own headers/SVGs, trimmed, ≤ 360×112 WebP).
import logos from '../data/shop-logos.json';
const NAMES: Record<string, string> = {
  'ruzovyslon.cz': 'Růžový slon', 'desirel.cz': 'Desirel', 'lovesexshop.cz': 'LoveSexShop', 'flagranti.cz': 'Flagranti',
  'erosstar.cz': 'ErosStar', 'sexicekshop.cz': 'Sexíček shop', 'deeplove.cz': 'DeepLove', 'sexshop51.cz': 'SexShop51',
  'sexshop.cz': 'Sexshop.cz', 'vibratory.net': 'Vibratory.net', 'drmax.cz': 'Dr.Max', 'drmax.sk': 'Dr.Max SK',
  'eroticcity.cz': 'EroticCity', 'notino.cz': 'Notino', 'lekarna.cz': 'Lékárna.cz', 'lekarnaave.cz': 'Lékárna AVE',
  'vivantis.cz': 'Vivantis', 'lolipop.cz': 'Lolipop', 'parfemy.cz': 'Parfémy.cz', 'trenyrkarna.cz': 'Trenýrkárna',
  'rohlik.cz': 'Rohlík.cz', 'lekarnalemon.cz': 'Lékárna Lemon', 'intimfitness.cz': 'Intimfitness', 'knihydobrovsky.cz': 'Knihy Dobrovský',
  'vip-pradlo.cz': 'VIP prádlo', 'albi.cz': 'Albi', 'mojelekarna.cz': 'Moje lékárna', 'martinus.cz': 'Martinus', '4kids.cz': '4kids',
  'kvelektro.cz': 'KV Elektro', 'xxxlutz.cz': 'XXXLutz', 'hubatacernoska.cz': 'Hubatá černoška', 'activa.cz': 'Activa',
  'sephora.cz': 'Sephora', 'myaustria.cz': 'MyAustria', 'rajhracky.cz': 'Ráj hraček', 'lanotte.cz': 'La Notte', 'baumax.cz': 'Baumax', 'aukro.cz': 'Aukro',
  'benu.cz': 'BENU', 'krasa.cz': 'Krása.cz', 'dialekarna.cz': 'Dialékárna',
};
export const shopName = (domain: string) => NAMES[domain] ?? domain;
export const shopIcon = (domain: string) => `/wp-content/uploads/ce-logos/icon_${domain.replace(/\./g, '-')}.png`;

/** Full logo with a display size of similar visual weight (width grows with √ aspect ratio), or null. */
export function shopLogo(domain: string): { src: string; w: number; h: number } | null {
  const d = (logos as Record<string, [number, number]>)[domain];
  if (!d) return null;
  const r = d[0] / d[1];
  let h = Math.sqrt(3600 / r), w = h * r;
  if (w > 132) { w = 132; h = w / r; }
  if (h > 40) { h = 40; w = h * r; }
  return { src: `/a/ob/${domain.replace(/\./g, '-')}.webp`, w: Math.round(w), h: Math.round(h) };
}
