// Shop display names (offers only carry the domain) and their favicons (public/wp-content/uploads/ce-logos).
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
