-- Categories from the SEO content gap (15. 11. 2026, Marketing Miner cs volumes, reports/eroka/seo-audit-2026-11-15.md):
-- searched assortment the tree did not have as a landing. Filled nightly by workers/import/src/category-rules.ts;
-- noindex below 5 products like every category.
INSERT OR IGNORE INTO categories (id, slug, name, parent, description_html, second_html, seo_title, seo_desc) VALUES
(4006, 'eroticke-pradlo-plus-size', 'Erotické prádlo plus size', 105,
 '<p><strong>Erotické prádlo plus size</strong> ve velikostech XL až 4XL – body, korzety, košilky, podvazkové komplety i síťované šaty, které jsou střižené pro plnější postavy, ne jen zvětšené. Ceny porovnáváme u ověřených obchodů a u každého kousku uvidíte, kde je nejlevnější a skladem.</p>',
 '<h2>Jak vybrat erotické prádlo pro plnější postavu</h2><ul><li><strong>Velikost podle tabulky obchodu</strong> – značky šijí různě, porovnejte obvod hrudníku, pasu a boků v centimetrech, ne jen písmeno na etiketě.</li><li><strong>Pružnost materiálu</strong> – krajka s elastanem a síťovina se přizpůsobí, satén a koženka méně.</li><li><strong>Kostice a široká ramínka</strong> u korzetů a podprsenek lépe drží a neřežou.</li><li>Kolekce „Plus Size“ a „Curves“ mají upravený střih, nejen větší čísla.</li></ul>',
 'Erotické prádlo plus size (XL–4XL): srovnání cen | Eroka',
 'Erotické prádlo plus size ve velikostech XL až 4XL: body, korzety, košilky a komplety pro plnější postavy. Porovnejte ceny z ověřených e-shopů.'),
(4007, 'bdsm-nabytek', 'BDSM nábytek', 257,
 '<p><strong>BDSM nábytek</strong> pro bondage a hry s dominancí – bondážní kříže na dveře i na zeď, BDSM lavice, klece a křesla. Ceny porovnáváme u ověřených obchodů a u každého kusu uvidíte, kde je nejlevnější a skladem.</p>',
 '<h2>Na co se dívat</h2><ul><li><strong>Uchycení</strong> – kříž přes dveře nevyžaduje vrtání, kříž na zeď nebo samostatný rám je stabilnější.</li><li><strong>Nosnost a rozměry</strong> – u lavic a klecí si ověřte rozměry místnosti a maximální zátěž.</li><li><strong>Polstrování a úchyty na pouta</strong> rozhodují o pohodlí při delší hře.</li><li>Domluvte si bezpečné slovo a mějte po ruce nůžky nebo klíček k poutům.</li></ul>',
 'BDSM nábytek: kříže, lavice a klece – srovnání cen | Eroka',
 'BDSM nábytek na jednom místě: bondážní kříže na dveře i na zeď, BDSM lavice, klece a křesla. Porovnejte ceny z ověřených českých e-shopů.'),
(4008, 'analni-haky', 'Anální háky', 172,
 '<p><strong>Anální háky</strong> z nerezové oceli i z kovu s kuličkou na konci – pomůcka pro bondage hry, kterou lze propojit lanem s pouty nebo obojkem. Ceny porovnáváme u ověřených obchodů.</p>',
 '<h2>Bezpečně s análním hákem</h2><ul><li>Hák je pro pokročilé, začněte s menší kuličkou a dostatkem lubrikantu.</li><li>Lano nikdy nenapínejte tak, aby tlačilo hák silou dovnitř, a hák neuchycujte ke krku.</li><li>Nerez se snadno čistí a dezinfikuje, po každém použití hák omyjte.</li></ul>',
 'Anální hák: srovnání cen | Eroka',
 'Anální háky z nerezové oceli pro bondage hry – s kuličkou, s kroužkem na penis i se dvěma kuličkami. Porovnejte ceny z ověřených e-shopů.');

INSERT OR IGNORE INTO slugs (slug, kind, ref_id) VALUES
('eroticke-pradlo-plus-size', 'category', 4006), ('bdsm-nabytek', 'category', 4007), ('analni-haky', 'category', 4008);
