// Automatic category membership (27. 10. 2026). Every product has exactly one category from the feeds/WordPress, so type
// subcategories stayed nearly empty (Vibrátory 1 820, Realistické vibrátory 3). Each rule adds the products that match it
// to the target category and its ancestors as cat_products rows with direct = 2; rules run nightly (facets.ts) in this
// order, so a later rule (the audience hubs at the end) sees the members added by earlier ones. Manual rows (direct 0/1)
// are never touched. `within` limits a rule to products already in those category subtrees ('*' = whole catalogue).
// Facet landings (src/data/fasety.ts) get their rules generated from that table and run last.

import { FASETY } from '../../../src/data/fasety';

export interface Rule {
  cat: string;                       // target category slug
  any: Array<{ within: string[]; name?: RegExp; param?: { key: string; values: string[] }; brand?: string[] }>;
  not?: RegExp;                      // exclude by product name
}

const V = ['vibratory'];
const D = ['dilda'];
const ANAL = ['vibracni-koliky-a-dalsi'];
const KOL = ['analni-koliky'];
const LUB = ['lubrikacni-gely-a-oleje'];
const K = ['kondomy'];

export const RULES: Rule[] = [
  // vibrators by type
  { cat: 'realisticke-vibratory', any: [{ within: V, name: /realisti/i }] },
  { cat: 'analni-vibratory', any: [{ within: V, name: /anál|anal|prostat/i }, { within: KOL, name: /vibra/i }] },
  // by name only: the feeds' "pro páry" parameter also marks wands and solo toys (they still go to the hub below)
  { cat: 'parove-vibratory', any: [{ within: V, name: /párov|parov|pro páry|pro pary|couple|we-vibe (sync|chorus|nova|match)/i }] },
  { cat: 'vibratory-na-bod-g', any: [{ within: V, name: /bod[u]? ?g\b|g-spot|g spot|g-bod|gspot/i }] },
  { cat: 'vibratory-s-vybezkem-na-klitoris', any: [{ within: V, name: /rabbit|králí|krali|výběž|vybez/i }] },
  { cat: 'masazni-vibratory', any: [{ within: V, name: /wand|masážní hlavic|masazni hlavic|masážní vibr|masazni vibr|magic/i }] },
  { cat: 'vibracni-vajicka', any: [{ within: V, name: /vajíč|vajic|love egg|vibrační vají/i }] },
  { cat: 'pulzatory-pulzacni-vibratory', any: [{ within: V, name: /pulz|pulsa|puls /i }] },
  { cat: 'tlakove-pomucky', any: [{ within: V, name: /tlakov|podtlak|air.?pulse|pleasure air|womanizer|sací stimul|saci stimul/i }] },
  { cat: 'vibratory-na-klitoris', any: [{ within: V, name: /klitor/i }] },
  { cat: 'rotacni-vibratory', any: [{ within: V, name: /rotač|rotac|rotuj|rotating/i }] },
  { cat: 'vibratory-s-prisavkou', any: [{ within: V, name: /přísav|prisav|suction/i }] },
  { cat: 'vibracni-motylci', any: [{ within: V, name: /motýl|motyl|butterfly/i }] },
  { cat: 'vibratory-do-kalhotek', any: [{ within: V, name: /do kalhotek|kalhotk|panty|panties/i }] },
  { cat: 'vibratory-na-dalkove-ovladani', any: [
    { within: [...V, ...KOL, 'erekcni-krouzky-na-penis-a-varlata'], name: /dálkov|dalkov|ovladač|ovladac|remote|aplikac|bluetooth|přes mobil|pres mobil|smartphone|lovense|\blush\b|\bhush\b|\bnora\b|\bdomi\b/i },
    { within: V, brand: ['lovense', 'we-vibe', 'magic-motion', 'kiiroo'] },
  ] },
  // dildos
  { cat: 'realisticka-dilda', any: [{ within: D, name: /realisti|\bcock\b|\bdong\b|s varlaty|penis/i }], not: /strap|postroj|připínac|pripinac/i },
  { cat: 'oboustranna-dilda', any: [{ within: D, name: /oboustr|dvojit|double|dvojí/i }] },
  { cat: 'dilda-s-prisavkou', any: [{ within: D, name: /přísav|prisav|suction/i }] },
  { cat: 'sklenena-dilda', any: [{ within: D, name: /skleněn|sklenen|glass|pyrex/i }, { within: D, param: { key: 'material', values: ['sklo'] } }] },
  { cat: 'xxl-dilda', any: [{ within: D, name: /\bxxl\b|obří|obri |giant|huge|king cock|extra velk/i }] },
  { cat: 'pripinaci-penisy-strap-on', any: [{ within: [...D, ...ANAL], name: /strap|připínac|pripinac|postroj/i }] },
  // anal
  { cat: 'analni-koliky-s-ocasem', any: [{ within: KOL, name: /ocas|ocás|ocásk|tail|lišk|lisk|fox/i }] },
  { cat: 'analni-koliky-s-prisavkou', any: [{ within: KOL, name: /přísav|prisav|suction/i }] },
  { cat: 'sklenene-analni-koliky', any: [{ within: KOL, name: /skleněn|sklenen|glass/i }] },
  { cat: 'masaz-prostaty', any: [{ within: [...ANAL, ...V], name: /prostat|p-spot/i }] },
  { cat: 'nafukovaci-dilda-a-koliky', any: [{ within: [...D, ...ANAL], name: /nafukov|inflat/i }] },
  // for men
  { cat: 'umele-vaginy-a-masturbatory-fleshlight', any: [{ within: ['umele-vaginy-a-masturbatory'], brand: ['fleshlight'] }, { within: ['umele-vaginy-a-masturbatory'], name: /fleshlight/i }] },
  { cat: 'umele-vaginy-a-masturbatory-tenga', any: [{ within: ['umele-vaginy-a-masturbatory'], brand: ['tenga'] }, { within: ['umele-vaginy-a-masturbatory'], name: /\btenga\b/i }] },
  { cat: 'automaticke-masturbatory', any: [{ within: ['umele-vaginy-a-masturbatory'], name: /automat|robot|kiiroo|the handy/i }] },
  { cat: 'vibracni-umele-vaginy-a-masturbatory', any: [{ within: ['umele-vaginy-a-masturbatory'], name: /vibra/i }] },
  { cat: 'vakuove-pumpy-pro-muze-na-penis', any: [{ within: ['vakuove-pumpy'], name: /penis|pro muže|pro muze|bathmate|hydro|penomet/i }] },
  { cat: 'vakuove-pumpy-pro-zeny-na-prsa-bradavky-a-klitoris', any: [{ within: ['vakuove-pumpy'], name: /klitor|bradav|prsa|vagin|pro ženy|pro zeny|pussy/i }] },
  { cat: 'silikonove-krouzky-na-penis', any: [{ within: ['erekcni-krouzky-na-penis-a-varlata'], param: { key: 'material', values: ['silikon'] } }] },
  { cat: 'vibracni-erekcni-krouzky-na-penis-a-varlata', any: [{ within: ['erekcni-krouzky-na-penis-a-varlata'], name: /vibra/i }] },
  // women
  { cat: 'venusiny-kulicky', any: [{ within: ['*'], name: /venušin|venusin|gejš|gejs|kegel|ben ?wa|pánevní dno|panevni dno/i }], not: /kondom|lubrik/i },
  // lubricants and condoms
  { cat: 'analni-lubrikacni-gely-a-oleje', any: [{ within: LUB, name: /anál|anal/i }] },
  { cat: 'oralni-lubrikacni-gely-a-oleje-s-prichuti', any: [{ within: LUB, name: /\borál|\boral\b|příchu|prichu|jahod|flavou?r|ovocn|čokolád|cokolad|vanilk|třešň|tresn|malin/i }] },
  { cat: 'hrejive-lubrikacni-gely-a-oleje-na-vodni-bazi', any: [{ within: LUB, name: /hřej|hrej|warm|tepl/i }] },
  { cat: 'ultra-tenke-kondomy', any: [{ within: K, name: /tenk|thin|slim|invisible|feel ?ultra|real ?feel/i }] },
  { cat: 'velke-kondomy', any: [{ within: K, name: /\bxl\b|\bxxl\b|\blarge\b|\bking\b|magnum|velké kondom|velke kondom|nadměr|extra velk|grande/i }], not: /maxi-pack|custom fit|balení|baleni/i },
  { cat: 'ochucene-kondomy', any: [{ within: K, name: /příchu|prichu|ochuc|flavou?r|jahod|banán|banan|čokolád|cokolad|máta|mata|třešň|tresn/i }] },
  { cat: 'kondomy-s-vroubky-a-vystupky', any: [{ within: K, name: /vroub|výstup|vystup|ribbed|dotted|tečk|teck/i }] },
  { cat: 'bezlatexove-kondomy', any: [{ within: K, name: /bezlatex|latex.?free|non.?latex|polyisopren|polyuretan/i }] },
  { cat: 'znecitlivujici-kondomy', any: [{ within: K, name: /znecitl|prodlou|delay|performa|endurance|long ?love/i }] },
  // audience hubs last (they collect the type categories above)
  { cat: 'eroticke-pomucky-pro-pary', any: [
    { within: ['parove-vibratory', 'eroticke-hry-pro-pary', 'kondomy-pro-pary', 'sady-erotickych-pomucek'] },
    { within: [...V, ...D, ...ANAL, 'umele-vaginy-a-masturbatory', 'fetis-kink'], param: { key: 'pro', values: ['pro páry'] } },
  ] },
  { cat: 'eroticke-pomucky-pro-zeny', any: [
    { within: ['tlakove-pomucky', 'venusiny-kulicky', 'vibracni-vajicka', 'vibratory-na-bod-g', 'vibratory-s-vybezkem-na-klitoris', 'vibratory-na-klitoris', 'pulzatory-pulzacni-vibratory', 'vibratory-do-kalhotek', 'vakuove-pumpy-pro-zeny-na-prsa-bradavky-a-klitoris'] },
    { within: [...V, ...D], param: { key: 'pro', values: ['pro ženy'] } },
  ] },
  { cat: 'eroticke-pomucky-pro-muze', any: [
    { within: ['umele-vaginy-a-masturbatory', 'erekcni-krouzky-na-penis-a-varlata', 'navleky-na-penis-prst', 'vakuove-pumpy-pro-muze-na-penis', 'umele-panny', 'masaz-prostaty', 'zvetseni-penisu-pomucky-a-pripravky', 'sexualni-stroje'] },
    { within: [...ANAL, ...V], param: { key: 'pro', values: ['pro muže'] } },
  ] },
  // facet landings: param value OR brand OR product name, within the base category
  ...FASETY.map((f): Rule => ({
    cat: f.slug,
    any: [
      ...(f.key && f.key !== 'brand' ? [{ within: [f.base], param: { key: f.key, values: [f.value!] } }] : []),
      ...(f.key === 'brand' ? [{ within: [f.base], brand: [f.value!] }] : []),
      ...(f.re ? [{ within: [f.base], name: f.re }] : []),
    ],
  })),
];
