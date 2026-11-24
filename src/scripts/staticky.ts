// Client-side listing filters/sorting and site search for the static site (Cloudflare Workers Free, 24. 11. 2026: every page
// is a static file and the assets ignore query strings). Loaded on demand by ui.ts — only when a listing URL carries
// filters/sort, on the search page, or when somebody types into the search box. Data: lib/staticdata.ts (built nightly).
// The markup mirrors components/Karta.astro, Strankovani.astro, stranky/Vypis.astro and stranky/Hledani.astro.
// Pagination of filtered/sorted lists and search results uses ?strana=N (the static /page/N/ files exist only for the
// unfiltered order); filtered states stay noindex-equivalent: the canonical of the static page is the clean URL.
const PER_PAGE = 24;
const NBSP = ' ';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const cislo = (n: number) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
const cena = (n: number) => cislo(n) + NBSP + 'Kč';
const produktu = (n: number) => (n === 1 ? 'produkt' : n >= 2 && n <= 4 ? 'produkty' : 'produktů');
const ik = (id: string) => `<svg class="ik" width="20" height="20" aria-hidden="true" focusable="false"><use href="/a/i1.svg#${id}"></use></svg>`;
/** Same as lib/staticdata.ts fold(). */
export const fold = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const getJson = async <T>(u: string): Promise<T> => { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json() as Promise<T>; };

// ---------- card + pagination (components/Karta.astro, Strankovani.astro) ----------
type Row = [number, string, string, string, string, number, number, number, number, number, number, string, ...unknown[]];
/** 2× thumbnail of a 1× one (lib/img.ts picture(…, 240): 320 → 480 px; R2 key and wsrv URL differ only in the width). */
const x2 = (s: string) => s.replace(/\/320\//, '/480/').replace('&w=320&h=320&', '&w=480&h=480&');
function karta(r: Row, i: number, dom: Array<[string, string]>, ip: [string, string] = ['', '']): string {
  const [, slug, name, s0, s2, price, offers, shopsN, di, stock, disc, g] = r;
  const s1 = s0 ? ip[0] + s0 + ip[1] : '';
  const go = g.startsWith('~') ? `${slug}-${g.slice(1)}` : g;
  const [domain, label] = dom[di] ?? ['', ''];
  const href = `/${slug}/`;
  const shops = shopsN || offers;
  const img = s1 ? `<img src="${esc(s1)}" srcset="${esc(s1)} 1x, ${esc(s2 || x2(s1))} 2x" alt="${esc(name)}" width="240" height="240" loading="${i < 4 ? 'eager' : 'lazy'}"${i === 0 ? ' fetchpriority="high"' : ''} decoding="async">` : ik('foto');
  const p = price > 0
    ? `<p class="k__p num">${offers > 1 ? '<small>od</small>' : ''}${cena(price)}</p><p class="k__m"><span class="${stock ? 'dot' : 'dot dot--no'}"></span>${esc(shops > 1 ? `v ${shops} obchodech` : label || domain)}</p>`
    : '<p class="k__m">Teď není v nabídce</p>';
  const b = offers === 1 && go
    ? `<a class="btn btn--o k__b" href="/go/${esc(go)}/?ctx=karta" target="_blank" rel="nofollow sponsored" data-partner="${esc(domain)}" data-price="${Math.round(price)}">Do obchodu</a>`
    : offers > 1 ? `<a class="btn btn--o k__b" href="${esc(href)}" tabindex="-1">Porovnat ceny</a>` : `<a class="btn btn--g k__b" href="${esc(href)}" tabindex="-1">Zobrazit</a>`;
  return `<li><article class="k"><div class="k__img">${img}${disc >= 10 ? `<span class="k__s">−${disc} %</span>` : ''}</div><h3 class="k__n"><a href="${esc(href)}">${esc(name)}</a></h3>${p}${b}</article></li>`;
}
const mrizka = (rows: Row[], dom: Array<[string, string]>, ip?: [string, string]) => `<ul class="g">${rows.map((r, i) => karta(r, i, dom, ip)).join('')}</ul>`;
function strankovani(url: (n: number) => string, page: number, pages: number): string {
  if (pages <= 1) return '';
  const show = new Set<number>();
  for (let i = 1; i <= Math.min(3, pages); i++) show.add(i);
  for (let i = Math.max(1, pages - 2); i <= pages; i++) show.add(i);
  for (let i = Math.max(1, page - 3); i <= Math.min(pages, page + 3); i++) show.add(i);
  const list = [...show].sort((a, b) => a - b);
  let h = '';
  if (page > 1) h += `<li><a href="${esc(url(page - 1))}" rel="prev" aria-label="Předchozí stránka">←</a></li>`;
  list.forEach((n, i) => {
    if (i && n - list[i - 1]! > 1) h += '<li><span>…</span></li>';
    h += n === page ? `<li><span aria-current="page">${n}</span></li>` : `<li><a href="${esc(url(n))}" aria-label="Stránka ${n}">${n}</a></li>`;
  });
  if (page < pages) h += `<li><a href="${esc(url(page + 1))}" rel="next" aria-label="Další stránka">→</a></li>`;
  return `<nav class="str" aria-label="Stránkování"><ul>${h}</ul></nav>`;
}
const strana = (sp: URLSearchParams) => Math.max(1, parseInt(sp.get('strana') ?? '', 10) || 1);

// ---------- listing filters (lib/filters.ts) ----------
type Sort = 'pop' | 'price' | 'price-desc' | 'disc' | 'date';
const SORTS: Sort[] = ['pop', 'price', 'price-desc', 'disc', 'date'];
interface F { sort: Sort; min?: number | undefined; max?: number | undefined; znacka: string[]; obchod: string[]; skladem: boolean; sleva: boolean; kat: string; p: Record<string, string[]> }
interface ListData { n: number; d: Array<[string, string]>; ip: [string, string]; t: string[]; lb: Record<string, string>; l: Record<string, string>; pk: string[]; o: Record<string, number[]>; c: Row[] }
const FILTER_KEYS = /^(orderby|min_price|max_price|znacka|obchod|skladem|sleva|kat|p_[a-z]+|strana)$/;

const list = (v: string[], max: number, re: RegExp) => [...new Set(v.join(',').split(',').map((x) => x.trim().toLowerCase()).filter((x) => re.test(x)))].slice(0, max);
function parse(sp: URLSearchParams, pk: string[]): F {
  const o = sp.get('orderby') ?? '';
  const sort: Sort = o === 'popularity' ? 'pop' : (SORTS as string[]).includes(o) ? o as Sort : 'pop';
  const num = (k: string) => { const v = sp.get(k); if (v === null || v.trim() === '') return undefined; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined; };
  const p: F['p'] = {};
  for (const k of pk) { const v = list(sp.getAll('p_' + k), 10, /^[a-z0-9-]{1,40}$/); if (v.length) p[k] = v; }
  return {
    sort, min: num('min_price'), max: num('max_price'), znacka: list(sp.getAll('znacka'), 20, /^[a-z0-9-]{1,80}$/), obchod: list(sp.getAll('obchod'), 10, /^[a-z0-9.-]{3,60}$/),
    skladem: sp.get('skladem') === '1', sleva: sp.get('sleva') === '1', kat: list(sp.getAll('kat'), 1, /^[a-z0-9-]{1,120}$/)[0] ?? '', p,
  };
}
const filtered = (f: F) => f.sort !== 'pop' || f.min !== undefined || f.max !== undefined || f.znacka.length > 0 || f.obchod.length > 0 || f.skladem || f.sleva || !!f.kat || Object.keys(f.p).length > 0;
function toQuery(f: F, pk: string[]): string {
  const sp = new URLSearchParams();
  if (f.sort !== 'pop') sp.set('orderby', f.sort);
  if (f.min !== undefined) sp.set('min_price', String(f.min));
  if (f.max !== undefined) sp.set('max_price', String(f.max));
  if (f.znacka.length) sp.set('znacka', f.znacka.join(','));
  if (f.obchod.length) sp.set('obchod', f.obchod.join(','));
  if (f.skladem) sp.set('skladem', '1');
  if (f.sleva) sp.set('sleva', '1');
  if (f.kat) sp.set('kat', f.kat);
  for (const k of pk) if (f.p[k]?.length) sp.set('p_' + k, f.p[k]!.join(','));
  const s = sp.toString().replace(/%2C/g, ',');
  return s ? '?' + s : '';
}
const withF = (f: F, change: Partial<F>): F => ({ ...f, ...change, p: change.p ?? f.p });
/** `key=value` when the state is exactly one brand or one parameter value (views.ts only()). */
function only(f: F): string | null {
  if (f.sort !== 'pop' || f.min !== undefined || f.max !== undefined || f.obchod.length || f.skladem || f.sleva || f.kat) return null;
  const ps = Object.entries(f.p);
  if (f.znacka.length === 1 && !ps.length) return `brand=${f.znacka[0]}`;
  if (!f.znacka.length && ps.length === 1 && ps[0]![1].length === 1) return `${ps[0]![0]}=${ps[0]![1][0]}`;
  return null;
}

export async function vypis(lv: HTMLElement): Promise<void> {
  const user = new URLSearchParams(location.search);
  if (![...user.keys()].some((k) => FILTER_KEYS.test(k))) return;   // the static page is the unfiltered list
  const col = lv.children[1] as HTMLElement | undefined;
  if (!col) return;
  col.style.opacity = '.45';
  let d: ListData;
  try { d = await getJson<ListData>(lv.dataset.src!); } catch { col.style.opacity = ''; return; }
  // facet landing: its preset filter + the visitor's (views.ts facetView)
  const preset = lv.dataset.preset ?? '';
  const merged = new URLSearchParams(preset);
  for (const k of new Set([...user.keys()])) { merged.delete(k); for (const v of user.getAll(k)) merged.append(k, v); }
  const f = parse(merged, d.pk);
  const base = lv.dataset.base ?? location.pathname.replace(/page\/\d+\/$/, '');
  const pathPage = /\/page\/(\d+)\/$/.exec(location.pathname);
  // the plain filter of exactly one landing value → its landing (one indexable URL per combination)
  const one = preset ? null : only(f);
  if (one && d.l[one]) { location.replace(`/${d.l[one]}/`); return; }
  const tid = new Map(d.t.map((t, i) => [t, i]));
  const groups: Array<Set<number>> = [];
  const group = (vals: string[]) => { if (vals.length) groups.push(new Set(vals.map((v) => tid.get(v) ?? -1))); };
  group(f.znacka.map((s) => 'b:' + s));
  group(f.obchod.map((s) => 'o:' + s));
  if (f.kat) group(['k:' + f.kat]);
  for (const k of d.pk) group((f.p[k] ?? []).map((v) => `p_${k}:${v}`));
  const ok = (r: Row) => {
    const price = r[5], tok = (r[12] as number[]) ?? [];
    if (f.min !== undefined && !(price >= f.min)) return false;
    if (f.max !== undefined && !(price <= f.max)) return false;
    if (f.skladem && !r[9]) return false;
    if (f.sleva && !(r[10] >= 10)) return false;
    return groups.every((g) => tok.some((t) => g.has(t)));
  };
  const rows = (d.o[f.sort] ?? d.o.pop ?? []).map((i) => d.c[i]!).filter(ok);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, user.has('strana') ? strana(user) : pathPage ? Number(pathPage[1]) : 1);
  const pk = d.pk;
  const userF = parse(user, pk);
  const qs = toQuery(preset ? userF : f, pk);
  const url = (s: F) => base + toQuery(s, pk);
  // count, intro (shown only on the plain first page), sort tabs, filter form state
  const n = document.querySelector('.lh__n');
  if (n) n.textContent = `${cislo(total)} ${produktu(total)}`;
  if (filtered(preset ? userF : f)) {
    document.querySelectorAll<HTMLElement>('.w > .intro, .w > [data-vice]').forEach((e) => { e.hidden = true; });
    // as the old SSR (views.ts): a filtered / re-sorted state is noindex, follow; the static canonical stays the clean URL
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, follow');
  }
  for (const a of lv.querySelectorAll<HTMLAnchorElement>('nav.rz a')) {
    const k = (SORTS.find((s) => a.href.includes(`orderby=${s}`) && !a.href.includes(`orderby=${s}-`)) ?? 'pop') as Sort;
    const u = url(withF(f, { sort: k }));
    a.href = u;
    if (u.includes('?')) a.rel = 'nofollow'; else a.removeAttribute('rel');
    if (f.sort === k) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
  }
  const form = lv.querySelector<HTMLFormElement>('form.fl');
  if (form) {
    for (const i of form.querySelectorAll<HTMLInputElement>('input')) {
      const v = i.value;
      if (i.type === 'checkbox' || i.type === 'radio') {
        i.checked = i.name === 'znacka' ? f.znacka.includes(v) : i.name === 'obchod' ? f.obchod.includes(v) : i.name === 'kat' ? f.kat === v
          : i.name === 'skladem' ? f.skladem : i.name === 'sleva' ? f.sleva : i.name.startsWith('p_') ? (f.p[i.name.slice(2)] ?? []).includes(v) : i.checked;
      } else if (i.name === 'min_price') i.value = f.min !== undefined ? String(f.min) : '';
      else if (i.name === 'max_price') i.value = f.max !== undefined ? String(f.max) : '';
    }
    let h = form.querySelector<HTMLInputElement>('input[name="orderby"]');
    if (f.sort !== 'pop') {
      if (!h) { h = document.createElement('input'); h.type = 'hidden'; h.name = 'orderby'; form.insertBefore(h, form.firstChild); }
      h.value = f.sort;
    } else h?.remove();
  }
  // active filter chips (Vypis.astro)
  const chips: Array<[string, string]> = [];
  if (f.min !== undefined || f.max !== undefined) chips.push([`Cena ${f.min !== undefined ? 'od ' + cislo(f.min) : ''} ${f.max !== undefined ? 'do ' + cislo(f.max) : ''} Kč`, url(withF(f, { min: undefined, max: undefined }))]);
  if (f.skladem) chips.push(['Jen skladem', url(withF(f, { skladem: false }))]);
  if (f.sleva) chips.push(['Ve slevě', url(withF(f, { sleva: false }))]);
  if (f.kat) chips.push([d.lb['k:' + f.kat] ?? f.kat, url(withF(f, { kat: '' }))]);
  for (const s of f.znacka) chips.push([d.lb['b:' + s] ?? s, url(withF(f, { znacka: f.znacka.filter((x) => x !== s) }))]);
  for (const s of f.obchod) chips.push([d.lb['o:' + s] ?? s, url(withF(f, { obchod: f.obchod.filter((x) => x !== s) }))]);
  for (const k of pk) for (const v of f.p[k] ?? []) chips.push([d.lb[`p_${k}:${v}`] ?? v, url(withF(f, { p: { ...f.p, [k]: (f.p[k] ?? []).filter((x) => x !== v) } }))]);
  const plain = withF(f, { min: undefined, max: undefined, znacka: [], obchod: [], skladem: false, sleva: false, kat: '', p: {} });
  const fb = lv.querySelector('[data-filtry]');
  if (fb) { [...fb.childNodes].filter((x) => x.nodeType === 3).forEach((x) => x.remove()); fb.append('Filtry' + (chips.length ? ` (${chips.length})` : '')); }
  col.querySelector('ul.ch')?.remove();
  if (chips.length) {
    col.querySelector('.lt')?.insertAdjacentHTML('afterend', `<ul class="ch" aria-label="Aktivní filtry">${chips.map(([t, u]) => `<li><a href="${esc(u)}" rel="nofollow">${esc(t)}${ik('zavrit')}</a></li>`).join('')}<li><a class="ch__x" href="${esc(url(plain))}" rel="nofollow">Zrušit filtry</a></li></ul>`);
  }
  // grid + pagination (?strana=N on top of the filter query)
  col.querySelectorAll(':scope > ul.g, :scope > nav.str, :scope > p.prazdno').forEach((e) => e.remove());
  const pageUrl = (k: number) => base + qs + (k > 1 ? (qs ? '&' : '?') + 'strana=' + k : '');
  col.insertAdjacentHTML('beforeend', total > 0
    ? mrizka(rows.slice((page - 1) * PER_PAGE, page * PER_PAGE), d.d, d.ip) + strankovani(pageUrl, page, pages)
    : `<p class="prazdno">${esc(chips.length ? 'Těmto filtrům nic neodpovídá. Zkuste některý zrušit.' : lv.dataset.empty ?? 'Tady zatím nic není.')}</p>`);
  col.style.opacity = '';
}

// ---------- search (/data/s/*, built from /data/search.json by scripts/static/build.py) ----------
interface SearchIndex { meta: { d: Array<[string, string]>; ip: [string, string]; cats: Array<[string, string, number]>; brands: Array<[string, string, number]> }; n: Record<string, number> }
type SRow = [string, ...Row];
let indexP: Promise<SearchIndex> | null = null;
const bucketP = new Map<string, Promise<SRow[]>>();
const loadIndex = () => (indexP ??= getJson<SearchIndex>('/data/s/index.json').catch((e) => { indexP = null; throw e; }));
const loadBucket = (k: string) => { let p = bucketP.get(k); if (!p) { p = getJson<SRow[]>(`/data/s/${k}.json`).catch((e) => { bucketP.delete(k); throw e; }); bucketP.set(k, p); } return p; };

export interface Found { words: string[]; rows: Row[]; cats: Array<[string, string, number]>; brands: Array<[string, string, number]>; dom: Array<[string, string]>; ip: [string, string] }
/** Every typed word (2+ letters) must start a word of the product name or brand, diacritics-insensitive (the old FTS5 prefix
 *  query); whole-word hits and a matching first word rank higher, then popularity. Categories and brands: every word inside the name. */
export async function search(q: string): Promise<Found> {
  const ix = await loadIndex();
  const words = [...new Set(fold(q).split(' ').filter((w) => w.length > 1))].slice(0, 6);
  if (!words.length) return { words, rows: [], cats: [], brands: [], dom: ix.meta.d, ip: ix.meta.ip };
  const hit = (name: string) => { const n = fold(name); return words.every((w) => n.includes(w)); };
  const cats = ix.meta.cats.filter(([n]) => hit(n)).slice(0, 6);
  const brands = ix.meta.brands.filter(([n]) => hit(n)).slice(0, 6);
  // the smallest bucket among the words' prefixes holds every candidate
  let key = '', size = Infinity;
  for (const w of words) { const n = ix.n[w.slice(0, 2)] ?? 0; if (n < size) { size = n; key = w.slice(0, 2); } }
  const cand = size > 0 ? await loadBucket(key) : [];
  const scored: Array<[number, number, Row]> = [];
  cand.forEach((r, i) => {
    const tw = r[0].split(' ');
    let s = 0;
    for (const w of words) {
      if (tw.includes(w)) s += 3;
      else if (tw.some((x) => x.startsWith(w))) s += 1;
      else return;
    }
    if (tw[0]?.startsWith(words[0]!)) s += 1;
    scored.push([s, i, r.slice(1) as unknown as Row]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return { words, rows: scored.map((x) => x[2]), cats, brands, dom: ix.meta.d, ip: ix.meta.ip };
}

/** Header suggestions in the shape of the old /api/suggest. */
export async function suggest(q: string) {
  const r = await search(q);
  return {
    cats: r.cats.slice(0, 4).map(([n, s, c]) => ({ u: `/${s}/`, n, c })),
    brands: r.brands.slice(0, 3).map(([n, s, c]) => ({ u: `/znacka/${s}/`, n, c })),
    products: r.rows.slice(0, 6).map((p) => ({ u: `/${p[1]}/`, n: p[2], p: p[5] > 0 ? (p[6] > 1 ? 'od ' : '') + cena(p[5]) : '', i: p[3] ? r.ip[0] + p[3] + r.ip[1] : '' })),
  };
}

/** /hledat/?s=… (stranky/Hledani.astro). */
export async function hledani(root: HTMLElement): Promise<void> {
  const sp = new URLSearchParams(location.search);
  const q = (sp.get('s') ?? '').trim().slice(0, 100);
  const out = root.querySelector<HTMLElement>('[data-vysledky]')!;
  const qEl = root.querySelector('[data-q]');
  if (qEl) qEl.textContent = q;
  for (const i of document.querySelectorAll<HTMLInputElement>('input[name="s"]')) if (!i.value) i.value = q;
  if (root.dataset.title && q) document.title = root.dataset.title.replace('%q%', q);
  if (!q) { out.innerHTML = '<p class="prazdno">Napište, co hledáte.</p>'; return; }
  let r: Found;
  try { r = await search(q); } catch { out.innerHTML = '<p class="prazdno">Hledání se nepodařilo načíst. Zkuste to prosím znovu.</p>'; return; }
  const total = r.rows.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, strana(sp));
  const n = root.querySelector<HTMLElement>('.lh__n');
  if (n && total > 0) { n.textContent = `${cislo(total)} ${produktu(total)}`; n.hidden = false; }
  const pk = root.querySelector<HTMLElement>('ul.pk');
  if (pk && (r.cats.length || r.brands.length)) {
    pk.innerHTML = r.cats.map(([nm, s, c]) => `<li><a href="/${esc(s)}/"><span>${esc(nm)} <small>${cislo(c)}</small></span></a></li>`).join('')
      + r.brands.map(([nm, s, c]) => `<li><a href="/znacka/${esc(s)}/"><span>Značka ${esc(nm)} <small>${cislo(c)}</small></span></a></li>`).join('');
    pk.hidden = false;
  }
  const url = (k: number) => `/hledat/?s=${encodeURIComponent(q)}${k > 1 ? '&strana=' + k : ''}`;
  out.innerHTML = total > 0
    ? mrizka(r.rows.slice((page - 1) * PER_PAGE, page * PER_PAGE), r.dom, r.ip) + strankovani(url, page, pages)
    : '<p class="prazdno">Nic jsme nenašli. Zkuste jiné slovo nebo vyberte kategorii nahoře.</p>';
}
