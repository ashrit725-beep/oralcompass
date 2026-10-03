#!/usr/bin/env python3
"""Seed real preset documents (run at the venue, where the PDFs can be downloaded).

For each fixture whose source_document.sha256 is empty:
  1. download source_document.url to fixtures/documents/<plan_code>.pdf
  2. record sha256 and page count in the fixture
  3. run tools/verify_citations.py — quotes whose page index was recorded from an extraction layer ('page_note') may need
     their PDF page index corrected by hand; the tool prints which ones failed. Never 'fix' a quote by changing its words.
Presets are read-only after seeding: a corrected fixture is a NEW version (bump catalog.verification.date and version label).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def seed(fixture: Path) -> None:
    fx = json.loads(fixture.read_text())
    doc = fx["source_document"]
    if doc.get("sha256"):
        print(f"{fx['plan_code']}: already seeded"); return
    if not doc.get("url"):
        print(f"{fx['plan_code']}: no URL"); return
    out = ROOT / "fixtures" / "documents" / f"{fx['plan_code'].lower()}.pdf"
    print(f"downloading {doc['url']} -> {out}")
    urllib.request.urlretrieve(doc["url"], out)
    doc["sha256"] = hashlib.sha256(out.read_bytes()).hexdigest()
    doc["path"] = str(out.relative_to(ROOT))
    try:
        import fitz
        doc["pages"] = fitz.open(str(out)).page_count
    except Exception:
        pass
    fixture.write_text(json.dumps(fx, indent=2))
    subprocess.call([sys.executable, str(ROOT / "tools" / "verify_citations.py"), str(fixture), str(out)])


if __name__ == "__main__":
    for f in (sys.argv[1:] or [str(p) for p in (ROOT / "fixtures" / "plans").glob("*.json")]):
        seed(Path(f))
