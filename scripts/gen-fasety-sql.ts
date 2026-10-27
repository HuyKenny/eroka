// Generates migrations/0006_fasety.sql from src/data/fasety.ts: the new facet landing categories (id 3001+) with H1,
// search-form title and texts; existing categories reused as landings only get indexed (noindex = 0).
//   npx tsx scripts/gen-fasety-sql.ts > migrations/0006_fasety.sql
import { FASETY, type Faseta } from '../src/data/fasety';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LEAD: Record<string, (f: Faseta) => string> = {
  'damske-body': (f) => `${f.name} na jednom místě – svůdné body, které poslouží jako erotické prádlo i jako top k sukni nebo pod sako.`,
  'damske-korzety': (f) => `${f.name} zeštíhlí pas, zvýrazní postavu a hodí se pod šaty, na rande i do ložnice.`,
  'damske-puncochy': (f) => `${f.name} doplní erotické prádlo, podvazkový pás i večerní šaty.`,
  'eroticke-pradlo': (f) => `${f.name}: soupravy, podprsenky, kalhotky, košilky i body na jednom místě.`,
  'eroticka-pouta': (f) => `${f.name} pro začátečníky i pokročilé – na zápěstí i kotníky, se zapínáním na suchý zip, přezku nebo klíček.`,
  'dutky-biciky-a-placacky': (f) => `${f.name} pro jemné i ostřejší BDSM hrátky – od měkkých důtek po pevné bičíky.`,
  'bdsm-masky': (f) => `${f.name} na fetiš a BDSM hry – kukly přes celou hlavu, masky na oči i škrabošky.`,
  kondomy: (f) => `${f.name} – všechny druhy a balení, které nabízejí české e-shopy, od klasických po tenké a ochucené.`,
  'lubrikacni-gely-a-oleje': (f) => `${f.name} – gely na vodní i silikonové bázi, hřejivé i s příchutí.`,
  vibratory: (f) => `${f.name} – od malých diskrétních modelů po výkonné vibrátory s aplikací.`,
  'analni-koliky': (f) => `${f.name} – hladké, těžké a snadno se čistí, mnohé se dají nahřát nebo zchladit.`,
  'venusiny-kulicky': (f) => `${f.name} posilují pánevní dno a vibrace přidávají příjemnou stimulaci během nošení.`,
};
const SPECIAL: Record<string, string> = {
  'svitici-kondomy': 'Svítící kondomy po nasvícení ve tmě jemně září – zábavné zpestření, které chrání stejně jako běžný kondom.',
  'vibratory-pro-muze': 'Vibrátory pro muže: stimulátory prostaty, vibrační kroužky, masturbátory s vibracemi a další hračky pro pány.',
};
const TIPS: Record<string, string> = {
  'damske-body': '<h2>Jak vybrat body</h2><ul><li><strong>Velikost</strong> – body by mělo sedět těsně, ale nikde neškrtit; u krajky počítejte s menší pružností.</li><li><strong>Zapínání v rozkroku</strong> usnadní nošení přes den.</li><li><strong>Materiál</strong> – krajka a síťovina působí jemně, latex a koženka odvážněji.</li></ul>',
  'damske-korzety': '<h2>Jak vybrat korzet</h2><ul><li><strong>Obvod pasu</strong> – korzet volte podle pasu, ne podle konfekční velikosti.</li><li><strong>Kostice</strong> – plastové jsou pohodlnější, ocelové víc tvarují.</li><li><strong>Šněrování vzadu</strong> umožní korzet doladit na míru.</li></ul>',
  'damske-puncochy': '<h2>Na co se dívat</h2><ul><li><strong>Denier (DEN)</strong> – nižší číslo znamená jemnější a průsvitnější punčochy.</li><li><strong>Samodržící lem</strong>, nebo podvazky – samodržící drží samy, podvazkové potřebují pás.</li><li><strong>Velikost</strong> – řiďte se výškou a hmotností v tabulce prodejce.</li></ul>',
  'eroticke-pradlo': '<h2>Tipy k výběru</h2><ul><li>Krajka je jemná a hodí se i na běžné nošení, latex a lak jsou spíš na hrátky.</li><li>U souprav zkontrolujte, zda se velikost podprsenky a kalhotek dá kombinovat.</li></ul>',
  'eroticka-pouta': '<h2>Bezpečně s pouty</h2><ul><li>Pouta s polstrováním nebo z měkké kůže neodírají ani při delším nošení.</li><li>Kovová pouta mějte vždy s klíčkem po ruce, ideálně s pojistkou proti utahování.</li><li>Domluvte si bezpečné slovo.</li></ul>',
  'dutky-biciky-a-placacky': '<h2>Jak začít</h2><ul><li>Na začátek jsou vhodnější důtky s širokými měkkými pruhy, které spíš hladí.</li><li>Pravá kůže je odolná a příjemná, po použití ji ošetřete.</li><li>Míří se na hýždě a stehna, nikdy ne na páteř a ledviny.</li></ul>',
  'bdsm-masky': '<h2>Na co si dát pozor</h2><ul><li>Maska musí mít dostatečné otvory pro dýchání.</li><li>Latex natírejte silikonovým přípravkem, lépe se obléká a déle vydrží.</li><li>Kožené masky ošetřujte prostředkem na kůži.</li></ul>',
  kondomy: '<h2>Jak vybrat kondom</h2><ul><li><strong>Velikost</strong> – rozhoduje šířka (nominální šíře), ne délka.</li><li><strong>Materiál</strong> – při alergii na latex volte bezlatexové kondomy.</li><li>Kondomy kombinujte jen s lubrikantem na vodní nebo silikonové bázi, olej latex poškozuje.</li></ul>',
  'lubrikacni-gely-a-oleje': '<h2>Jaký lubrikant zvolit</h2><ul><li><strong>Na vodní bázi</strong> – univerzální, ke všem pomůckám i kondomům.</li><li><strong>Silikonový</strong> – klouže déle a funguje i ve vodě, nehodí se k silikonovým hračkám.</li><li><strong>Hřejivý nebo s příchutí</strong> – na zpestření a orální hrátky.</li></ul>',
  vibratory: '<h2>Podle čeho vybírat</h2><ul><li>Tělově nezávadný silikon je příjemný a snadno se čistí.</li><li>Nabíjení přes USB vyjde levněji než baterie.</li><li>Voděodolný vibrátor můžete používat i ve sprše.</li></ul>',
  'analni-koliky': '<h2>Kovové kolíky</h2><ul><li>Nerez je hygienická a snadno se dezinfikuje.</li><li>Kov drží teplotu – kolík můžete nahřát v teplé vodě nebo zchladit.</li><li>Vždy používejte dostatek lubrikantu a kolík s rozšířenou základnou.</li></ul>',
  'venusiny-kulicky': '<h2>Jak na vibrační kuličky</h2><ul><li>Začněte s lehčí sadou a noste ji zpočátku jen několik minut denně.</li><li>Modely s aplikací umí řídit vibrace i na dálku.</li><li>Po použití kuličky omyjte vodou a mýdlem.</li></ul>',
};

const rows: string[] = [];
const slugs: string[] = [];
for (const f of FASETY) {
  if (!f.id) continue;
  const lead = SPECIAL[f.slug] ?? LEAD[f.base]?.(f);
  if (!lead) throw new Error(`no text for ${f.slug} (base ${f.base})`);
  const desc = `<p>${lead} Ceny porovnáváme u všech ověřených obchodů, se kterými spolupracujeme, a u každého produktu uvidíte, kde je nejlevnější a skladem.</p>`;
  const title = `${cap(f.keyword)}: srovnání cen %currentyear% | Eroka`;
  rows.push(`(${f.id}, ${q(f.slug)}, ${q(f.name)}, (SELECT id FROM categories WHERE slug = ${q(f.base)}), ${q(desc)}, ${q(TIPS[f.base] ?? '')}, ${q(title)})`);
  slugs.push(`(${q(f.slug)}, 'category', ${f.id})`);
}
const reuse = FASETY.filter((f) => !f.id).map((f) => q(f.slug));

console.log(`-- Facet landing pages (27. 10. 2026, generated by scripts/gen-fasety-sql.ts from src/data/fasety.ts).
-- Searched category × facet combinations get their own category (H1, title in the searched form, texts); products are
-- assigned nightly by the importer rules generated from the same table (cat_products direct = 2).
INSERT OR IGNORE INTO categories (id, slug, name, parent, description_html, second_html, seo_title) VALUES
${rows.join(',\n')};

INSERT OR IGNORE INTO slugs (slug, kind, ref_id) VALUES
${slugs.join(',\n')};

-- existing categories used as landings: indexable (they were noindex while nearly empty)
UPDATE categories SET noindex = 0 WHERE slug IN (${reuse.join(', ')});`);
