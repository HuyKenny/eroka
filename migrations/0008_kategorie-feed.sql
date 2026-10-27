-- Categories from the feed expansion (27. 10. 2026, Marketing Miner cs volumes): searched assortment the tree did not
-- have. Filled nightly by workers/import/src/category-rules.ts; noindex below 5 products like every category.
INSERT OR IGNORE INTO categories (id, slug, name, parent, description_html, second_html, seo_title) VALUES
(4001, 'poppers', 'Poppers', 114,
 '<p><strong>Poppers</strong> z ověřených českých obchodů na jednom místě – Rush, Iron Fist, Jungle Juice a další lahvičky i sady. Ceny porovnáváme u všech prodejců, se kterými spolupracujeme, a u každého produktu uvidíte, kde je nejlevnější a skladem.</p>',
 '<h2>Na co si dát pozor</h2><ul><li>Poppers se prodávají jako aromatické přípravky, <strong>nepijí se</strong> a nesmí se dostat na kůži ani do očí.</li><li>Nikdy je nekombinujte s léky na erekci (sildenafil, tadalafil) ani s léky na krevní tlak – hrozí prudký pokles tlaku.</li><li>Uchovávejte je v chladu, zavřené a mimo dosah dětí.</li></ul>',
 'Poppers: srovnání cen %currentyear% | Eroka'),
(4002, 'bodystocking', 'Bodystocking', 105,
 '<p><strong>Bodystocking</strong> je síťovaný nebo krajkový overal, který obepne celé tělo – od klasických síťovaných modelů po otevřené v rozkroku. Ceny porovnáváme u ověřených obchodů a u každého kousku uvidíte, kde je nejlevnější a skladem.</p>',
 '<h2>Jak vybrat bodystocking</h2><ul><li><strong>Velikost</strong> – většina modelů je univerzální (S–L), pro plnější postavy hledejte XL nebo „plus size“.</li><li><strong>Vzor</strong> – drobná síťka působí jemně, velká oka a krajka odvážněji.</li><li><strong>Otevřený rozkrok</strong> umožní sex bez svlékání.</li></ul>',
 'Bodystocking: srovnání cen %currentyear% | Eroka'),
(4003, 'eroticke-adventni-kalendare', 'Erotické adventní kalendáře', 162,
 '<p><strong>Erotické adventní kalendáře</strong> s překvapením na každý den – hračky, kosmetika, pouta i drobnosti pro páry. Ceny porovnáváme u ověřených obchodů, ať stihnete objednat včas.</p>',
 '<h2>Jaký kalendář vybrat</h2><ul><li><strong>Pro páry</strong> – kombinace hraček, masážních olejů a her pro oba.</li><li><strong>Luxusní</strong> – plnohodnotné vibrátory a značková kosmetika (Lovehoney, Dorcel).</li><li>Kalendáře se rychle vyprodávají, objednávejte nejpozději v polovině listopadu.</li></ul>',
 'Erotický adventní kalendář: srovnání cen %currentyear% | Eroka'),
(4004, 'eroticke-houpacky', 'Erotické houpačky', 257,
 '<p><strong>Erotické houpačky</strong> a sexuální závěsy na dveře, strop i stojan. Ulehčí polohy, které by jinak byly náročné, a přidají hře nový rozměr. Ceny porovnáváme u ověřených obchodů.</p>',
 '<h2>Na co se dívat</h2><ul><li><strong>Uchycení</strong> – dveřní závěs je nejjednodušší, stropní houpačka unese víc, ale potřebuje pevný hák.</li><li><strong>Nosnost</strong> – kvalitní modely zvládnou 120–150 kg.</li><li>Polstrované popruhy jsou pohodlnější při delším použití.</li></ul>',
 'Erotická houpačka: srovnání cen %currentyear% | Eroka'),
(4005, 'nuru-gely', 'Nuru gely', 179,
 '<p><strong>Nuru gely</strong> pro klouzavou masáž tělem na tělo – gely z mořských řas bez zápachu, které se dají použít i jako lubrikant. Ceny porovnáváme u ověřených obchodů.</p>',
 '<h2>Jak na nuru masáž</h2><ul><li>Gel rozřeďte teplou vodou, stačí malé množství.</li><li>Na postel dejte omyvatelnou podložku nebo prostěradlo.</li><li>Nuru gel je na vodní bázi, hodí se ke kondomům i hračkám.</li></ul>',
 'Nuru gel: srovnání cen %currentyear% | Eroka');

INSERT OR IGNORE INTO slugs (slug, kind, ref_id) VALUES
('poppers', 'category', 4001), ('bodystocking', 'category', 4002), ('eroticke-adventni-kalendare', 'category', 4003),
('eroticke-houpacky', 'category', 4004), ('nuru-gely', 'category', 4005);
