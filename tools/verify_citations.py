#!/usr/bin/env python3
"""Verify that every citation in a plan fixture is found on its cited page of the stored document (spec §5.10, check 7).

Usage: python3 tools/verify_citations.py fixtures/plans/hb26.json [fixtures/documents/harborview_certificate.pdf]
If the fixture's source_document.sha256 is empty, the document has not been seeded yet: the tool reports 'NOT SEEDED' and exits 2.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]


def iter_cites(obj, path="$"):
    if isinstance(obj, dict):
        if "quote" in obj and "page" in obj:
            yield path, obj
        for k, v in obj.items():
            yield from iter_cites(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from iter_cites(v, f"{path}[{i}]")


def main(fixture: str, pdf: str | None = None) -> int:
    fx = json.loads(Path(fixture).read_text())
    doc_meta = fx["source_document"]
    pdf_path = Path(pdf) if pdf else (ROOT / doc_meta.get("path", "")) if doc_meta.get("path") else None
    if not doc_meta.get("sha256") or not pdf_path or not pdf_path.exists():
        print(f"NOT SEEDED: {fx['plan_code']} has no stored document/sha256 yet — run tools/seed_presets.py at the venue"); return 2
    sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if sha != doc_meta["sha256"]:
        print(f"FAIL: sha256 mismatch for {pdf_path}"); return 1
    d = fitz.open(str(pdf_path))
    fails, n = 0, 0
    for path, c in iter_cites(fx):
        if c.get("doc") and c["doc"] != doc_meta["version_label"]:
            continue  # cites a secondary document (e.g. ML20c) — verified separately at seeding
        n += 1
        page = c["page"]
        if page < 1 or page > d.page_count:
            print(f"FAIL {path}: page {page} out of range"); fails += 1; continue
        text = " ".join(d[page - 1].get_text().split())
        if " ".join(c["quote"].split()) not in text:
            print(f"FAIL {path}: quote not found on page {page}: {c['quote'][:80]}"); fails += 1
    print(f"{fx['plan_code']}: {n - fails}/{n} citations verified on their pages (sha256 {sha[:12]}…)")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
