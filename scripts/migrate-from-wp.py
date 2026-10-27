#!/usr/bin/env python3
"""Eroka.cz — WordPress export → SQL for D1 (26. 10. 2026).

    migrate-from-wp.py <export-dir> <out-dir>

Reads the NDJSON export (scripts/export-from-wp.py + one-off table dumps), writes SQL chunks
(<out-dir>/NNN-<table>.sql, each < ~3.5 MB, statements < 90 kB) plus _report.json.
Load: for f in out/*.sql; do wrangler d1 execute DB --remote --env <env> --file $f; done

Rules (kept 1:1 with the live site):
  * ids and slugs from WordPress; root slug precedence product > category > post > page > blog category
  * offer target URL = Content Egg `url` + the feed's tracking params (exactly what /go/ redirects to today)
  * noindex: eroka-prune-data.php (thin products, dead categories) + empty categories (count 0)
  * Rank Math per-object titles/descriptions/robots from the termmeta/postmeta dumps
"""
import gzip
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path("/home/kenny/ai")
FEEDS = json.load(open(ROOT / "credentials/.eroka-feeds.json"))
MAX_STMT = 90_000
MAX_FILE = 3_500_000


def nd(path):
    p = Path(path)
    if not p.exists():
        return []
    op = gzip.open if p.suffix == ".gz" else open
    with op(p, "rt", encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v) if isinstance(v, float) else str(v)
    s = str(v).replace("\x00", "")
    return "'" + s.replace("'", "''") + "'"


class Writer:
    def __init__(self, out):
        self.out = Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        for f in self.out.glob("*.sql"):
            f.unlink()
        self.n = 0
        self.buf = []
        self.size = 0
        self.name = ""

    def flush(self):
        if self.buf:
            self.n += 1
            (self.out / f"{self.n:03d}-{self.name}.sql").write_text("".join(self.buf), encoding="utf-8")
            self.buf, self.size = [], 0

    def table(self, name, cols, rows):
        self.flush()
        self.name = name
        head = f"INSERT INTO {name} ({', '.join(cols)}) VALUES "
        cur, cur_len = [], len(head)
        for r in rows:
            t = "(" + ", ".join(q(v) for v in r) + ")"
            tl = len(t.encode("utf-8"))  # D1 limits statements in bytes (100 kB), Czech text is 2 bytes/char
            if cur and cur_len + tl + 2 > MAX_STMT:
                self._stmt(head, cur)
                cur, cur_len = [], len(head)
            cur.append(t)
            cur_len += tl + 2
        if cur:
            self._stmt(head, cur)
        self.flush()

    def raw(self, name, sql):
        self.flush()
        self.name = name
        self.buf.append(sql if sql.endswith("\n") else sql + "\n")
        self.flush()

    def _stmt(self, head, cur):
        s = head + ",\n".join(cur) + ";\n"
        sl = len(s.encode("utf-8"))
        if self.size + sl > MAX_FILE:
            self.flush()
        self.buf.append(s)
        self.size += sl


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def num(v):
    try:
        return float(str(v).replace(",", ".").replace(" ", "")) if str(v).strip() not in ("", "None") else 0.0
    except ValueError:
        return 0.0


def target_url(feed, offer):
    url = (offer.get("url") or offer.get("aff_url") or offer.get("orig_url") or "").strip()
    # Affiliateport feeds (Benu, Krása) deliver the click URL HTML-escaped once more: "?o=778&amp;a=5453&amp;deep_link=…"
    # — sent as a Location header the partner id would arrive as "amp;a" and the click would not be attributed.
    url = url.replace("&amp;", "&")
    cfg = FEEDS["feeds"].get(feed) or {}
    tp = re.sub(r"\s+", "", cfg.get("tracking_params") or "")
    if tp and tp not in url:
        url += ("&" if "?" in url else "?") + tp
    return url


def slugify(t):
    import unicodedata
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:60].strip("-") or "nabidka"


def new_go_slug(title, feed, uid, pid):
    import hashlib
    return slugify(title) + "-" + hashlib.md5(f"{feed}|{uid}|{pid}".encode()).hexdigest()[:6]


def stock(o):
    s = str(o.get("stock_status", "")).strip()
    if s in ("1", "-1", "0"):
        return int(s)
    a = str(o.get("availability", "")).lower()
    if a in ("in stock", "in_stock", "instock"):
        return 1
    if a in ("out of stock", "out_of_stock", "outofstock"):
        return -1
    return 0


def prune_data():
    """Parse weby/eroka/mu-plugin/eroka-prune-data.php (PHP array of ids)."""
    p = ROOT / "weby/eroka/mu-plugin/eroka-prune-data.php"
    t = p.read_text(encoding="utf-8") if p.exists() else ""

    def ids(key):
        m = re.search(r"'" + key + r"'\s*=>\s*array\s*\(([^)]*)\)", t)
        return {int(x) for x in re.findall(r"\d+", m.group(1))} if m else set()

    return ids("products"), ids("cats"), ("'enforce'" in t)


def main():
    exp, out = Path(sys.argv[1]), sys.argv[2]
    W = Writer(out)
    rep = defaultdict(int)
    thin, dead, enforce = prune_data()
    if not enforce:
        thin, dead = set(), set()

    # ---------- Rank Math overrides ----------
    term_rm = defaultdict(dict)
    for r in nd(exp / "termmeta_rankmath.ndjson"):
        term_rm[int(r["term_id"])][r["meta_key"]] = r["meta_value"]
    post_rm = defaultdict(dict)
    for r in nd(exp / "postmeta_rankmath.ndjson"):
        post_rm[int(r["id"])][r["meta_key"]] = r["meta_value"]
    term_other = defaultdict(dict)
    for r in nd(exp / "termmeta_other.ndjson"):
        term_other[int(r["term_id"])][r["meta_key"]] = r["meta_value"]

    def rm_robots(v):
        # serialized PHP array, e.g. a:1:{i:0;s:7:"noindex";}
        return ",".join(re.findall(r's:\d+:"([a-z-]+)"', v or ""))

    # ---------- categories ----------
    cats = {}
    for c in nd(exp / "categories.ndjson"):
        cats[c["id"]] = c
    # ---------- brands ----------
    brands = {b["id"]: b for b in nd(exp / "brands.ndjson")}

    # ---------- link index (legacy /go/ slugs) ----------
    go = {}
    for r in nd(exp / "cegg_link_index.ndjson.gz"):
        go[(int(r["post_id"]), r["module_id"], str(r["unique_id"]))] = r["slug"]

    # ---------- products + offers ----------
    prod_rows, offer_rows, cat_direct, brand_rows = [], [], defaultdict(set), []
    fts_rows, used_go = [], set()
    prod_meta = {}
    oid = 0
    for p in nd(exp / "products.ndjson"):
        if p.get("status") != "publish":
            rep["product_not_publish"] += 1
            continue
        meta = {m["key"]: m["value"] for m in p.get("meta_data", [])}
        pid = int(p["id"])
        offers = []
        for k, v in meta.items():
            if not k.startswith("_cegg_data_") or not isinstance(v, dict):
                continue
            feed = k[len("_cegg_data_"):]
            for uid, o in v.items():
                if not isinstance(o, dict):
                    continue
                price = num(o.get("price"))
                if price <= 0:
                    rep["offer_no_price"] += 1
                    continue
                tgt = target_url(feed, o)
                if not tgt.startswith("https://"):
                    rep["offer_bad_url"] += 1
                    continue
                oid += 1
                gs = go.get((pid, feed, str(o.get("unique_id") or uid)))
                if gs:
                    used_go.add(gs)
                else:
                    gs = new_go_slug(o.get("title") or p["name"], feed, str(o.get("unique_id") or uid), pid)
                    rep["go_new_slug"] += 1
                lu = o.get("last_update") or ""
                upd = ""
                if str(lu).isdigit():
                    import datetime
                    upd = datetime.datetime.fromtimestamp(int(lu), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                offers.append({
                    "id": oid, "feed": feed, "uid": str(o.get("unique_id") or uid), "title": html.unescape(o.get("title") or ""),
                    "domain": (o.get("domain") or "").lower(), "price": price, "price_old": num(o.get("priceOld")),
                    "currency": o.get("currencyCode") or "CZK", "target": tgt, "orig": o.get("orig_url") or "",
                    "stock": stock(o), "ean": str(o.get("ean") or ""), "img": o.get("img") or "", "go": gs, "upd": upd or p["date_modified"],
                })
        # dedupe (feed, uid)
        seen, ded = set(), []
        for o in offers:
            if (o["feed"], o["uid"]) in seen:
                rep["offer_dup"] += 1
                continue
            seen.add((o["feed"], o["uid"]))
            ded.append(o)
        offers = ded
        img = meta.get("_cegg_thumbnail_external") or ""
        if isinstance(img, list):  # Content Egg stores [{url, width, height}, …]; feeds sometimes put "in stock" there
            img = next((x.get("url", "") for x in img if isinstance(x, dict) and str(x.get("url", "")).startswith("http")), "")
        if not isinstance(img, str) or not img.startswith("http"):
            img = ""
        if not img and p.get("images"):
            img = p["images"][0].get("src", "")
        if not img:
            for o in offers:
                if o["feed"] == "Feed__6" and o["img"]:
                    img = o["img"]
                    break
        bl = [b for b in p.get("brands", []) if b["slug"] != "ostatni"]
        brand_id = bl[0]["id"] if bl else (p["brands"][0]["id"] if p.get("brands") else 0)
        cl = [c["id"] for c in p.get("categories", [])]
        primary = int(meta.get("rank_math_primary_product_cat") or post_rm[pid].get("rank_math_primary_product_cat") or (cl[0] if cl else 0))
        stats_src = [o for o in offers]
        prices = [o["price"] for o in stats_src]
        best = min(stats_src, key=lambda o: o["price"]) if stats_src else None
        created = p["date_created"]
        prm = post_rm.get(pid, {})
        prod_rows.append([
            pid, p["slug"], html.unescape(p["name"]), "publish", p.get("short_description") or "", p.get("description") or "",
            img, str(p.get("global_unique_id") or ""), primary, brand_id, created, p["date_modified"], int(p.get("total_sales") or 0),
            1 if pid in thin else 0, prm.get("rank_math_title", ""), prm.get("rank_math_description", ""),
            min(prices) if prices else 0.0, max(prices) if prices else 0.0, len(offers), len({o["domain"] for o in offers}),
            best["id"] if best else 0, best["domain"] if best else "",
        ])
        prod_meta[pid] = (created, cl, [b["id"] for b in p.get("brands", [])])
        for c in cl:
            cat_direct[c].add(pid)
        for b in p.get("brands", []):
            brand_rows.append([b["id"], created, pid])
        fts_rows.append([pid, html.unescape(p["name"]), " ".join(b["name"] for b in p.get("brands", []) if b["slug"] != "ostatni")])
        for o in offers:
            offer_rows.append([o["id"], pid, o["feed"], o["uid"], o["title"], o["domain"], o["price"], o["price_old"], o["currency"],
                               o["target"], o["orig"], o["stock"], o["ean"], o["img"], o["go"], o["upd"], 1, ""])
        rep["products"] += 1
    rep["offers"] = len(offer_rows)
    # /go/ slugs must be unique
    seen_go = set()
    for r in offer_rows:
        if r[14] in seen_go:
            r[14] = r[14] + "-" + str(r[0])
        seen_go.add(r[14])
    from urllib.parse import urlparse
    hosts = defaultdict(int)
    for r in offer_rows:
        hosts[urlparse(r[9]).hostname or ""] += 1
    rep["target_hosts"] = dict(sorted(hosts.items(), key=lambda x: -x[1]))

    # category tree → flattened membership
    parent = {cid: c["parent"] for cid, c in cats.items()}

    def ancestors(cid):
        seen = []
        while cid and cid in parent and cid not in seen:
            seen.append(cid)
            cid = parent[cid]
        return seen

    flat = defaultdict(set)
    for cid, pids in cat_direct.items():
        for a in ancestors(cid):
            flat[a] |= pids
    cat_rows, cp_rows = [], []
    for cid, c in cats.items():
        rm = term_rm.get(cid, {})
        to = term_other.get(cid, {})
        total = len(flat.get(cid, ()))
        robots = rm_robots(rm.get("rank_math_robots", ""))
        noidx = 1 if (cid in dead or total == 0 or "noindex" in robots) else 0
        cat_rows.append([cid, c["slug"], html.unescape(c["name"]), c["parent"], c.get("description") or "", to.get("brand_second_description", ""),
                         int(c.get("menu_order") or 0), len(cat_direct.get(cid, ())), total, noidx,
                         rm.get("rank_math_title", ""), rm.get("rank_math_description", ""), robots])
        for pid in flat.get(cid, ()):
            cp_rows.append([cid, prod_meta[pid][0], pid, 1 if pid in cat_direct.get(cid, ()) else 0])
    rep["categories"] = len(cat_rows)
    rep["cat_products"] = len(cp_rows)

    brand_count = defaultdict(int)
    for b, _, _ in brand_rows:
        brand_count[b] += 1
    b_rows = [[bid, b["slug"], html.unescape(b["name"]), b.get("description") or "", brand_count.get(bid, 0), 1 if brand_count.get(bid, 0) == 0 else 0]
              for bid, b in brands.items()]
    rep["brands"] = len(b_rows)

    # ---------- posts / pages ----------
    media = {m["id"]: m for m in nd(exp / "media.ndjson")}
    pcats = {c["id"]: c for c in nd(exp / "postcats.ndjson")}
    post_rows = []
    # Rank Math generated post descriptions from content in ways the export cannot reproduce for every post
    # (first paragraph, sometimes a later one) → the live descriptions are kept as a snapshot (what Google knows)
    lp = exp / "live-post-descriptions.json"
    live_desc = json.load(open(lp)) if lp.exists() else {}
    for typ, fn in (("post", "posts.ndjson"), ("page", "pages.ndjson")):
        for p in nd(exp / fn):
            if p.get("status") != "publish":
                continue
            pid = int(p["id"])
            m = media.get(p.get("featured_media") or 0) or {}
            rm = post_rm.get(pid, {})
            robots = rm_robots(rm.get("rank_math_robots", ""))
            md = m.get("media_details") or {}
            sizes = md.get("sizes") or {}
            card = next((sizes[k]["source_url"] for k in ("medium_large", "post-thumbnail", "large") if k in sizes), m.get("source_url", ""))
            post_rows.append([pid, typ, p["slug"], html.unescape(p["title"]["raw"] if isinstance(p["title"], dict) and "raw" in p["title"] else p["title"]["rendered"]),
                              p["content"]["rendered"], strip_tags(p["excerpt"].get("raw") or p["excerpt"]["rendered"]),
                              p["date"], p["modified"], (p.get("categories") or [0])[0] if typ == "post" else 0,
                              m.get("source_url", ""), card, m.get("alt_text", ""), int(md.get("width") or 0), int(md.get("height") or 0),
                              "", 1 if "noindex" in robots else 0, rm.get("rank_math_title", ""), rm.get("rank_math_description", "") or (live_desc.get(p["slug"]) or "").strip(), "publish", robots])
    rep["posts"] = sum(1 for r in post_rows if r[1] == "post")
    rep["pages"] = sum(1 for r in post_rows if r[1] == "page")
    pc_rows = [[cid, c["slug"], html.unescape(c["name"]), c.get("description") or "", int(c.get("count") or 0)] for cid, c in pcats.items()]
    com_rows = [[int(c["id"]), int(c["post"]), html.unescape(c.get("author_name") or ""), c["date"], c["content"]["rendered"]]
                for c in nd(exp / "comments.ndjson")]

    # ---------- root slugs ----------
    slugs, collisions = {}, []
    order = [("product", [(r[0], r[1]) for r in prod_rows]), ("category", [(r[0], r[1]) for r in cat_rows]),
             ("post", [(r[0], r[2]) for r in post_rows if r[1] == "post"]), ("page", [(r[0], r[2]) for r in post_rows if r[1] == "page"]),
             ("postcat", [(r[0], r[1]) for r in pc_rows])]
    for kind, items in order:
        for rid, s in items:
            if s in slugs:
                collisions.append(f"{s}: {slugs[s][0]} wins over {kind}")
                continue
            slugs[s] = (kind, rid)
    rep["collisions"] = collisions

    # ---------- legacy /go/ slugs without a live offer ----------
    gl_rows = [[s, pid] for (pid, _, _), s in go.items() if s not in used_go and pid in prod_meta]
    rep["go_legacy"] = len(gl_rows)

    # ---------- price history (daily minimum per product) ----------
    ph = defaultdict(lambda: 1e18)
    for r in nd(exp / "cegg_price_history.ndjson.gz"):
        pid = int(r["post_id"] or 0)
        pr = num(r["price"])
        if pid in prod_meta and pr > 0:
            k = (pid, r["create_date"][:10])
            ph[k] = min(ph[k], pr)
    ph_rows = [[pid, day, pr] for (pid, day), pr in ph.items()]
    rep["price_history"] = len(ph_rows)

    # ---------- redirects ----------
    red = []
    rm = json.loads(json.load(open(exp / "rankmath-settings.json")))
    for r in rm.get("redirections", []):
        if r.get("status") != "active":
            continue
        to = r["url_to"]
        if to.startswith("https://eroka.cz"):
            to = to[len("https://eroka.cz"):] or "/"
        for src in re.findall(r's:7:"pattern";s:\d+:"([^"]*)";s:10:"comparison";s:\d+:"exact"', r["sources"]):
            from urllib.parse import unquote
            src = "/" + unquote(src).strip("/") + "/"
            if not to.endswith("/") and "." not in to.rsplit("/", 1)[-1]:
                to = to + "/"
            if src.rstrip("/") == to.rstrip("/"):
                continue
            red.append([src.lower(), to, int(r.get("header_code") or 301)])
    # Rank Math auto-created hundreds of 301s for bot probes (/.env, favicons, phpinfo …) and deleted posts (__trashed),
    # mostly pointing at /vibratory/ (a soft 404). Those become real 404s; /značka/x/ and …/in stock/ are generic rules
    # in the middleware (→ /znacka/x/, → the product).
    junk = re.compile(r"(^/[.~@_-]|/\.|\.(php|env|json|ya?ml|xml|txt|sql|bak|log|ini|zip|gz|tar|js|css|config|old|git|ico|png|jpe?g|gif|html?|html_gzip)/$"
                      r"|wp-|/\*/|config|credentials|secret|backup|passwd|phpinfo|actuator|debug|__trashed/$|/in stock/$|^/značka/|^/znau010dka/"
                      r"|^/(api|mcp|sse|env|fb|fwc|fzh|zna|aaa9|aaabbbccc|officialsite|wordpress|search|setup|admin|apple-app-site-association|checkout)/$"
                      r"|^/(aws|alvin|assets/|images?/|static|theme|txpro|v1/|res/|icons/|img/|imgs/|details/|css/|produkt/index))")
    dd = {}
    for f, t, s in red:
        if junk.search(f):
            rep["redirects_junk"] += 1
            continue
        dd[f] = (t, s)
    # WordPress _wp_old_slug (renamed posts/products) → current URL
    op = exp / "old_slugs.ndjson"
    for r in (nd(op) if op.exists() else []):
        cur = slugs.get(r["slug"])
        if cur and r["old_slug"] and r["old_slug"] not in slugs:
            dd.setdefault("/" + r["old_slug"].lower() + "/", ("/" + r["slug"] + "/", 301))
            rep["redirects_old_slug"] += 1
    red_rows = [[f, t, s] for f, (t, s) in dd.items() if f.strip("/") not in slugs]
    rep["redirects"] = len(red_rows)

    W.table("categories", ["id", "slug", "name", "parent", "description_html", "second_html", "menu_order", "count_direct", "count_total", "noindex", "seo_title", "seo_desc", "seo_robots"], cat_rows)
    W.table("brands", ["id", "slug", "name", "description_html", "count", "noindex"], b_rows)
    W.table("products", ["id", "slug", "name", "status", "short_html", "desc_html", "image", "ean", "primary_cat", "brand_id", "created_at", "updated_at", "total_sales", "noindex", "seo_title", "seo_desc", "min_price", "max_price", "offer_count", "shop_count", "best_offer_id", "best_domain"], prod_rows)
    W.table("cat_products", ["cat_id", "created_at", "product_id", "direct"], cp_rows)
    W.table("brand_products", ["brand_id", "created_at", "product_id"], [list(x) for x in {tuple(r) for r in brand_rows}])
    W.table("offers", ["id", "product_id", "feed", "unique_id", "title", "domain", "price", "price_old", "currency", "target_url", "orig_url", "stock", "ean", "img", "go_slug", "updated_at", "active", "content_hash"], offer_rows)
    W.table("go_legacy", ["slug", "product_id"], gl_rows)
    W.table("price_history", ["product_id", "day", "min_price"], ph_rows)
    W.table("posts", ["id", "type", "slug", "title", "content_html", "excerpt", "published_at", "modified_at", "cat_id", "image", "image_card", "image_alt", "image_w", "image_h", "author", "noindex", "seo_title", "seo_desc", "status", "seo_robots"], post_rows)
    W.table("post_categories", ["id", "slug", "name", "description", "count"], pc_rows)
    W.table("comments", ["id", "post_id", "author", "created_at", "content_html"], com_rows)
    W.table("slugs", ["slug", "kind", "ref_id"], [[s, k, i] for s, (k, i) in slugs.items()])
    W.table("redirects", ["from_path", "to_path", "status"], red_rows)
    W.table("product_fts", ["rowid", "name", "brand"], fts_rows)
    W.raw("site_cache", "INSERT OR REPLACE INTO site_cache (key, value, updated_at) VALUES ('data_version', '1', datetime('now'));")
    json.dump(rep, open(Path(out) / "_report.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k != "collisions"}, ensure_ascii=False), "\ncollisions:", collisions[:10])


if __name__ == "__main__":
    main()
