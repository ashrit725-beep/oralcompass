#!/usr/bin/env python3
"""Phone variants of the painted plates in web/public/art (mobile-only app; see web/src/lib/art-srcset.ts).

For every plate `<name>.webp` (an original, never a `<name>-<w>` variant) this writes `<name>-<w>.webp` (Pillow, quality 72, method 6)
and `<name>-<w>.avif` (ImageMagick's libheif AV1 encoder, when `magick` can write AVIF) at 480, 720 and 960 px wide. The aspect ratio is
kept and a plate is never upscaled. Alpha is resized premultiplied so fog and island edges do not pick up dark fringes. An AVIF that comes
out larger than its WebP twin is dropped (the WebP is then the better file for every browser). The originals stay untouched.

The manifest `web/public/art/sizes.json` is {name: {w, h, src, bytes, variants: [{w, h, webp, bytes, avif?, avifBytes?}]}}, with
`bytes` the WebP size in bytes. Re-run after adding or repainting a plate:  python3 tools/art_variants.py  (add --check to verify only).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "web" / "public" / "art"
WIDTHS = (480, 720, 960)
WEBP_QUALITY = 72
AVIF_QUALITY = 50
VARIANT = re.compile(r"-(?:" + "|".join(map(str, WIDTHS)) + r")$")   # a -480/-720/-960 variant (not fog-layer-1)


def magick_avif() -> str | None:
    exe = shutil.which("magick")
    if not exe:
        return None
    out = subprocess.run([exe, "-list", "format"], capture_output=True, text=True).stdout
    return exe if re.search(r"^\s*AVIF\*?\s+\S+\s+rw", out, re.M) else None


def plates(art: Path) -> list[Path]:
    return sorted(p for p in art.glob("*.webp") if not VARIANT.search(p.stem))


def resize(im: Image.Image, w: int) -> Image.Image:
    h = round(im.height * w / im.width)
    if im.mode in ("RGBA", "LA", "P"):
        return im.convert("RGBA").convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    return im.convert("RGB").resize((w, h), Image.LANCZOS)


def build(art: Path, check: bool, reuse: bool = False) -> int:
    magick = magick_avif()
    manifest: dict[str, dict] = {}
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for src in plates(art):
            name = src.stem
            with Image.open(src) as im:
                im.load()
                entry = {"w": im.width, "h": im.height, "src": f"/art/{src.name}", "bytes": src.stat().st_size, "variants": []}
                for w in WIDTHS:
                    if w >= im.width:   # never upscale (a variant as wide as the original would only re-encode it)
                        continue
                    h = round(im.height * w / im.width)
                    webp = art / f"{name}-{w}.webp"
                    avif = art / f"{name}-{w}.avif"
                    if check:
                        if not webp.exists():
                            problems.append(f"missing {webp.name}")
                            continue
                    elif reuse and webp.exists() and webp.stat().st_size > 0:
                        pass   # --reuse: keep the encoded variant (and its AVIF, if any); only the manifest is rewritten
                    else:
                        small = resize(im, w)
                        small.save(webp, "WEBP", quality=WEBP_QUALITY, method=6)
                        if magick:
                            png = Path(tmp) / f"{name}-{w}.png"
                            small.save(png, "PNG")
                            subprocess.run([magick, str(png), "-strip", "-quality", str(AVIF_QUALITY), "-define", "heic:speed=2", str(avif)],
                                           check=True, capture_output=True)
                            if avif.stat().st_size >= webp.stat().st_size:
                                avif.unlink()
                    v = {"w": w, "h": h, "webp": f"/art/{webp.name}", "bytes": webp.stat().st_size}
                    if avif.exists():
                        v["avif"] = f"/art/{avif.name}"
                        v["avifBytes"] = avif.stat().st_size
                    entry["variants"].append(v)
                manifest[name] = entry
    path = art / "sizes.json"
    text = json.dumps(manifest, indent=2) + "\n"
    if check:
        if not path.exists() or json.loads(path.read_text()) != manifest:
            problems.append("sizes.json is stale (re-run tools/art_variants.py)")
        for p in problems:
            print("art_variants:", p, file=sys.stderr)
        return 1 if problems else 0
    path.write_text(text)
    total = sum(v["bytes"] for e in manifest.values() for v in e["variants"])
    total_avif = sum(v.get("avifBytes", 0) for e in manifest.values() for v in e["variants"])
    print(f"{len(manifest)} plates; variants: webp {total:,} B, avif {total_avif:,} B" + ("" if magick else " (magick lacks AVIF: webp only)"))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--art", type=Path, default=ART)
    ap.add_argument("--check", action="store_true", help="verify the variants and sizes.json without writing")
    ap.add_argument("--reuse", action="store_true", help="keep variants that already exist (encode only the missing ones)")
    a = ap.parse_args()
    return build(a.art, a.check, a.reuse)


if __name__ == "__main__":
    raise SystemExit(main())
