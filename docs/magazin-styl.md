# Redakční styl magazínu Eroka.cz (jednotný pro všechny články)

Eroka.cz je nezávislý český srovnávač cen erotických pomůcek. Magazín radí s výběrem pomůcek, sexem a vztahy.
Články dřív psali různí lidé (jeden recenzent v 1. osobě ženského rodu, jiný jako „my“, jiný reklamním tónem).
Přepiš je tak, aby působily jako od **jedné redakce**.

## Hlas a tón
- Píše **redakce Eroka** v 1. osobě množného čísla („doporučujeme“, „vyzkoušeli jsme“, „u nás najdete“). Nikdy „já“, „moje sbírka“, „jsem zkoušela“. Osobní zkušenost z recenzí převeď na „při testování jsme…“.
- Čtenáři **vykáme**. Tón je věcný, přátelský, bez studu a bez vulgarit, s lehkým humorem jen tam, kde se hodí. Žádný bulvár („šokující“, „tajně milují“, „zaručený“), žádné reklamní superlativy.
- Krátké odstavce (2–4 věty). Čeština bez anglicismů tam, kde existuje běžné české slovo. Pomlčka „–“ s mezerami, české uvozovky „…“.
- Zachovej **fakta, rady, čísla, konkrétní produkty a značky** z původního textu. Nic si nevymýšlej (žádné nové studie, ceny, statistiky). Když původní text tvrdí něco zdravotně sporného, zmírni to nebo doplň „poraďte se s lékařem“.
- Bezpečnost a souhlas zmiň vždy, když téma zahrnuje BDSM, anální praktiky, fisting, poppers, těhotenství apod. (krátce, bez moralizování).

## Struktura (stejná u všech)
1. **Perex**: 2–3 věty v prvním `<p>`, které odpoví na hlavní otázku článku hned na začátku. Hlavní klíčové slovo tučně (`<strong>`) jednou.
2. **Tělo**: 4–8 sekcí `<h2>`, uvnitř podle potřeby `<h3>`. Nadpisy jako konkrétní otázky nebo tvrzení, ne „Úvod“/„Závěr“.
   Seznamy `<ul>`/`<ol>` tam, kde jsou kroky nebo výčty. Srovnání můžeš dát do jednoduché `<table>` (thead/tbody, bez stylů).
3. **„Jak vybrat a kde koupit“**: jedna sekce `<h2>` (název přizpůsob tématu), kde přirozeně odkážeš na 2–4 **kategorie** ze seznamu `kategorie.txt` (např. „Na začátek se hodí <a href="/vibratory-na-bod-g/">vibrátory na bod G</a>…“).
4. **Časté otázky**: `<h2>Časté otázky</h2>` a 3–5 otázek jako `<h3>` + krátká odpověď `<p>` (1–3 věty). Otázky, které lidé opravdu hledají.
5. **Závěr**: jeden krátký odstavec bez nadpisu „Závěr“ (případně `<h2>` se shrnujícím tvrzením).
Délka: zhruba stejná jako původní text (nekrátit pod 60 %, nenatahovat vatou). Sloučené články spoj do jednoho silnějšího textu.

## Odkazy (prolinkování, SEO)
- **Jen relativní odkazy** `href="/slug/"`. Žádné `https://eroka.cz/…`, žádné odkazy na cizí e-shopy, žádné affiliate odkazy, žádné `target`/`rel`.
- V textu 3–6 odkazů na **kategorie** (jen slugy ze souboru `kategorie.txt`, jiné neexistují) a 2–3 odkazy na **jiné články** (jen slugy ze `clanky.txt`, ne na sebe). Anchor = přirozená fráze v textu, ne „klikněte zde“. Na stejný cíl odkaž jen jednou.
- Odkazy na konkrétní produkty a značky z původního textu zachovej jen tehdy, když vedou na `/znacka/<slug>/` nebo kategorii ze seznamu. Ostatní odstraň (text ponech).

## Co odstranit
- Widgety a skripty (Heureka `div class="heureka-affiliate-…"`, iframe, `<script>`, `<style>`, `class`, `style`, `id` atributy), obrázky `<img>`/`<figure>` z těla (fotka článku se nastavuje zvlášť), prázdné odstavce, emoji, „Obsah článku“ seznamy, poznámky typu „článek obsahuje affiliate odkazy“ (to je v patičce webu).
- Povolené tagy: `p, h2, h3, ul, ol, li, strong, em, a, table, thead, tbody, tr, th, td, blockquote, br`.

## Titulky a meta
- `title` (H1): přirozený, do 70 znaků, s hlavním klíčovým slovem na začátku, bez roku (kromě srovnání „2026“, pokud ho měl původní), bez CAPS a bez dvojtečkových řetězců delších než jedna dvojtečka.
- `seo_title`: do 60 znaků, končí „ | Eroka“ (např. „Jak vybrat vibrátor: typy, materiály a tipy | Eroka“).
- `seo_desc`: 140–155 znaků, výstižné shrnutí s klíčovým slovem a výzvou (bez uvozovek).
- `excerpt`: 1–2 věty (do 200 znaků) pro kartu na blogu.

## Fotka
- `image_query`: anglický dotaz pro Pexels/Pixabay, 2–5 slov, **decentní a ne explicitní** (fotobanky nemají nahotu): např. „couple bedroom morning light“, „lingerie lace detail“, „massage oil candles“, „woman relaxing bath“, „pink silicone toy product“. Každý článek jiný dotaz vystihující téma (žádné obecné „couple love“ dvakrát).
- `image_alt`: česky, 5–12 slov, popis toho, co na fotce bude, s klíčovým slovem.

## Výstup
Pro každý článek ulož JSON do `out/<id>.json` (UTF-8, ensure_ascii=False):
`{"id": <id>, "slug": "<původní slug zachovat>", "title": "...", "seo_title": "...", "seo_desc": "...", "excerpt": "...", "content_html": "...", "image_query": "...", "image_alt": "...", "cats": ["slug-kategorie", ...2–5 nejrelevantnějších], "related": ["slug-clanku", ...2–3]}`
U sloučené dvojice zapiš jen jeden soubor pod `id` ponechaného článku (obsah obou spojený).
