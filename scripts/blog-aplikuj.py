#!/usr/bin/env python3
"""eroka.cz — apply the rewritten magazine (27. 10. 2026): one editorial voice, new photos, internal links.

    scripts/blog-aplikuj.py <dir> [--env staging|production] [--apply]

<dir>/out/<id>.json   rewritten articles (STYL.md format: title, seo_*, excerpt, content_html, image_alt, cats, related)
<dir>/merge.json      {dropped id: kept id} — duplicates merged into one article; the dropped URL 301s to the kept one
public/a/blog/fotky.json + <slug>.webp / <slug>-k.webp   photos from scripts/blog-fotky.py

Writes posts (content, titles, photo, modified_at), redirects for merged duplicates (dropped posts → status 'draft')
and src/data/prolinkovani.json: clanek_kategorie (article → categories, the "Kde vybrat a koupit" box),
magbox (category → up to 4 articles, "Rádce z magazínu" on category pages), souvisejici (article → related articles),
titulky (short article titles for the boxes). Dry run prints the plan; --apply writes.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/home/kenny/ai")
APP = ROOT / "apps/eroka"
NODE = "/home/kenny/.nvm/versions/node/v22.23.1/bin"
LINKS = APP / "src/data/prolinkovani.json"
FOTO = APP / "public/a/blog"

args = sys.argv[1:]
D = Path(args[0])
ENV = args[args.index("--env") + 1] if "--env" in args else "production"
APPLY = "--apply" in args


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
q = lambda s: "'" + str(s).replace("'", "''") + "'"


def d1_file(sql):
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, dir=ROOT / "tmp") as t:
        t.write(sql)
    try:
        r = subprocess.run(["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "-y", "--file", t.name], cwd=APP, env=WENV, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"D1 error: {r.stderr[-500:]}{r.stdout[-500:]}")
    finally:
        os.unlink(t.name)


def short(title):
    t = re.split(r"\s[–—-]\s|:\s|\?\s", title)[0].strip()
    return t if 12 <= len(t) <= 60 else title[:60].rsplit(" ", 1)[0]


def main():
    merge = {int(k): v for k, v in json.loads((D / "merge.json").read_text()).items()}
    posts = {p["id"]: p for p in json.loads((D / "posts.json").read_text())[0]["results"]}
    arts = {int(f.stem): json.loads(f.read_text()) for f in (D / "out").glob("*.json")}
    for a in arts.values():  # "/slug/" or "slug"
        a["cats"] = [c.strip("/") for c in a.get("cats", [])]
        a["related"] = [r.strip("/") for r in a.get("related", [])]
    fotky = json.loads((FOTO / "fotky.json").read_text()) if (FOTO / "fotky.json").exists() else {}
    missing = [i for i in posts if i not in merge and i not in arts]
    if missing:
        raise SystemExit(f"articles not rewritten yet: {missing}")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    sql = []
    for i, a in sorted(arts.items()):
        slug = posts[i]["slug"]
        sets = [f"title = {q(a['title'])}", f"content_html = {q(a['content_html'])}", f"excerpt = {q(a['excerpt'])}",
                f"seo_title = {q(a['seo_title'])}", f"seo_desc = {q(a['seo_desc'])}", f"modified_at = {q(now)}"]
        if slug in fotky and (FOTO / f"{slug}.webp").exists():
            sets += [f"image = {q(f'https://eroka.cz/a/blog/{slug}.webp')}", f"image_card = {q(f'https://eroka.cz/a/blog/{slug}-k.webp')}",
                     f"image_alt = {q(a['image_alt'])}", "image_w = 1600", "image_h = 900"]
        sql.append(f"UPDATE posts SET {', '.join(sets)} WHERE id = {i};")
    for drop, keep in merge.items():
        sql.append(f"UPDATE posts SET status = 'draft' WHERE id = {drop};")
        sql.append(f"INSERT OR REPLACE INTO redirects (from_path, to_path, status) VALUES ({q('/' + posts[drop]['slug'] + '/')}, {q('/' + posts[keep]['slug'] + '/')}, 301);")

    # internal-link map
    links = json.loads(LINKS.read_text())
    slug_of = {i: posts[i]["slug"] for i in arts}
    live = set(slug_of.values())
    links["clanek_kategorie"] = {slug_of[i]: a["cats"][:4] for i, a in arts.items() if a.get("cats")}
    links["souvisejici"] = {slug_of[i]: [s for s in a.get("related", []) if s in live and s != slug_of[i]][:3] for i, a in arts.items()}
    mag = {}
    for i, a in sorted(arts.items(), key=lambda x: -len(x[1]["content_html"])):
        for rank, c in enumerate(a.get("cats", [])[:4]):
            mag.setdefault(c, []).append((rank, slug_of[i]))
    links["magbox"] = {c: [s for _, s in sorted(v)[:4]] for c, v in sorted(mag.items())}
    links["titulky"] = {slug_of[i]: short(a["title"]) for i, a in arts.items()}
    links["magbox_default"] = [s for s in links.get("magbox_default", []) if s in live] or sorted(live)[:3]
    links["_zdroj"] = "scripts/blog-aplikuj.py (27. 10. 2026) from the rewritten articles' cats/related"
    print(f"{len(arts)} articles, {len(merge)} merged (301), photos {sum(1 for i in arts if slug_of[i] in fotky)}, magbox categories {len(links['magbox'])}")
    if not APPLY:
        return
    if ENV == "production" and os.environ.get("ERK_PRODUCTION_APPROVED") != "yes":
        raise SystemExit("production needs ERK_PRODUCTION_APPROVED=yes")
    for k in range(0, len(sql), 40):
        d1_file("\n".join(sql[k:k + 40]))
    LINKS.write_text(json.dumps(links, ensure_ascii=False, indent=1))
    print("applied; prolinkovani.json updated — commit + deploy the web (BUILD_ID) to show it")


if __name__ == "__main__":
    main()
