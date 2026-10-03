"""Redaction before any model call (spec §5.2). Deterministic regexes; the user sees and can extend the result (Step 3)."""
from __future__ import annotations

import re

PATTERNS = {
    "member_id": re.compile(r"\b(?:member|subscriber|id|policy)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9]{6,})\b", re.I),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "dob": re.compile(r"\b(?:DOB|date of birth)\s*[:\-]?\s*\d{1,2}/\d{1,2}/\d{2,4}\b", re.I),
    "phone": re.compile(r"\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b"),
    "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
    "name_line": re.compile(r"^(?:patient|name|insured|employee)\s*[:\-]\s*.+$", re.I | re.M),
    "address": re.compile(r"\b\d{1,6}\s+[A-Za-z0-9.\s]+\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane)\.?\b", re.I),
}


def redact(text: str, extra_terms: list[str] | None = None) -> tuple[str, list[str]]:
    removed: list[str] = []
    out = text
    for label, pat in PATTERNS.items():
        if pat.search(out):
            removed.append(label)
            out = pat.sub(f"[{label} removed]", out)
    for term in extra_terms or []:
        if term and term in out:
            removed.append(f"user:{term[:3]}…")
            out = out.replace(term, "[removed]")
    return out, removed
