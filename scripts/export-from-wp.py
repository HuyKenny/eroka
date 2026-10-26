#!/usr/bin/env python3
"""Eroka.cz — read-only export z WordPressu pro migraci na Astro + Cloudflare (26. 10. 2026).

    export-from-wp.py <out-dir> [--jen products,categories,...]

Šetrně ke sdílenému WEDOS poolu: sériově, pauza mezi požadavky, opakování při 5xx.
Výstup NDJSON po typech + manifest.json. Hesla se nikam nezapisují.
Zdroje:
  products   wc/v3/products (vč. meta_data → _cegg_data_* = všechny nabídky, Rank Math meta)
  categories wc/v3/products/categories + wp/v2/product_cat (meta)    brands wc/v3/products/brands
  posts      wp/v2/posts?context=edit (raw + rendered)                pages  wp/v2/pages?context=edit
  postcats   wp/v2/categories    media wp/v2/media    comments wp/v2/comments
"""
import base64, json, os, sys, time
from pathlib import Path
import requests

ROOT = Path("/home/kenny/ai")


def creds():
    e = {}
    for l in open(ROOT / "credentials/.eroka-credentials.env"):
        l = l.strip()
        if "=" in l and not l.startswith("#"):
            k, v = l.split("=", 1)
            e[k] = v.strip().strip("\"'")
    return e


E = creds()
AUTH = (E["WP_USER"], E["WP_APP_PASSWORD"])
BASE = E["WP_URL"].rstrip("/") + "/wp-json/"
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0 eroka-export"
PAUZA = 0.8


def get(path, params):
    for pokus in range(6):
        try:
            r = S.get(BASE + path, params=params, auth=AUTH, timeout=180)
            if r.status_code < 500:
                return r
        except requests.RequestException:
            pass
        time.sleep(15 * (pokus + 1))
    raise SystemExit(f"selhalo: {path} {params}")


def strankuj(path, out, extra=None, per=100):
    n, pg, total = 0, 1, None
    with open(out, "w", encoding="utf-8") as f:
        while True:
            r = get(path, dict({"per_page": per, "page": pg}, **(extra or {})))
            if r.status_code == 400 and pg > 1:
                break
            r.raise_for_status()
            if total is None:
                total = r.headers.get("X-WP-Total")
            d = r.json()
            for x in d:
                f.write(json.dumps(x, ensure_ascii=False) + "\n")
            n += len(d)
            print(f"  {path} strana {pg}: {n}/{total}", flush=True)
            if len(d) < per:
                break
            pg += 1
            time.sleep(PAUZA)
    return n, total


ULOHY = {
    "products": ("wc/v3/products", {"status": "any", "orderby": "id", "order": "asc"}),
    "categories": ("wc/v3/products/categories", {"orderby": "id", "order": "asc"}),
    "product_cat_meta": ("wp/v2/product_cat", {"context": "edit", "orderby": "id", "order": "asc"}),
    "brands": ("wc/v3/products/brands", {"orderby": "id", "order": "asc"}),
    "brands_wp": ("wp/v2/product_brand", {"context": "edit", "orderby": "id", "order": "asc"}),
    "posts": ("wp/v2/posts", {"context": "edit", "status": "publish,draft,future,private", "orderby": "id", "order": "asc"}),
    "pages": ("wp/v2/pages", {"context": "edit", "status": "publish,draft,private", "orderby": "id", "order": "asc"}),
    "postcats": ("wp/v2/categories", {"context": "edit"}),
    "media": ("wp/v2/media", {"context": "edit"}),
    "comments": ("wp/v2/comments", {"context": "edit", "status": "approve"}),
}


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    jen = None
    if "--jen" in sys.argv:
        jen = sys.argv[sys.argv.index("--jen") + 1].split(",")
    man = {"start": time.strftime("%Y-%m-%dT%H:%M:%S"), "zdroj": E["WP_URL"], "typy": {}}
    mp = out / "manifest.json"
    if mp.exists():
        man = json.load(open(mp))
    for nazev, (path, extra) in ULOHY.items():
        if jen and nazev not in jen:
            continue
        print(f"== {nazev}", flush=True)
        n, total = strankuj(path, out / f"{nazev}.ndjson", extra, per=50 if nazev == "products" else 100)
        man["typy"][nazev] = {"radku": n, "x_wp_total": total, "endpoint": path}
        json.dump(man, open(mp, "w"), ensure_ascii=False, indent=1)
    man["konec"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    json.dump(man, open(mp, "w"), ensure_ascii=False, indent=1)
    print("hotovo", man["typy"])


if __name__ == "__main__":
    main()
