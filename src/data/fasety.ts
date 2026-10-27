// Facet landing pages (27. 10. 2026): category × facet combinations people actually search for (Marketing Miner, cs,
// searches/month ≥ 20). Each one is a real category (child of `base`, URL in the root like every category) with its own
// H1/title/description, filled nightly by the importer rules built from this table (workers/import/src/category-rules.ts),
// indexed when it has ≥ 5 products. Combinations nobody searches (colours × vibrators/dildos …) stay plain filters (noindex).
// One table feeds the migration (scripts/gen-fasety-sql.ts), the importer rules and the filter links/redirects (views.ts).
// `id` = new category id (3001+); entries without `id` reuse an existing category of that slug.

export type FacetKey = 'barva' | 'material' | 'pro' | 'vibrace' | 'brand';
export interface Faseta {
  id?: number;
  slug: string;
  base: string;               // parent category slug (filters on that category link to this landing)
  name: string;               // H1
  keyword: string;            // searched form (title)
  volume: number;             // searches / month (Marketing Miner, 27. 10. 2026)
  key?: FacetKey;             // filter facet the landing stands for …
  value?: string;             // … canonical param value (product_params) or brand slug
  re?: RegExp;                // product-name match (in addition to the param / brand)
  also?: { within: string[]; name: RegExp };  // products of another subtree (latex clothing lives under Latex)
}

const C = {
  cerna: /černé|černý|černá|černo|\bcern[eýa]\b|black/i,
  bila: /bílé|bílý|bílá|\bbil[eýa]\b|white/i,
  cervena: /červen|cerven|\bred\b/i,
  telova: /tělov|telov|nude|skin/i,
  ruzova: /růžov|ruzov|pink/i,
  krajka: /krajk|lace/i,
  latex: /latex/i,
  kuze: /kůž|kož|\bkuz|\bkoz[ea]|leather/i,
  kov: /kovov|kovová|kovový|\bkov\b|metal|ocel|nerez|steel|chrom/i,
};

export const FASETY: Faseta[] = [
  // body
  { id: 3001, slug: 'krajkove-body', base: 'damske-body', name: 'Krajkové body', keyword: 'krajkové body', volume: 1600, key: 'material', value: 'krajka', re: C.krajka },
  { id: 3002, slug: 'cerne-body', base: 'damske-body', name: 'Černé body', keyword: 'černé body', volume: 450, key: 'barva', value: 'černá', re: C.cerna },
  { id: 3003, slug: 'bile-body', base: 'damske-body', name: 'Bílé body', keyword: 'bílé body', volume: 330, key: 'barva', value: 'bílá', re: C.bila },
  { id: 3004, slug: 'cervene-body', base: 'damske-body', name: 'Červené body', keyword: 'červené body', volume: 180, key: 'barva', value: 'červená', re: C.cervena },
  { id: 3005, slug: 'latexove-body', base: 'damske-body', name: 'Latexové body', keyword: 'latexové body', volume: 80, key: 'material', value: 'latex', re: C.latex, also: { within: ['latex'], name: /\bbody\b/i } },
  { id: 3006, slug: 'kozene-body', base: 'damske-body', name: 'Kožené body', keyword: 'kožené body', volume: 80, key: 'material', value: 'kůže', re: C.kuze },
  { id: 3007, slug: 'telove-body', base: 'damske-body', name: 'Tělové body', keyword: 'tělové body', volume: 60, key: 'barva', value: 'tělová', re: C.telova },
  // corsets
  { id: 3011, slug: 'cerne-korzety', base: 'damske-korzety', name: 'Černé korzety', keyword: 'černý korzet', volume: 380, key: 'barva', value: 'černá', re: C.cerna },
  { id: 3012, slug: 'bile-korzety', base: 'damske-korzety', name: 'Bílé korzety', keyword: 'bílý korzet', volume: 160, key: 'barva', value: 'bílá', re: C.bila },
  { id: 3013, slug: 'kozene-korzety', base: 'damske-korzety', name: 'Kožené korzety', keyword: 'kožený korzet', volume: 160, key: 'material', value: 'kůže', re: C.kuze },
  { slug: 'latexove-korzety', base: 'damske-korzety', name: 'Latexové korzety', keyword: 'latexový korzet', volume: 160, key: 'material', value: 'latex', re: C.latex, also: { within: ['latex'], name: /korzet|corset/i } },
  { id: 3015, slug: 'cervene-korzety', base: 'damske-korzety', name: 'Červené korzety', keyword: 'červený korzet', volume: 140, key: 'barva', value: 'červená', re: C.cervena },
  { id: 3016, slug: 'krajkove-korzety', base: 'damske-korzety', name: 'Krajkové korzety', keyword: 'krajkový korzet', volume: 120, key: 'material', value: 'krajka', re: C.krajka },
  { id: 3017, slug: 'ruzove-korzety', base: 'damske-korzety', name: 'Růžové korzety', keyword: 'růžový korzet', volume: 90, key: 'barva', value: 'růžová', re: C.ruzova },
  // stockings
  { slug: 'samodrzici-eroticke-puncochy', base: 'damske-puncochy', name: 'Samodržící punčochy', keyword: 'samodržící punčochy', volume: 1200, re: /samodrž|samodrz|hold.?up|stay.?up/i },
  { slug: 'sitovane-eroticke-puncochy', base: 'damske-puncochy', name: 'Síťované punčochy', keyword: 'síťované punčochy', volume: 630, re: /síťov|sitov|fishnet|\bsíť/i },
  { slug: 'podvazkove-eroticke-puncochy', base: 'damske-puncochy', name: 'Podvazkové punčochy', keyword: 'podvazkové punčochy', volume: 260, re: /podvaz/i },
  { id: 3021, slug: 'bile-puncochy', base: 'damske-puncochy', name: 'Bílé punčochy', keyword: 'bílé punčochy', volume: 110, key: 'barva', value: 'bílá', re: C.bila },
  { id: 3022, slug: 'cervene-puncochy', base: 'damske-puncochy', name: 'Červené punčochy', keyword: 'červené punčochy', volume: 80, key: 'barva', value: 'červená', re: C.cervena },
  { id: 3023, slug: 'cerne-puncochy', base: 'damske-puncochy', name: 'Černé punčochy', keyword: 'černé punčochy', volume: 80, key: 'barva', value: 'černá', re: C.cerna },
  { id: 3024, slug: 'ruzove-puncochy', base: 'damske-puncochy', name: 'Růžové punčochy', keyword: 'růžové punčochy', volume: 40, key: 'barva', value: 'růžová', re: C.ruzova },
  // lingerie
  { id: 3031, slug: 'krajkove-eroticke-pradlo', base: 'eroticke-pradlo', name: 'Krajkové erotické prádlo', keyword: 'krajkové prádlo', volume: 110, key: 'material', value: 'krajka', re: C.krajka },
  { id: 3032, slug: 'latexove-eroticke-pradlo', base: 'eroticke-pradlo', name: 'Latexové erotické prádlo', keyword: 'latexové prádlo', volume: 60, key: 'material', value: 'latex', re: C.latex, also: { within: ['latex'], name: /body|podprsen|kalhot|tanga|šaty|saty|korzet|top\b|minisukn|sukn/i } },
  // BDSM
  { id: 3041, slug: 'ruzova-pouta', base: 'eroticka-pouta', name: 'Růžová pouta', keyword: 'růžová pouta', volume: 170, key: 'barva', value: 'růžová', re: C.ruzova },
  { id: 3042, slug: 'kozena-eroticka-pouta', base: 'eroticka-pouta', name: 'Kožená pouta', keyword: 'kožená pouta', volume: 170, key: 'material', value: 'kůže', re: C.kuze },
  { id: 3043, slug: 'kovova-eroticka-pouta', base: 'eroticka-pouta', name: 'Kovová pouta', keyword: 'kovová pouta', volume: 140, key: 'material', value: 'kov', re: C.kov },
  { id: 3051, slug: 'kozene-bice', base: 'dutky-biciky-a-placacky', name: 'Kožené biče a důtky', keyword: 'kožený bič', volume: 170, key: 'material', value: 'kůže', re: C.kuze },
  { id: 3061, slug: 'latexove-masky', base: 'bdsm-masky', name: 'Latexové masky', keyword: 'latexová maska', volume: 260, key: 'material', value: 'latex', re: C.latex, also: { within: ['latex'], name: /mask|kukl|hood/i } },
  { id: 3062, slug: 'kozene-masky', base: 'bdsm-masky', name: 'Kožené masky', keyword: 'kožená maska', volume: 70, key: 'material', value: 'kůže', re: C.kuze },
  // condoms
  { slug: 'kondomy-durex', base: 'kondomy', name: 'Kondomy Durex', keyword: 'kondomy durex', volume: 1200, key: 'brand', value: 'durex' },
  { id: 3071, slug: 'kondomy-pepino', base: 'kondomy', name: 'Kondomy Pepino', keyword: 'pepino kondomy', volume: 600, key: 'brand', value: 'pepino', re: /pepino/i },
  { slug: 'kondomy-primeros', base: 'kondomy', name: 'Kondomy Primeros', keyword: 'primeros kondomy', volume: 310, key: 'brand', value: 'primeros', re: /primeros/i },
  { id: 3074, slug: 'kondomy-my-size', base: 'kondomy', name: 'Kondomy My Size', keyword: 'my size kondomy', volume: 130, key: 'brand', value: 'my-size', re: /my.?size/i },
  { id: 3075, slug: 'svitici-kondomy', base: 'kondomy', name: 'Svítící kondomy', keyword: 'svítící kondomy', volume: 180, re: /svítí|svitic|glow/i },
  // lubricants
  { slug: 'lubrikacni-gely-a-oleje-durex', base: 'lubrikacni-gely-a-oleje', name: 'Lubrikační gely Durex', keyword: 'durex lubrikant', volume: 670, key: 'brand', value: 'durex' },
  { slug: 'silikonove-lubrikacni-gely-a-oleje', base: 'lubrikacni-gely-a-oleje', name: 'Silikonové lubrikační gely a oleje', keyword: 'silikonový lubrikační gel', volume: 130, key: 'material', value: 'silikon', re: /silikon/i },
  { slug: 'lubrikacni-gely-a-oleje-pjur', base: 'lubrikacni-gely-a-oleje', name: 'Lubrikační gely Pjur', keyword: 'pjur', volume: 70, key: 'brand', value: 'pjur' },
  { id: 3082, slug: 'lubrikacni-gely-system-jo', base: 'lubrikacni-gely-a-oleje', name: 'Lubrikační gely System JO', keyword: 'system jo lubrikant', volume: 30, key: 'brand', value: 'system-jo' },
  // toys
  { slug: 'vibratory-pro-zeny', base: 'vibratory', name: 'Vibrátory pro ženy', keyword: 'vibrátory pro ženy', volume: 190, key: 'pro', value: 'pro ženy' },
  { id: 3092, slug: 'vibratory-pro-muze', base: 'vibratory', name: 'Vibrátory pro muže', keyword: 'vibrátory pro muže', volume: 170, key: 'pro', value: 'pro muže', re: /pro muže|pro muze|pánsk|pansk|prostat/i },
  { slug: 'silikonove-vibratory', base: 'vibratory', name: 'Silikonové vibrátory', keyword: 'silikonové vibrátory', volume: 80, key: 'material', value: 'silikon' },
  { id: 3101, slug: 'kovove-analni-koliky', base: 'analni-koliky', name: 'Kovové anální kolíky', keyword: 'kovový anální kolík', volume: 120, key: 'material', value: 'kov', re: C.kov },
  { slug: 'analni-koliky-pro-muze', base: 'analni-koliky', name: 'Anální kolíky pro muže', keyword: 'anální kolík pro muže', volume: 140, key: 'pro', value: 'pro muže', re: /pro muže|pro muze|prostat/i },
  { id: 3111, slug: 'vibracni-venusiny-kulicky', base: 'venusiny-kulicky', name: 'Vibrační venušiny kuličky', keyword: 'vibrační venušiny kuličky', volume: 130, key: 'vibrace', value: 'ano', re: /vibra/i },
  { slug: 'saci-masturbatory', base: 'umele-vaginy-a-masturbatory', name: 'Sací masturbátory', keyword: 'sací masturbátor', volume: 140, re: /sací|\bsaci\b|suction|sání|sani\b/i },
];

/** Landing for a filter on a category: (base slug, key, canonical value or brand slug) → landing slug. */
export function facetLanding(base: string, key: string, value: string): Faseta | undefined {
  return FASETY.find((f) => f.base === base && f.key === key && f.value === value);
}
