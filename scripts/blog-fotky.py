#!/usr/bin/env python3
"""eroka.cz — article photos from Pexels (fallback Pixabay), every article a different photo (27. 10. 2026).

    scripts/blog-fotky.py <dir with <id>.json (slug, image_query)>    # writes public/a/blog/<slug>.webp (+ -k card) and fotky.json

No photo is used twice: the same Pexels/Pixabay id is skipped and so is a visually near-identical photo (64-bit dHash,
Hamming distance < 10) — photographers often upload one shoot in many frames. Keys: PEXELS_API_KEY / PIXABAY_API_KEY
(credentials/.alkoholicky-credentials.env, never printed).
"""
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path("/home/kenny/ai")
OUT = ROOT / "apps/eroka/public/a/blog"
UA = "Mozilla/5.0 (X11; Linux aarch64) ErokaBlog/1.0 (+https://eroka.cz)"


def creds(name):
    e = {}
    for line in open(ROOT / "credentials" / name):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k] = v.strip().strip("\"'")
    return e


KEYS = creds(".alkoholicky-credentials.env")


def get(url, headers=None, raw=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data)


def pexels(q):
    d = get("https://api.pexels.com/v1/search?" + urllib.parse.urlencode({"query": q, "orientation": "landscape", "per_page": 40}),
            {"Authorization": KEYS["PEXELS_API_KEY"]})
    return [("pexels", p["id"], p["src"]["original"] + "?auto=compress&cs=tinysrgb&w=2000", p.get("url", ""), p.get("photographer", "")) for p in d.get("photos", [])]


def pixabay(q):
    d = get("https://pixabay.com/api/?" + urllib.parse.urlencode({"key": KEYS["PIXABAY_API_KEY"], "q": q, "image_type": "photo", "orientation": "horizontal",
                                                                    "safesearch": "true", "per_page": 50, "min_width": 1600}))
    return [("pixabay", h["id"], h["largeImageURL"], h.get("pageURL", ""), h.get("user", "")) for h in d.get("hits", [])]


def dhash(im):
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def crop169(im, w):
    W, H = im.size
    t = 16 / 9
    if W / H > t:
        nw = int(H * t)
        im = im.crop(((W - nw) // 2, 0, (W - nw) // 2 + nw, H))
    else:
        nh = int(W / t)
        im = im.crop((0, (H - nh) // 2, W, (H - nh) // 2 + nh))
    return im.resize((w, int(w * 9 / 16)), Image.LANCZOS)


def main():
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    reg_file = OUT / "fotky.json"
    reg = json.loads(reg_file.read_text()) if reg_file.exists() else {}
    used = {(v["src"], v["photo"]) for v in reg.values()}
    hashes = [v["dhash"] for v in reg.values()]
    for f in sorted(src.glob("*.json")):
        a = json.loads(f.read_text())
        slug, q = a["slug"], a["image_query"]
        if slug in reg and (OUT / f"{slug}.webp").exists():
            continue
        picked = None
        words = q.split()
        queries = [q] + ([" ".join(words[:-1])] if len(words) > 2 else [])
        for query in queries:
            for provider in (pexels, pixabay):
                try:
                    cands = provider(query)
                except Exception as e:  # noqa: BLE001
                    print(f"{slug}: {provider.__name__} {type(e).__name__}", file=sys.stderr)
                    continue
                for s, pid, url, page, author in cands:
                    if (s, pid) in used:
                        continue
                    try:
                        im = Image.open(io.BytesIO(get(url, raw=True))).convert("RGB")
                    except Exception:  # noqa: BLE001
                        continue
                    if im.size[0] < 1200:
                        continue
                    h = dhash(im)
                    if any(bin(h ^ x).count("1") < 10 for x in hashes):
                        continue
                    picked = (s, pid, page, author, im, h)
                    break
                if picked:
                    break
            if picked:
                break
        if not picked:
            print(f"{slug}: NO PHOTO for '{q}'")
            continue
        s, pid, page, author, im, h = picked
        crop169(im, 1600).save(OUT / f"{slug}.webp", "WEBP", quality=80, method=6)
        crop169(im, 768).save(OUT / f"{slug}-k.webp", "WEBP", quality=78, method=6)
        reg[slug] = {"src": s, "photo": pid, "page": page, "author": author, "query": q, "dhash": h}
        used.add((s, pid))
        hashes.append(h)
        reg_file.write_text(json.dumps(reg, ensure_ascii=False, indent=1))
        print(f"{slug}: {s} {pid}")


if __name__ == "__main__":
    main()
