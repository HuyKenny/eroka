#!/usr/bin/env python3
"""eroka.cz — insert one editorial paragraph with a link into existing magazine posts/pages (31. 10. 2026).

    scripts/blog-vlozit-odkazy.py <plan.json> [--env staging|production] [--apply]

plan: [{"slug": "...", "html": "<p>… <a href=\"…\">…</a> …</p>", "must_link": "href"}]
The paragraph goes right before <h2>Časté otázky</h2> (the unified article structure), else at the end. A post that
already contains must_link is skipped, so re-runs are safe. Removing = delete the paragraph (see the plan file).
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path("/home/kenny/ai")
APP = ROOT / "apps/eroka"
NODE = "/home/kenny/.nvm/versions/node/v22.23.1/bin"
args = sys.argv[1:]
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
    plan = json.loads(Path(args[0]).read_text())
    slugs = ", ".join(q(p["slug"]) for p in plan)
    rows = {r["slug"]: r for r in d1(f"SELECT id, slug, content_html FROM posts WHERE slug IN ({slugs})")}
    sql = []
    for p in plan:
        r = rows.get(p["slug"])
        if not r:
            print(f"{p['slug']}: NOT FOUND")
            continue
        html = r["content_html"]
        if f'href="{p["must_link"]}"' in html:
            print(f"{p['slug']}: already links {p['must_link']}")
            continue
        marker = "<h2>Časté otázky</h2>"
        new = html.replace(marker, p["html"] + "\n" + marker, 1) if marker in html else html.rstrip() + "\n" + p["html"]
        sql.append(f"UPDATE posts SET content_html = {q(new)} WHERE id = {r['id']};")
        print(f"{p['slug']}: + {p['must_link']}")
    if not APPLY or not sql:
        return
    if ENV == "production" and os.environ.get("ERK_PRODUCTION_APPROVED") != "yes":
        raise SystemExit("production needs ERK_PRODUCTION_APPROVED=yes")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, dir=ROOT / "tmp") as t:
        t.write("\n".join(sql))
    try:
        d1(file=t.name)
    finally:
        os.unlink(t.name)
    print(f"applied {len(sql)} to {ENV}")


if __name__ == "__main__":
    main()
