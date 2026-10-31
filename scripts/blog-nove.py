#!/usr/bin/env python3
"""eroka.cz — publish new magazine articles written per docs/magazin-styl.md (31. 10. 2026).

    scripts/blog-nove.py <dir with <slug>.json> [--env staging|production] [--apply]

Each JSON: slug, cat_id (1453 průvodce / 1 tipy a triky), title, seo_title, seo_desc, excerpt, content_html,
image_alt (+ photo from scripts/blog-fotky.py in public/a/blog/<slug>.webp). Inserts posts + slugs rows; an article
whose slug already exists is updated instead (re-runs are safe). Publication dates are spread one per day back
from today, so the blog does not show 11 articles with the same minute. --apply writes, otherwise dry run.
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path("/home/kenny/ai")
APP = ROOT / "apps/eroka"
NODE = "/home/kenny/.nvm/versions/node/v22.23.1/bin"
FOTO = APP / "public/a/blog"

args = sys.argv[1:]
SRC = Path(args[0])
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


def d1(sql=None, file=None):
    cmd = ["npx", "wrangler", "d1", "execute", "DB", "--env", ENV, "--remote", "-y"] + (["--json", "--command", sql] if sql else ["--file", file])
    r = subprocess.run(cmd, cwd=APP, env=WENV, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"D1 error: {r.stderr[-500:]}{r.stdout[-500:]}")
    return json.loads(r.stdout)[0]["results"] if sql else None


def main():
    arts = [json.loads(f.read_text()) for f in sorted(SRC.glob("*.json"))]
    fotky = json.loads((FOTO / "fotky.json").read_text())
    known = {r["slug"]: r for r in d1("SELECT slug, kind, ref_id FROM slugs")}
    next_id = d1("SELECT MAX(id) AS m FROM posts")[0]["m"] + 1
    now = datetime.now(timezone.utc)
    sql = []
    for n, a in enumerate(arts):
        slug = a["slug"]
        if slug not in fotky or not (FOTO / f"{slug}.webp").exists():
            raise SystemExit(f"{slug}: photo missing — run scripts/blog-fotky.py first")
        k = known.get(slug)
        if k and k["kind"] != "post":
            raise SystemExit(f"{slug}: slug taken by a {k['kind']}")
        img, card = f"https://eroka.cz/a/blog/{slug}.webp", f"https://eroka.cz/a/blog/{slug}-k.webp"
        cols = {"title": a["title"], "content_html": a["content_html"], "excerpt": a["excerpt"], "seo_title": a["seo_title"],
                "seo_desc": a["seo_desc"], "cat_id": a["cat_id"], "image": img, "image_card": card, "image_alt": a["image_alt"]}
        stamp = (now - timedelta(days=n)).strftime("%Y-%m-%dT%H:%M:%S")
        if k:
            sets = ", ".join(f"{c} = {q(v) if isinstance(v, str) else v}" for c, v in cols.items())
            sql.append(f"UPDATE posts SET {sets}, image_w = 1600, image_h = 900, modified_at = {q(now.strftime('%Y-%m-%dT%H:%M:%S'))} WHERE id = {k['ref_id']};")
            print(f"update {slug}")
            continue
        pid = next_id
        next_id += 1
        names = ", ".join(cols)
        vals = ", ".join(q(v) if isinstance(v, str) else str(v) for v in cols.values())
        sql.append(f"INSERT INTO posts (id, type, slug, {names}, published_at, modified_at, image_w, image_h, author, noindex, status, seo_robots) "
                   f"VALUES ({pid}, 'post', {q(slug)}, {vals}, {q(stamp)}, {q(stamp)}, 1600, 900, '', 0, 'publish', '');")
        sql.append(f"INSERT INTO slugs (slug, kind, ref_id) VALUES ({q(slug)}, 'post', {pid});")
        print(f"insert {slug} as {pid} ({stamp[:10]})")
    if not APPLY:
        return
    if ENV == "production" and os.environ.get("ERK_PRODUCTION_APPROVED") != "yes":
        raise SystemExit("production needs ERK_PRODUCTION_APPROVED=yes")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, dir=ROOT / "tmp") as t:
        t.write("\n".join(sql))
    try:
        d1(file=t.name)
    finally:
        os.unlink(t.name)
    print(f"applied {len(arts)} articles to {ENV}")


if __name__ == "__main__":
    main()
