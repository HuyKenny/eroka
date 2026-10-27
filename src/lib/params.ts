// Product parameters as the site shows and filters them. Values come from the importer (workers/import/src/params.ts);
// length and diameter are filtered by buckets (same ids as BUCKETS in workers/import/src/facets.ts).

export const PARAM_ORDER = ['pro', 'barva', 'material', 'vibrace', 'napajeni', 'voda', 'delka', 'prumer'] as const;
export type ParamKey = (typeof PARAM_ORDER)[number];
export const PARAM_LABEL: Record<ParamKey, string> = {
  pro: 'Pro koho', barva: 'Barva', material: 'Materiál', vibrace: 'Vibrace', napajeni: 'Napájení', voda: 'Voděodolnost', delka: 'Délka', prumer: 'Průměr',
};
export const BUCKETS: Partial<Record<ParamKey, Array<[string, string, number, number]>>> = {
  delka: [['do-12', 'do 12 cm', 0, 12], ['12-16', '12–16 cm', 12, 16], ['16-20', '16–20 cm', 16, 20], ['nad-20', 'nad 20 cm', 20, 999]],
  prumer: [['do-3', 'do 3 cm', 0, 3], ['3-4', '3–4 cm', 3, 4], ['4-5', '4–5 cm', 4, 5], ['nad-5', 'nad 5 cm', 5, 999]],
};

/** ASCII slug of a parameter value for URLs (?p_barva=cerna,ruzova). */
export const valueSlug = (v: string) => v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Display value: numbers get their unit, booleans read as words. */
export function paramText(key: ParamKey, values: string[]): string {
  if (key === 'delka' || key === 'prumer') return values.map((v) => v.replace('.', ',') + ' cm').join(', ');
  if (key === 'vibrace') return values[0] === 'ano' ? 'ano' : 'ne';
  return values.join(', ');
}
