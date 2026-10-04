"""Redaction before any model call (spec §5.2). Deterministic regexes; the user sees and can extend the result (Step 3).

Every pattern is linear in the input length (bounded repetitions, no nested open-ended runs), because redaction runs on visitor-supplied
text inside the request: a pattern that backtracks quadratically would stall the whole process (security-1). Identifier patterns require a
value that contains a digit, so plan prose such as "policy period" or "member services" is never removed (api-correctness-24)."""
from __future__ import annotations

import re

_ADDRESS_SUFFIX = r"(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane)"
PATTERNS = {
    "member_id": re.compile(r"\b(?:member|subscriber|policy|id)\b\.?[ \t]*(?:id\b\.?|#|no\.?|number)?[ \t]*[:#\-]?[ \t]*((?=[A-Z0-9]{0,40}\d)[A-Z0-9]{6,40})\b", re.I),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "dob": re.compile(r"\b(?:DOB|date of birth)[ \t]*[:\-]?[ \t]*\d{1,2}/\d{1,2}/\d{2,4}\b", re.I),
    "phone": re.compile(r"(?<!\d)\(?\d{3}\)?[-. \t]\d{3}[-. \t]\d{4}\b"),
    "email": re.compile(r"(?<![\w.+-])[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}\b"),
    "name_line": re.compile(r"^[ \t]*(?:patient|name|insured|employee)[ \t]*[:\-][^\n]*$", re.I | re.M),
    "address": re.compile(r"\b\d{1,6}[ \t]+(?:[A-Za-z0-9.]{1,40}[ \t]+){0,5}" + _ADDRESS_SUFFIX + r"\b\.?", re.I),
}


def _term_pattern(term: str) -> re.Pattern:
    """A user term matches whatever its case and however its words are spaced ('Smith', 'SMITH', 'John  Smith')."""
    words = [re.escape(w) for w in term.split()]
    return re.compile(r"\s+".join(words), re.I)


def redact(text: str, extra_terms: list[str] | None = None) -> tuple[str, list[str]]:
    removed: list[str] = []
    out = text
    for label, pat in PATTERNS.items():
        if pat.search(out):
            removed.append(label)
            out = pat.sub(f"[{label} removed]", out)
    for term in extra_terms or []:
        if not term or not term.strip():
            continue
        pat = _term_pattern(term)
        if pat.search(out):
            removed.append(f"user:{term[:3]}…")
            out = pat.sub("[removed]", out)
    return out, removed
