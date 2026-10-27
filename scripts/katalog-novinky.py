#!/usr/bin/env python3
"""eroka.cz — new products from the shop feeds, without duplicates, in the right category (27. 10. 2026).

    scripts/katalog-novinky.py                       # dry run on production data: report + sample sheet, no writes
    scripts/katalog-novinky.py --env staging --apply # write to staging D1
    scripts/katalog-novinky.py --apply               # write to production (ERK_PRODUCTION_APPROVED=yes)
    options: --feeds 1,2,7  --offline <dir with feed-<n>.xml>  --limit N  --first-fill (no 500-product guard)

Steps: download the feeds (URLs with tokens from credentials/.eroka-feeds.json, never printed) → variants of one
item group = one product → match to the catalogue (offer item id, EAN, product_keys, normalised name + brand) →
cluster the rest across shops (EAN, normalised name + brand) → category from src/data/feed-kategorie.json (feed
path → category slug, null = not ours) → SQL: products, slugs, cat_products (+ ancestors), brand_products,
product_fts, product_keys. Offers are attached by the import Worker afterwards (product_keys); run the feeds
with ?force=1 or wait for the night. Rollback: products with source LIKE 'feed:%'.
"""
import html
import io
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path("/home/kenny/ai")
APP = ROOT / "apps/eroka"
NODE = "/home/kenny/.nvm/versions/node/v22.23.1/bin"
MAP_FILE = APP / "src/data/feed-kategorie.json"  # feed path + name → category rules
# google = Google Merchant <item>, heureka = <SHOPITEM>; order = which shop's data (name, text, photos) wins
FEEDS = {12: "google", 1: "google", 16: "heureka", 2: "heureka", 7: "google", 9: "heureka", 8: "heureka", 15: "heureka"}
DOMAIN = {12: "sexshop.cz", 1: "desirel.cz", 16: "eroticcity.cz", 2: "deeplove.cz", 7: "lovesexshop.cz", 9: "flagranti.cz", 8: "vibratory.net", 15: "sexshop51.cz"}
GUARD = 500  # more new products in one run = something is wrong (unless --first-fill)

args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
ENV = opt("--env", "production")
APPLY = "--apply" in args
ONLY = {int(x) for x in opt("--feeds", "").split(",") if x}
OFFLINE = opt("--offline")
LIMIT = int(opt("--limit", "0"))


def creds(name):
    e = {}
    for line in open(ROOT / "credentials" / name):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k] = v.strip().strip("\"'")
    return e


CF, ER = creds(".cloudflare-credentials.env"), creds(".eroka-credentials.env")
WENV = {**os.environ, "PATH": f"{NODE}:{os.environ.get('PATH', '')}", "CLOUDFLARE_EMAIL": CF["CF_EMAIL"],
        "CLOUDFLARE_API_KEY": CF["CF_GLOBAL_API_KEY"], "CLOUDFLARE_ACCOUNT_ID": ER["CF_ACCOUNT_ID"]}


def d1(sql=None, file=None):
    cmd = ["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "--json", "-y"] + (["--command", sql] if sql else ["--file", file])
    r = subprocess.run(cmd, cwd=APP, env=WENV, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"D1 error: {r.stderr[-600:]}{r.stdout[-600:]}")
    return json.loads(r.stdout)[0]["results"] if sql else r.stdout


# ---------- text helpers ----------
def fold(t):
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()).strip()


def slugify(t):
    return re.sub(r"-+$", "", re.sub(r"[^a-z0-9]+", "-", fold(t)).strip("-")[:70]) or "produkt"


def norm_ean(v):
    d = re.sub(r"\D", "", v or "")
    return re.sub(r"^0+(?=\d{12,13}$)", "", d) if 8 <= len(d) <= 14 else ""


SIZE = r"(?:xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|s/m|m/l|l/xl|xl/xxl|s-m|m-l|l-xl|uni|univerzální|universal|one ?size|os|plus ?size|q|queen)"
VARIANT_TAIL = re.compile(rf"(?:\s*[-–,/(]\s*|\s+)(?:velikost|vel\.|size)?\s*{SIZE}\)?\s*$", re.I)
COLOURS = {"cerna", "cerny", "cerne", "cernou", "black", "bila", "bily", "bile", "white", "cervena", "cerveny", "cervene", "red", "ruzova",
           "ruzovy", "ruzove", "pink", "fialova", "fialovy", "fialove", "purple", "violet", "modra", "modry", "modre", "blue", "zelena",
           "zeleny", "green", "zluta", "yellow", "telova", "telovy", "telove", "nude", "skin", "zlata", "gold", "stribrna", "silver",
           "seda", "grey", "gray", "hneda", "brown", "pruhledna", "transparent", "clear", "bordo", "burgundy", "tyrkysova", "oranzova", "orange"}
SIZES = {"xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl", "5xl", "6xl", "uni", "univerzalni", "onesize", "os", "velikost", "vel", "size", "plus", "q", "queen"}


def clean_name(titles):
    """Product name of a variant group: the common word prefix of the titles, else the first title without its size tail."""
    t = [re.sub(r"\s+", " ", x).strip() for x in titles if x]
    if not t:
        return ""
    if len(t) > 1:
        words = [x.split(" ") for x in t]
        pre = []
        for col in zip(*words):
            if all(w == col[0] for w in col):
                pre.append(col[0])
            else:
                break
        base = " ".join(pre).rstrip(" -–,/(")
        if len(base) >= max(8, len(t[0]) * 0.45):
            return VARIANT_TAIL.sub("", base).strip(" -–,/(")
    return VARIANT_TAIL.sub("", t[0]).strip(" -–,/(") or t[0]


FSTOP = {"eroticke", "eroticky", "eroticka", "damske", "panske", "sexy", "a", "na", "pro", "se", "s", "z", "do", "v", "ks", "the", "with", "and", "for"}
DISTINCT = {"ii", "iii", "iv", "v2", "v3", "pro", "plus", "max", "mini", "small", "medium", "large", "regular", "slim", "xl", "xxl", "gentle",
            "strong", "hard", "soft", "damske", "panske", "lite", "deluxe", "premium", "extra", "double", "single", "duo", "triple",
            "maly", "mala", "male", "velky", "velka", "velke", "stredni", "short", "long", "tall", "big", "huge",
            "vibrating", "vibracni", "vibrator", "trojity", "dvojity", "trojite", "dvojite"}


def ftoks(name):
    return {w for w in fold(name).split() if len(w) > 1 and w not in FSTOP and w not in COLOURS}


def nums(name):
    return set(re.findall(r"\d+(?:[.,]\d+)?", fold(name).replace(" ", "  ")))


def same_product(a, b, generic, brand):
    """Two names for one product: the brand in both, ≥ 0.75 token overlap, the same numbers (pieces, ml, mm), the same
    colour, no differing version/size word, and otherwise the names differ only in generic words (stems of category
    names: "kondomy", "bezlatexové", "tenké") — never in a model word ("Nude" × "Sensual", "Vegan" × "Nude")."""
    ta, tb = ftoks(a), ftoks(b)
    if len(ta) < 3 or len(tb) < 3 or not brand or not set(brand.split()) <= (ta & tb):
        return False
    if len(ta & tb) / len(ta | tb) < 0.75 or nums(a) != nums(b):
        return False
    ra, rb = set(fold(a).split()), set(fold(b).split())
    if (ra ^ rb) & DISTINCT:
        return False
    ca, cb = ra & COLOURS, rb & COLOURS
    if ca and cb and ca != cb:
        return False
    return all(stem5(w) in generic for w in ta ^ tb)


def stem5(w):
    return (re.sub(r"[aeiouy]+$", "", w)[:5]) or w[:5]


def name_key(name):
    """Order-insensitive key without colours/sizes: the same product named a bit differently by two shops."""
    toks = [w for w in fold(name).split() if w not in COLOURS and w not in SIZES and len(w) > 1]
    return " ".join(sorted(set(toks)))


class Clean(HTMLParser):
    """Feed description → safe, simple HTML (p/br/ul/ol/li/strong/em/h2/h3), no links, images, styles or scripts."""
    KEEP = {"p": "p", "br": "br", "ul": "ul", "ol": "ol", "li": "li", "strong": "strong", "b": "strong", "em": "em", "i": "em", "h2": "h3", "h3": "h3", "h4": "h3"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "iframe", "noscript"):
            self.skip += 1
        elif not self.skip and tag in self.KEEP:
            self.out.append(f"<{self.KEEP[tag]}>")
        elif not self.skip and tag in ("div", "tr"):
            self.out.append("<br>")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "iframe", "noscript"):
            self.skip = max(0, self.skip - 1)
        elif not self.skip and tag in self.KEEP and tag != "br":
            self.out.append(f"</{self.KEEP[tag]}>")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))


def clean_desc(raw):
    raw = (raw or "").strip()
    if not raw:
        return ""
    if "<" not in raw:
        paras = [p.strip() for p in re.split(r"\n\s*\n|\r\n\r\n", raw) if p.strip()]
        return "".join(f"<p>{html.escape(p).replace(chr(10), '<br>')}</p>" for p in paras)[:12000]
    c = Clean()
    c.feed(raw)
    h = "".join(c.out)
    h = re.sub(r"(<br>\s*){3,}", "<br><br>", h)
    h = re.sub(r"<(p|li|strong|em|h3)>\s*</\1>", "", h)
    h = re.sub(r"^(\s*<br>)+|(<br>\s*)+$", "", h).strip()
    if h and not h.startswith(("<p", "<ul", "<ol", "<h3")):
        h = f"<p>{h}</p>"
    return h[:12000]


def norm_path(p):
    p = (p or "").replace("Heureka.cz | ", "").replace("Heureka.cz", "").replace(" | ", " > ").replace(" » ", " > ").replace("|", ">")
    return " > ".join(x.strip() for x in p.split(">") if x.strip())


# ---------- category suggestions (stems as src/lib/guess.ts) ----------
STOP = {"pro", "and", "the", "for", "with", "eroticke", "eroticky", "eroticka", "erotic", "sex", "sexy", "a", "i", "na", "s", "se", "z", "do", "ostatni", "doplnky", "pomucky", "damske", "panske"}


def stems(t):
    out = []
    for w in fold(t).split():
        if len(w) < 3 or any(ch.isdigit() for ch in w) or w in STOP:
            continue
        out.append((re.sub(r"[aeiouy]+$", "", w)[:5]) or w[:5])
    return set(out)


def suggest(path, cats):
    segs = [x for x in path.split(" > ") if x]
    best = []
    for depth, seg in enumerate(reversed(segs[-2:])):
        st = stems(seg)
        if not st:
            continue
        for c in cats:
            cs = stems(c["name"])
            if not cs:
                continue
            hit = len(st & cs)
            if not hit:
                continue
            score = hit / len(st | cs) - 0.25 * depth + min(c["count_total"], 500) / 5000
            best.append((score, c["slug"]))
    best.sort(reverse=True)
    return [b for _, b in best[:3]]


# ---------- feeds ----------
def load_feed(n, path):
    raw = open(path, "rb").read()
    if b"windows-1250" in raw[:120].lower():
        raw = raw.decode("cp1250", "replace").replace("windows-1250", "utf-8", 1).encode()
    raw = re.sub(rb"[\x00-\x08\x0b\x0c\x0e-\x1f]", b" ", raw)
    fmt = FEEDS[n]
    tag = "item" if fmt == "google" else "SHOPITEM"
    items = []
    for _, el in ET.iterparse(io.BytesIO(raw)):
        if el.tag.split("}")[-1] != tag:
            continue
        g, multi = {}, defaultdict(list)
        for c in el:
            k = c.tag.split("}")[-1]
            v = (c.text or "").strip()
            g.setdefault(k, v)
            multi[k].append(v)
        el.clear()
        if fmt == "google":
            it = dict(uid=g.get("id", ""), group=g.get("item_group_id", ""), title=g.get("title", ""), link=g.get("link", ""),
                      img=g.get("image_link", ""), imgs=multi.get("additional_image_link", []), ean=norm_ean(g.get("gtin") or g.get("ean")),
                      brand=g.get("brand", ""), desc=g.get("description", ""), path=norm_path(g.get("product_type") or g.get("google_product_category")),
                      stock=(g.get("availability", "").lower().replace("_", " ") == "in stock"), price=g.get("price", ""))
        else:
            it = dict(uid=g.get("ITEM_ID", ""), group=g.get("ITEMGROUP_ID") or g.get("ITEM_GROUP_ID", ""), title=g.get("PRODUCTNAME") or g.get("PRODUCT", ""),
                      link=g.get("URL", ""), img=g.get("IMGURL", ""), imgs=multi.get("IMGURL_ALTERNATIVE", []), ean=norm_ean(g.get("EAN")),
                      brand=g.get("MANUFACTURER", ""), desc=g.get("DESCRIPTION", ""), path=norm_path(g.get("CATEGORYTEXT")),
                      stock=g.get("DELIVERY_DATE", "") == "0", price=g.get("PRICE_VAT", ""))
        if it["uid"] and it["title"] and it["link"] and re.match(r"https?://", it["img"] or ""):
            it["feed"] = n
            items.append(it)
    return items


def fetch_feeds():
    urls = json.load(open(ROOT / "credentials/.eroka-feeds.json"))["feeds"]
    out = {}
    tmp = Path(OFFLINE) if OFFLINE else Path(tempfile.mkdtemp(prefix="eroka-katalog-", dir=ROOT / "tmp"))
    for n in FEEDS:
        if ONLY and n not in ONLY:
            continue
        f = tmp / f"feed-{n}.xml"
        if not OFFLINE:
            req = urllib.request.Request(urls[f"Feed__{n}"]["feed_url"], headers={"User-Agent": "Mozilla/5.0 ErokaKatalog/1.0 (+https://eroka.cz)"})
            with urllib.request.urlopen(req, timeout=300) as r, open(f, "wb") as o:
                while c := r.read(1 << 20):
                    o.write(c)
        out[n] = load_feed(n, f)
        if not OFFLINE:
            f.unlink()
        print(f"Feed__{n}: {len(out[n])} items", file=sys.stderr)
    if not OFFLINE:
        tmp.rmdir()
    return out


# ---------- main ----------
def main():
    feeds = fetch_feeds()
    cmap = json.load(open(MAP_FILE))
    typ = {k: [(re.compile(r) if r else None, c) for r, c in v] for k, v in cmap["typ"].items()}
    grp = [(re.compile(g["p"]), [(re.compile(r) if r else None, c) for r, c in g["rules"]]) for g in cmap["groups"]]

    def run_rules(rules, name, depth=0):
        for rx, c in rules:
            if rx and not rx.search(name):
                continue
            if isinstance(c, str) and c.startswith("@"):
                r = run_rules(typ[c[1:]], name, depth + 1) if depth < 3 else None
                if r is not None:
                    return r
                continue
            return c if c is not None else False   # False = excluded on purpose
        return None

    def categorize(path, name):
        """The most specific segment decides first ("… > Vibrátory a dilda > Dilda" → dildos), then the whole path."""
        fn = fold(name)
        segs = [fold(x) for x in path.split(" > ") if x]
        for fp in ([segs[-1]] if segs else []) + [fold(path)]:
            for rx, rules in grp:
                if rx.search(fp):
                    r = run_rules(rules, fn)
                    if r is not None:
                        return r
        return None
    print("loading D1 …", file=sys.stderr)
    prods = d1("SELECT id, slug, name, ean, brand_id FROM products")
    offers = d1("SELECT feed, unique_id, product_id, ean FROM offers")
    try:
        keys = {r["key"]: r["product_id"] for r in d1("SELECT key, product_id FROM product_keys")}
    except SystemExit:  # migration 0007 not applied yet (dry run before the first deploy)
        keys = {}
    cats = d1("SELECT id, slug, name, parent, count_total FROM categories")
    brands = d1("SELECT id, slug, name FROM brands")
    slugs = {r["slug"] for r in d1("SELECT slug FROM slugs")}
    cat_by_slug = {c["slug"]: c for c in cats}
    cat_by_id = {c["id"]: c for c in cats}
    brand_by_fold = {}
    for b in brands:
        brand_by_fold.setdefault(fold(b["name"]), b)
        brand_by_fold.setdefault(fold(b["slug"].replace("-", " ")), b)
    brand_name = {b["id"]: b["name"] for b in brands}

    by_uid = {(o["feed"], o["unique_id"]): o["product_id"] for o in offers}
    by_ean = {}
    for p in prods:
        if norm_ean(p["ean"]):
            by_ean.setdefault(norm_ean(p["ean"]), p["id"])
    for o in offers:
        if norm_ean(o["ean"]):
            by_ean.setdefault(norm_ean(o["ean"]), o["product_id"])
    for k, pid in keys.items():
        if k.startswith("ean:"):
            by_ean.setdefault(k[4:], pid)
    generic = {stem5(w) for c in cats for w in fold(c["name"]).split() if len(w) > 2} | {stem5(w) for w in
               "kondom kondomy vibrator vibracni masturbator lubrikacni lubrikant gel olej masazni analni silikonovy pcs kusu kusy baleni".split()}
    by_name = defaultdict(set)
    tok_index = defaultdict(set)
    pname = {}
    for p in prods:
        by_name[(name_key(p["name"]), fold(brand_name.get(p["brand_id"], "")))].add(p["id"])
        pname[p["id"]] = p["name"]
        for w in ftoks(p["name"]):
            tok_index[w].add(p["id"])

    def fuzzy_existing(name, brand):
        cand = Counter()
        for w in ftoks(name):
            if len(tok_index[w]) <= 300:
                for i in tok_index[w]:
                    cand[i] += 1
        hits = [i for i, _ in cand.most_common(15) if same_product(name, pname[i], generic, brand)]
        return hits[0] if len(hits) == 1 else None

    # 1. variant groups per feed
    groups = []
    for n, items in feeds.items():
        g = defaultdict(list)
        for it in items:
            g[it["group"] or it["uid"]].append(it)
        for gid, its in g.items():
            its.sort(key=lambda x: (not x["stock"], x["uid"]))
            name = clean_name([x["title"] for x in its])
            groups.append(dict(feed=n, gid=gid, items=its, name=name, key=name_key(name), brand=fold(next((x["brand"] for x in its if x["brand"]), "")),
                               eans={x["ean"] for x in its if x["ean"]}, path=next((x["path"] for x in its if x["path"]), "")))

    # 2. groups that are already in the catalogue → only keys (other variants become offers of that product)
    key_rows = {}
    new_groups = []
    fuzzy_hits = []
    for gr in groups:
        hit = None
        for it in gr["items"]:
            hit = by_uid.get((f"Feed__{gr['feed']}", it["uid"])) or keys.get(f"uid:Feed__{gr['feed']}:{it['uid']}") or (by_ean.get(it["ean"]) if it["ean"] else None)
            if hit:
                break
        if not hit:
            cand = by_name.get((gr["key"], gr["brand"])) or (by_name.get((gr["key"], "")) if not gr["brand"] else None)
            if cand and len(cand) == 1 and len(gr["key"]) >= 12:
                hit = next(iter(cand))
        if not hit:
            hit = fuzzy_existing(gr["name"], gr["brand"])
            if hit:
                fuzzy_hits.append((gr["name"], pname[hit]))
        if hit:
            for it in gr["items"]:
                k = f"uid:Feed__{gr['feed']}:{it['uid']}"
                if (f"Feed__{gr['feed']}", it["uid"]) not in by_uid and k not in keys:
                    key_rows[k] = hit
                if it["ean"] and it["ean"] not in by_ean:
                    key_rows[f"ean:{it['ean']}"] = hit
        else:
            new_groups.append(gr)

    # 3. cluster new groups across shops: same EAN, or same name key + brand
    par = list(range(len(new_groups)))

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    idx = defaultdict(list)
    for i, gr in enumerate(new_groups):
        for e in gr["eans"]:
            idx["e:" + e].append(i)
        if len(gr["key"]) >= 12:
            idx[f"n:{gr['key']}|{gr['brand']}"].append(i)
    for members in idx.values():
        for j in members[1:]:
            par[find(j)] = find(members[0])
    clusters = defaultdict(list)
    for i, gr in enumerate(new_groups):
        clusters[find(i)].append(gr)
    order = list(FEEDS)
    clusters = [sorted(c, key=lambda g: order.index(g["feed"])) for c in clusters.values()]

    # 4. category per cluster, exclusions
    created, skipped_null, skipped_unmapped = [], Counter(), Counter()
    for cl in clusters:
        slug = None
        for gr in cl:
            slug = categorize(gr["path"], gr["name"])
            if slug is not None:
                break
        if slug is False:
            skipped_null[cl[0]["path"]] += 1
            continue
        if not slug:
            skipped_unmapped[cl[0]["path"] + "  ::  " + cl[0]["name"][:50]] += 1
            continue
        if slug not in cat_by_slug:
            skipped_unmapped["(missing category) " + slug] += 1
            continue
        created.append((cl, cat_by_slug[slug]))
    if LIMIT:
        created = created[:LIMIT]

    # 5. build rows
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    next_pid = max(p["id"] for p in prods) + 1
    next_bid = max(b["id"] for b in brands) + 1
    new_brands = {}
    sql, sample = [], []
    n_keys = 0
    q = lambda s: "'" + str(s).replace("'", "''") + "'"

    def ancestors(cid):
        out, seen = [], set()
        while cid and cid not in seen:
            out.append(cid)
            seen.add(cid)
            cid = cat_by_id.get(cid, {}).get("parent", 0)
        return out
    for cl, cat in created:
        rep = cl[0]
        it0 = rep["items"][0]
        pid = next_pid
        next_pid += 1
        bfold = next((g["brand"] for g in cl if g["brand"]), "")
        bid = 0
        if bfold:
            b = brand_by_fold.get(bfold) or new_brands.get(bfold)
            if not b:
                raw = next(x["brand"] for g in cl for x in g["items"] if fold(x["brand"]) == bfold)
                bs = slugify(raw)
                while any(x["slug"] == bs for x in brands) or any(x["slug"] == bs for x in new_brands.values()):
                    bs += "-2"
                b = dict(id=next_bid, slug=bs, name=raw.strip())
                next_bid += 1
                new_brands[bfold] = b
            bid = b["id"]
        base = slugify(rep["name"])
        s = base
        if s in slugs and bfold and fold(bfold) not in fold(base):
            s = slugify(f"{rep['name']} {bfold}")
        k = 2
        while s in slugs:
            s = f"{base}-{k}"
            k += 1
        slugs.add(s)
        desc = clean_desc(next((x["desc"] for g in cl for x in g["items"] if len(x["desc"]) > 80), it0["desc"]))
        ean = next((e for g in cl for e in sorted(g["eans"])), "")
        sql.append(f"INSERT INTO products (id, slug, name, status, desc_html, image, ean, primary_cat, brand_id, created_at, updated_at, source) VALUES "
                   f"({pid}, {q(s)}, {q(rep['name'])}, 'publish', {q(desc)}, {q(it0['img'])}, {q(ean)}, {cat['id']}, {bid}, {q(now)}, {q(now)}, {q('feed:' + str(rep['feed']))});")
        sql.append(f"INSERT INTO slugs (slug, kind, ref_id) VALUES ({q(s)}, 'product', {pid});")
        for i, cid in enumerate(ancestors(cat["id"])):
            sql.append(f"INSERT OR IGNORE INTO cat_products (cat_id, created_at, product_id, direct) VALUES ({cid}, {q(now)}, {pid}, {1 if i == 0 else 0});")
        if bid:
            sql.append(f"INSERT OR IGNORE INTO brand_products (brand_id, created_at, product_id) VALUES ({bid}, {q(now)}, {pid});")
        bname = next((b["name"] for b in list(new_brands.values()) if b["id"] == bid), brand_name.get(bid, ""))
        sql.append(f"INSERT INTO product_fts (rowid, name, brand) VALUES ({pid}, {q(rep['name'])}, {q(bname)});")
        # keys in the same batch as the product: a run cut off midway never leaves a product the next run cannot recognise
        own = {}
        for g in cl:
            for it in g["items"]:
                own[f"uid:Feed__{g['feed']}:{it['uid']}"] = pid
                if it["ean"]:
                    own.setdefault(f"ean:{it['ean']}", pid)
        for k, v in own.items():
            key_rows.pop(k, None)
            sql.append(f"INSERT OR IGNORE INTO product_keys (key, product_id) VALUES ({q(k)}, {v});")
        n_keys += len(own)
        sample.append(dict(id=pid, slug=s, name=rep["name"], cat=cat["slug"], path=rep["path"], brand=bname, ean=ean, img=it0["img"], shops=sorted({DOMAIN[g["feed"]] for g in cl}), variants=sum(len(g["items"]) for g in cl)))
    for b in new_brands.values():
        sql.insert(0, f"INSERT INTO brands (id, slug, name, count) VALUES ({b['id']}, {q(b['slug'])}, {q(b['name'])}, 0);")
    for k, pid in key_rows.items():
        sql.append(f"INSERT OR IGNORE INTO product_keys (key, product_id) VALUES ({q(k)}, {pid});")
    if new_brands or created:
        sql.append("UPDATE brands SET count = (SELECT COUNT(*) FROM brand_products bp JOIN products p ON p.id = bp.product_id WHERE bp.brand_id = brands.id AND p.status = 'publish');")

    # 6. report
    day = datetime.now().strftime("%Y-%m-%d")
    rep = ROOT / f"reports/eroka/katalog-novinky-{day}.md"
    per_feed = Counter(cl[0]["feed"] for cl, _ in created)
    per_cat = Counter(c["slug"] for _, c in created)
    lines = [f"# eroka.cz — nové produkty z feedů ({day}, {'APPLY ' + ENV if APPLY else 'dry run ' + ENV})", "",
             f"- položek ve feedech: {sum(len(v) for v in feeds.values())}, skupin variant: {len(groups)}",
             f"- už v katalogu (jen klíče pro nabídky): {len(groups) - len(new_groups)} skupin, klíčů celkem {len(key_rows)}",
             f"- nové skupiny {len(new_groups)} → po sloučení mezi obchody {len(clusters)} produktů",
             f"- **zakládá se {len(created)} produktů**, nových značek {len(new_brands)}",
             f"- vyloučeno mapou (null): {sum(skipped_null.values())}, bez mapy kategorie: {sum(skipped_unmapped.values())}", "",
             "## Podle obchodu (kdo dal data)", *[f"- {DOMAIN[k]}: {v}" for k, v in per_feed.most_common()], "",
             "## Podle kategorie", *[f"- {k}: {v}" for k, v in per_cat.most_common()], "",
             "## Nenamapované (top 60)", *[f"- {v} × `{k}`" for k, v in skipped_unmapped.most_common(60)], "",
             f"## Sloučeno s existujícím produktem podle podobného názvu ({len(fuzzy_hits)}, vzorek)", *[f"- {a}  ≈  {b}" for a, b in fuzzy_hits[:40]], "",
             "## Vyloučené mapou (top 30)", *[f"- {v} × `{k}`" for k, v in skipped_null.most_common(30)], ""]
    rep.write_text("\n".join(lines))
    if "--suggest" in args:
        sug = {}
        for path, cnt in skipped_unmapped.most_common():
            if path.startswith("(missing"):
                continue
            sug[path] = dict(n=cnt, guess=suggest(path.split("  ::  ")[0], cats))
        (ROOT / "tmp/eroka-katalog-navrh-mapy.json").write_text(json.dumps(sug, ensure_ascii=False, indent=1))
        print(f"suggestions: {len(sug)} paths → tmp/eroka-katalog-navrh-mapy.json")
    random.seed(7)
    sm = random.sample(sample, min(200, len(sample)))
    (ROOT / "tmp/eroka-katalog-vzorek.json").write_text(json.dumps(sm, ensure_ascii=False))
    (ROOT / "tmp/eroka-katalog-vse.json").write_text(json.dumps(sample, ensure_ascii=False))
    print("\n".join(lines[:8]))
    print(f"report: {rep}")

    if not APPLY:
        return
    if ENV == "production" and os.environ.get("ERK_PRODUCTION_APPROVED") != "yes":
        raise SystemExit("production needs ERK_PRODUCTION_APPROVED=yes")
    if len(created) > GUARD and "--first-fill" not in args:
        raise SystemExit(f"guard: {len(created)} new products > {GUARD} — check the report, rerun with --first-fill")
    tmpd = Path(tempfile.mkdtemp(prefix="eroka-katalog-sql-", dir=ROOT / "tmp"))
    chunk, part = [], 0
    for st in sql + [None]:
        # flush before a new product (or brand/key/update) once the batch is big, never inside one product's rows
        boundary = st is None or not st.startswith(("INSERT INTO slugs", "INSERT OR IGNORE INTO cat_products", "INSERT OR IGNORE INTO brand_products",
                                                    "INSERT INTO product_fts", "INSERT OR IGNORE INTO product_keys (key, product_id) VALUES ('uid", "INSERT OR IGNORE INTO product_keys (key, product_id) VALUES ('ean"))
        if (boundary and len(chunk) >= 4000) or len(chunk) >= 8000 or (st is None and chunk):
            f = tmpd / f"part-{part:03d}.sql"
            f.write_text("\n".join(chunk))
            d1(file=str(f))
            print(f"  applied {f.name} ({len(chunk)} statements)", file=sys.stderr)
            f.unlink()
            chunk, part = [], part + 1
        if st is not None:
            chunk.append(st)
    tmpd.rmdir()
    print(f"applied: {len(created)} products, {len(key_rows) + n_keys} keys")


if __name__ == "__main__":
    main()
