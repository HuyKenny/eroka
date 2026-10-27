#!/usr/bin/env python3
"""Feed URLs (with tokens) → import Worker secrets. Values are never printed.

    scripts/set-feed-secrets.py local        # writes workers/import/.dev.vars (600, gitignored) for `wrangler dev`
    scripts/set-feed-secrets.py staging      # wrangler secret bulk --env staging  (eroka-import-staging)
    scripts/set-feed-secrets.py production   # needs ERK_PRODUCTION_APPROVED=yes

Source: credentials/.eroka-feeds.json (feeds.Feed__n.feed_url) and credentials/.eroka-credentials.env
(IMPORT_SHARED_SECRET_<ENV>).
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path("/home/kenny/ai")
APP = ROOT / "apps/eroka"


def creds(name=".eroka-credentials.env"):
    e = {}
    for line in open(ROOT / "credentials" / name):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k] = v.strip().strip("\"'")
    return e


def main():
    env = sys.argv[1] if len(sys.argv) > 1 else ""
    if env not in ("local", "staging", "production"):
        sys.exit(__doc__)
    if env == "production" and os.environ.get("ERK_PRODUCTION_APPROVED") != "yes":
        sys.exit("production needs ERK_PRODUCTION_APPROVED=yes")
    feeds = json.load(open(ROOT / "credentials/.eroka-feeds.json"))["feeds"]
    c = creds()
    secrets = {f"FEED_URL_{k.split('__')[1]}": v["feed_url"] for k, v in feeds.items() if v.get("feed_url")}
    secrets["IMPORT_SHARED_SECRET"] = c.get(f"IMPORT_SHARED_SECRET_{env.upper()}", "")
    if len(secrets["IMPORT_SHARED_SECRET"]) < 24:
        sys.exit("IMPORT_SHARED_SECRET missing in credentials")
    if env == "local":
        p = APP / "workers/import/.dev.vars"
        p.write_text("".join(f'{k}="{v}"\n' for k, v in secrets.items()))
        p.chmod(0o600)
        print(f"zapsáno {len(secrets)} hodnot do {p}")
        return
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(secrets, t)
        tmp = t.name
    os.chmod(tmp, 0o600)
    try:
        cf = creds(".cloudflare-credentials.env")
        auth = {"CLOUDFLARE_EMAIL": cf["CF_EMAIL"], "CLOUDFLARE_API_KEY": cf["CF_GLOBAL_API_KEY"], "CLOUDFLARE_ACCOUNT_ID": c["CF_ACCOUNT_ID"]}
        r = subprocess.run(["npx", "wrangler", "secret", "bulk", tmp, "-c", "workers/import/wrangler.jsonc", "--env", env],
                           cwd=APP, capture_output=True, text=True, env={**os.environ, **auth})
        print(f"{len(secrets)} secrets → eroka-import-{env}: {'ok' if r.returncode == 0 else 'CHYBA'}")
        if r.returncode:
            print(r.stderr[-400:])
    finally:
        os.unlink(tmp)


if __name__ == "__main__":
    main()
