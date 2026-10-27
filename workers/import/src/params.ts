// Feed parameters → a few canonical keys used for filters and the spec table (redesign 27. 10. 2026).
// Every shop names them differently (Barva / barva / Color / g:color, Napájení / Typ napájení / Je na elektřinu? …),
// so names and values are mapped here; anything unknown is dropped (keeps the database small).
// Keys and labels are shared with the site (src/lib/params.ts reads PARAM_DEFS through the same values).

export type ParamKey = 'barva' | 'material' | 'delka' | 'prumer' | 'voda' | 'napajeni' | 'vibrace' | 'pro';
export type Params = Partial<Record<ParamKey, string[]>>;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** feed parameter name (normalised) → canonical key */
const NAMES: Record<string, ParamKey> = {
  barva: 'barva', color: 'barva', 'g:color': 'barva',
  material: 'material', 'skupina materialu': 'material', 'g:material': 'material', 'obleceni – material': 'material',
  delka: 'delka', 'celkova delka': 'delka', 'rozmer – delka celkova (cm)': 'delka',
  prumer: 'prumer', 'prumer max.': 'prumer', 'rozmer – prumer maximalne (cm)': 'prumer', ec_prumer: 'prumer',
  vodeodolnost: 'voda', vodotesnost: 'voda', vodotesny: 'voda',
  napajeni: 'napajeni', 'typ napajeni': 'napajeni', 'typ baterie': 'napajeni', 'je na elektrinu?': 'napajeni',
  vibrace: 'vibrace', vibracni: 'vibrace', provedeni: 'vibrace', 'vibracni/pulsacni programy': 'vibrace',
  'pro koho': 'pro', 'vhodne pro': 'pro', pohlavi: 'pro', urceni: 'pro', obleceni: 'pro', 'typ vyrobku': 'pro',
};

const COLORS: Array<[RegExp, string]> = [
  [/^(cern|black)/, 'černá'], [/^(bil|white)/, 'bílá'], [/^(cerven|red|vinov|bordo)/, 'červená'], [/^(svetle )?(ruz|pink)/, 'růžová'],
  [/^(fialov|purple|lila|levandul)/, 'fialová'], [/^(modr|blue|tyrkys)/, 'modrá'], [/^(zelen|green)/, 'zelená'], [/^(zlut|yellow)/, 'žlutá'],
  [/^(oranz|orange)/, 'oranžová'], [/^(hned|brown|bezov|bez$)/, 'hnědá'], [/^(sed|grey|gray)/, 'šedá'], [/^(zlat|gold)/, 'zlatá'],
  [/^(stribr|silver|kovov)/, 'stříbrná'], [/^(telov|skin|nude)/, 'tělová'], [/^(pruhledn|transparent|cir|clear)/, 'průhledná'],
  [/^(barevn|vicebarevn|multi|mix)/, 'vícebarevná'],
];
const MATERIALS: Array<[RegExp, string]> = [
  [/silikon|silicone|silexpan/, 'silikon'], [/\btpe\b|\btpr\b|termoplast|superskin|cyberskin|\bgel\b/, 'TPE / TPR'],
  [/\babs\b|plast/, 'ABS plast'], [/latex/, 'latex'], [/pvc|vinyl/, 'PVC / vinyl'], [/kov|nerez|ocel|stainless|hlinik/, 'kov'],
  [/sklo|pyrex|glass/, 'sklo'], [/kuze|kozenk|leather/, 'kůže'], [/krajk|lace/, 'krajka'],
  [/textil|bavln|polyester|polyamid|elastan|nylon|vlakno|saten|sitov|modal|viskoz|sifon|tyl/, 'textil'],
];

function num(v: string): number | null {
  const s = norm(v).replace(',', '.');
  const r = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(s);
  let n = r ? (Number(r[1]) + Number(r[2])) / 2 : Number((/(\d+(?:\.\d+)?)/.exec(s) ?? [])[1] ?? NaN);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/mm/.test(s)) n /= 10;
  return Math.round(n * 10) / 10;
}

function values(key: ParamKey, name: string, raw: string): string[] {
  const v = norm(raw);
  if (!v) return [];
  const parts = v.split(/\s*[,/;+]\s*|\s+a\s+/).filter(Boolean);
  switch (key) {
    case 'barva': return [...new Set(parts.map((p) => COLORS.find(([re]) => re.test(p))?.[1]).filter((x): x is string => !!x))];
    case 'material': return [...new Set(parts.flatMap((p) => MATERIALS.filter(([re]) => re.test(p)).map(([, l]) => l)))];
    case 'delka': { const n = num(raw); return n && n >= 2 && n <= 60 ? [String(n)] : []; }
    case 'prumer': { const n = num(raw); return n && n >= 0.5 && n <= 15 ? [String(n)] : []; }
    case 'voda': {
      if (/^(ne|neni)/.test(v)) return ['není voděodolné'];
      if (/vodotesn|ipx[78]|ip67|100 ?%/.test(v) || (name === 'vodotesnost' && v === 'ano')) return ['vodotěsné'];
      if (/vodeodol|ipx[4-6]|^ano/.test(v)) return ['voděodolné'];
      return [];
    }
    case 'napajeni': {
      if (name === 'je na elektrinu?') return v === 'ne' ? ['bez napájení'] : [];
      if (/bez napajeni/.test(v)) return ['bez napájení'];
      if (/nabij|usb|akumul|li-?ion|nabijeck/.test(v)) return ['nabíjecí'];
      if (/sit|zasuvk|elektro stanic/.test(v)) return ['ze sítě'];
      if (/bater|\baa\b|\baaa\b|lr\d|cr\d/.test(v)) return ['na baterie'];
      return [];
    }
    case 'vibrace': {
      if (name === 'provedeni') return /nevibracni/.test(v) ? ['ne'] : /vibracni/.test(v) ? ['ano'] : [];
      return v === 'ano' ? ['ano'] : v === 'ne' ? ['ne'] : [];
    }
    case 'pro': {
      const out = new Set<string>();
      for (const p of parts) {
        if (/unisex/.test(p)) out.add('unisex');
        else if (/zen|dam/.test(p)) out.add('pro ženy');
        else if (/muz|pan|gay/.test(p)) out.add('pro muže');
        if (/par/.test(p)) out.add('pro páry');
      }
      return [...out];
    }
  }
}

/** Collect canonical params from (name, value) pairs of one feed item. */
export function canonicalParams(pairs: Array<[string, string]>): Params {
  const out: Params = {};
  for (const [rawName, raw] of pairs) {
    const name = norm(rawName);
    const key = NAMES[name];
    if (!key) continue;
    const vals = values(key, name, raw);
    if (!vals.length) continue;
    const cur = out[key] ?? [];
    // single-valued keys keep the first value
    out[key] = ['delka', 'prumer', 'voda', 'napajeni', 'vibrace'].includes(key) ? (cur.length ? cur : vals.slice(0, 1)) : [...new Set([...cur, ...vals])].slice(0, 6);
  }
  return out;
}

/** Merge params of several offers of one product (offers already in feed-priority order). */
export function mergeParams(list: Params[]): Params {
  const out: Params = {};
  for (const p of list) {
    for (const [k, vals] of Object.entries(p) as Array<[ParamKey, string[]]>) {
      if (!vals?.length) continue;
      if (['delka', 'prumer', 'voda', 'napajeni', 'vibrace'].includes(k)) { if (!out[k]) out[k] = vals.slice(0, 1); }
      else out[k] = [...new Set([...(out[k] ?? []), ...vals])].slice(0, 6);
    }
  }
  return out;
}
