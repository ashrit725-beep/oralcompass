"""Redaction before any model call (spec §5.2; client-side redaction, owner request 05:40).

Two layers, applied in this order to every text a model could receive:

1. CONFIRMED VALUES. The person's device runs the detector (web/src/lib/redact.ts) over the pdf.js text layer and sends the identifiers it
   confirmed (`client_redaction`, version 1) plus any terms the person typed. Every occurrence of every value is removed, whatever its case,
   spacing, punctuation or line breaks ('Sam Rivera', 'SAM\nRIVERA', 'HB26-0042' / 'HB26 0042'), so pymupdf and pdf.js spacing differences do
   not matter. Matching runs on an alphanumeric-only projection of the text with an optional separator between every character, anchored to
   word boundaries ('Sam' never matches inside 'Sample').
2. SERVER PATTERNS (the safety net). Deterministic, label-anchored patterns for the same ten categories as the device detector. The union of
   both layers is what the model never sees.

Every pattern is linear in the input length: bounded repetitions only, no nested open-ended runs (security-1: redaction runs on
visitor-supplied text inside the request, so a pattern that backtracks quadratically would stall the process). Identifier patterns require a
value that contains a digit, so plan prose such as "policy period", "member services" or "group dental plan" is never removed
(api-correctness-24). Never removed: CDT codes, dollar amounts, percentages, dates without a birth label, frequency limits, waiting periods,
tooth numbers, plan and carrier names, and toll-free numbers (800/833/844/855/866/877/888 are the carrier's, not the person's).

The summary counts DISTINCT identifiers (de-duplicated by their case-, space- and punctuation-insensitive value); occurrences are counted
separately. Summaries carry categories, counts and masked values only, never a raw value. Nothing in this module logs anything.
"""
from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional, Sequence

REDACTION_VERSION = 1
CATEGORIES = ("name", "address", "member_id", "group_number", "claim_number", "account_number", "ssn", "dob", "phone", "email")
_PLACEHOLDER_TEXT = {
    "name": "[name removed]", "address": "[address removed]", "member_id": "[member ID removed]", "group_number": "[group number removed]",
    "claim_number": "[claim number removed]", "account_number": "[account number removed]", "ssn": "[SSN removed]",
    "dob": "[date of birth removed]", "phone": "[phone removed]", "email": "[email removed]",
}
# the labels `redact()` has always returned (the treatment-plan reader and the Documents list show them); new categories use their own key
LEGACY_LABELS = {"name": "name_line", "address": "address", "member_id": "member_id", "group_number": "group_number", "claim_number": "claim_number",
                 "account_number": "account_number", "ssn": "ssn", "dob": "dob", "phone": "phone", "email": "email"}
TOLL_FREE_AREA_CODES = frozenset({"800", "833", "844", "855", "866", "877", "888"})

# client_redaction limits (POST /me/documents/upload, POST /me/treatment-plans/read)
MAX_CLIENT_REDACTION_BYTES = 64 * 1024
MAX_CLIENT_IDENTIFIERS = 300
MAX_EXTRA_TERMS = 20
MAX_TERM_CHARS = 64
MIN_VALUE_CHARS, MAX_VALUE_CHARS = 2, 120
MIN_KEY_CHARS = 2                       # a value needs at least two letters or digits to be matched at all

_PLACEHOLDER_RE = re.compile("|".join(re.escape(p) for p in _PLACEHOLDER_TEXT.values()) + r"|\[removed\]")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def placeholder(category: str) -> str:
    """The inline token that replaces a removed identifier (the same words the web detector uses)."""
    return _PLACEHOLDER_TEXT.get(category, "[removed]")


# ---------------------------------------------------------------- server patterns (bounded, linear-time)
_STATES = ("AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|"
           "TN|TX|UT|VT|VA|WA|WV|WI|WY|PR|GU|VI|AS|MP")
_SUFFIX_WORDS = ("Street", "St", "Avenue", "Ave", "Road", "Rd", "Boulevard", "Blvd", "Drive", "Dr", "Lane", "Ln", "Court", "Ct", "Way", "Place", "Pl",
                 "Parkway", "Pkwy", "Terrace", "Ter", "Circle", "Cir", "Highway", "Hwy")
_SUFFIX = "(?:" + "|".join(sorted({s for w in _SUFFIX_WORDS for s in (w, w.upper())}, key=lambda s: (-len(s), s))) + ")"
_UNIT = r"(?:,?[ \t]{1,3}(?:Apartment|APARTMENT|Apt|APT|Suite|SUITE|Ste|STE|Unit|UNIT|#)\.?[ \t]{0,3}#?[A-Za-z0-9\-]{1,8})"
_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]{0,6}\.?"
_DATE = (r"(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?i:" + _MONTH + r")[ \t]{1,3}\d{1,2},?[ \t]{1,3}\d{4}"
         r"|\d{1,2}[ \t]{1,3}(?i:" + _MONTH + r"),?[ \t]{1,3}\d{4})")
_ID_TAIL = r"(?:[ \t]{0,3}(?:id|identification|number|num\.?|no\.?|#)(?![A-Za-z])){0,2}"


def _labelled_id(label: str, lo: int, hi: int) -> re.Pattern:
    """Label (case-insensitive) + optional 'ID / No. / Number / #' + a value of lo..hi letters, digits and hyphens that contains a digit."""
    return re.compile(r"\b(?:" + label + r")(?![A-Za-z])\.?" + _ID_TAIL + r"[ \t]{0,3}[:#\-]?[ \t]{0,3}"
                      r"(?P<v>(?=[A-Za-z0-9\-]{0,%d}\d)[A-Za-z0-9][A-Za-z0-9\-]{%d,%d})(?![A-Za-z0-9\-])" % (hi + 1, lo - 1, hi - 1), re.I)


_WORD = r"[A-Z][A-Za-z'\u2019\-]{0,30}\.?"
_PERSON_LABEL = (r"(?:patient|member|subscriber|insured|employee|dependent|policy[ \t]?holder|enrollee|beneficiary|"
                 r"primary(?:[ \t]{1,3}(?:insured|member|subscriber))?)")

SERVER_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("email", re.compile(r"(?<![\w.+-])(?P<v>[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8})\b")),
    ("ssn", re.compile(r"\b(?:ssn|ss#|social[ \t]{1,3}security(?:[ \t]{1,3}(?:number|no\.?|#))?)(?![A-Za-z])[ \t]{0,3}[:#]?[ \t]{0,3}"
                       r"(?P<v>\d{3}[ \-]?\d{2}[ \-]?\d{4})(?!\d)", re.I)),
    ("ssn", re.compile(r"(?<![\d\-])(?P<v>\d{3}-\d{2}-\d{4})(?![\d\-])")),
    ("dob", re.compile(r"(?i:\b(?:dob|d\.o\.b\.?|date[ \t]{1,3}of[ \t]{1,3}birth|birth[ \t]{0,3}date))(?![A-Za-z])[ \t]{0,3}[:\-]?[ \t]{0,3}"
                       r"(?P<v>" + _DATE + r")(?!\d)")),
    ("member_id", _labelled_id(r"member|subscriber|policy|identification|id|certificate|cert", 5, 30)),
    ("group_number", _labelled_id(r"group|grp", 4, 30)),
    ("claim_number", _labelled_id(r"claim", 4, 30)),
    ("account_number", _labelled_id(r"account|acct", 4, 30)),
    ("phone", re.compile(r"(?<![A-Za-z0-9])(?P<v>(?:\+?1[ \-.]{1,2})?(?:\((?P<a1>\d{3})\)[ \t]{0,2}|(?P<a2>\d{3})[\-. \t])\d{3}[\-. \t]\d{4})(?![0-9])")),
    ("address", re.compile(r"(?<![A-Za-z0-9])(?P<v>\d{1,6}[A-Za-z]?[ \t]{1,3}(?:[A-Z0-9][A-Za-z0-9.'\u2019\-]{0,29}[ \t]{1,3}){1,5}" + _SUFFIX +
                           r"(?![A-Za-z0-9])\.?" + _UNIT + r"?)")),
    ("address", re.compile(r"(?<![A-Za-z])(?P<v>[A-Z][A-Za-z.'\u2019\-]{1,30}(?:[ \t]{1,3}[A-Z][A-Za-z.'\u2019\-]{1,30}){0,3},[ \t]{0,3}(?:" + _STATES +
                           r")[ \t]{1,3}\d{5}(?:-\d{4})?)(?![0-9])")),
    ("name", re.compile(r"(?:(?i:\b" + _PERSON_LABEL + r"(?:[ \t]{1,3}name)?[ \t]{0,3}:)|(?i:^[ \t]{0,6}name[ \t]{0,3}:)|(?i:\b(?:dear|attn\.?:?|attention:)))"
                        r"[ \t]{0,6}(?P<v>" + _WORD + r"(?:[ \t]{1,3}" + _WORD + r"){1,4})", re.M)),
]

# a name value stops at the next label; it is not a person's name when it starts like prose or names an organisation
_NAME_STOP_LABELS = {"member", "subscriber", "id", "dob", "d.o.b", "group", "grp", "claim", "account", "acct", "date", "phone", "tel", "telephone", "fax",
                     "mobile", "cell", "email", "e-mail", "ssn", "policy", "patient", "dependent", "insured", "employee", "address", "plan", "birth",
                     "no", "number", "relationship", "gender", "sex", "age", "effective", "coverage", "provider", "dentist", "carrier", "card"}
_NAME_FIRST_STOP = {"the", "your", "any", "a", "an", "all", "each", "this", "that", "our", "you", "valued", "covered", "eligible", "enrolled", "see",
                    "not", "no", "none", "same", "other", "new", "current", "who", "if", "for", "to", "of", "and", "or", "please", "refer", "self",
                    "spouse", "child", "children", "n/a", "na", "unknown", "employer", "customer"}
_ORG_WORDS = {"dental", "plan", "plans", "services", "service", "insurance", "insurer", "company", "benefits", "benefit", "coverage", "ppo", "hmo",
              "dhmo", "epo", "inc", "llc", "ltd", "group", "network", "care", "health", "office", "department", "center", "centre", "mutual",
              "association", "trust", "fund", "corporation", "corp", "co", "clinic", "practice", "program", "programs", "state", "county", "university"}
_KEEP_DOTTED = {"jr.", "sr.", "ii.", "iii.", "iv."}
_YEARISH = re.compile(r"\d{4}(?:-\d{2,4})?")
_CDT = re.compile(r"[Dd]\d{4}")
_PLAIN_DATE = re.compile(r"\d{1,2}-\d{1,2}-\d{2,4}")


def _name_value(text: str, vs: int, ve: int) -> Optional[tuple[int, int]]:
    """Trim a label-anchored name to its name words: stop at the next label word, require 2 to 5 words, refuse prose and organisations."""
    words = [(m.start() + vs, m.end() + vs, m.group(0)) for m in re.finditer(r"[^ \t]+", text[vs:ve])]
    kept = []
    for s, e, w in words:
        if w.rstrip(".,:").casefold() in _NAME_STOP_LABELS:
            break
        kept.append((s, e, w))
    if not 2 <= len(kept) <= 5:
        return None
    if kept[0][2].rstrip(".,").casefold() in _NAME_FIRST_STOP or any(w.rstrip(".,").casefold() in _ORG_WORDS for _, _, w in kept):
        return None
    s, e, last = kept[0][0], kept[-1][1], kept[-1][2]
    if last.endswith(".") and len(last.rstrip(".")) > 1 and last.casefold() not in _KEEP_DOTTED:
        e -= 1                              # a sentence full stop is not part of the name; an initial ('J.') or 'Jr.' keeps its dot
    return s, e


def _accept(category: str, m: re.Match, text: str) -> Optional[tuple[int, int]]:
    """The value span of a server-pattern match, or None when the match is not a personal identifier."""
    vs, ve = m.span("v")
    value = text[vs:ve]
    if category == "phone":
        area = m.group("a1") or m.group("a2")
        if area in TOLL_FREE_AREA_CODES:
            return None
    elif category in ("member_id", "group_number", "claim_number", "account_number"):
        if _YEARISH.fullmatch(value) or _CDT.fullmatch(value) or _PLAIN_DATE.fullmatch(value):
            return None
    elif category == "name":
        return _name_value(text, vs, ve)
    return vs, ve


# ---------------------------------------------------------------- confirmed values: separator-insensitive matching
_SEP = "\x00"


def _fold_char(c: str) -> str:
    if c.isascii():
        return c.lower() if c.isalnum() else ""
    f = unicodedata.normalize("NFKC", c).casefold()
    return "".join(ch for ch in f if ch.isalnum())


def _projection(text: str) -> tuple[str, list[int]]:
    """Text → (letters and digits only, case-folded, with one separator for every run of anything else; origin index of every character)."""
    out: list[str] = []
    origin: list[int] = []
    for i, c in enumerate(text):
        f = _fold_char(c)
        if f:
            for ch in f:
                out.append(ch)
                origin.append(i)
        elif out and out[-1] != _SEP:
            out.append(_SEP)
            origin.append(i)
    return "".join(out), origin


def value_key(value: str) -> str:
    """The de-duplication key of an identifier: its letters and digits, case-folded ('(919) 555-0142' == '919.555.0142')."""
    return "".join(_fold_char(c) for c in value or "")


def _value_pattern(key: str) -> Optional[re.Pattern]:
    """Matches the key in a projection at word boundaries, with an optional separator between any two characters. Each step is a literal
    or one optional separator that can never be confused with it: linear per attempt, no backtracking blow-up."""
    if len(key) < MIN_KEY_CHARS:
        return None
    return re.compile(r"(?<![^\x00])" + "\x00?".join(re.escape(ch) for ch in key) + r"(?![^\x00])")


# ---------------------------------------------------------------- the engine
@dataclass
class _Entry:
    category: str
    value: str
    key: str
    source: str                         # device | term | server
    term: Optional[str] = None
    pattern: Optional[re.Pattern] = None
    occurrences: int = 0
    pages: set = field(default_factory=set)


def _protected_mask(text: str) -> bytearray:
    mask = bytearray(len(text))
    for m in _PLACEHOLDER_RE.finditer(text):
        mask[m.start():m.end()] = b"\x01" * (m.end() - m.start())
    return mask


def _apply(text: str, spans: list[tuple[int, int, "_Entry"]]) -> str:
    out, pos = [], 0
    for s, e, ent in spans:
        out.append(text[pos:s])
        out.append(placeholder(ent.category))
        pos = e
    out.append(text[pos:])
    return "".join(out)


def _value_spans(text: str, entries: Sequence[_Entry], page_no: int) -> list[tuple[int, int, _Entry]]:
    """Every occurrence of every entry's value in `text`, merged where they overlap (a merged span is removed whole, under the category of
    its longest member; each member counts the occurrence because its value is gone from what the model receives)."""
    live = [e for e in entries if e.pattern is not None]
    if not live or not text:
        return []
    proj, origin = _projection(text)
    mask = _protected_mask(text)
    cands: list[tuple[int, int, _Entry]] = []
    for ent in live:
        for m in ent.pattern.finditer(proj):
            s, e = origin[m.start()], origin[m.end() - 1] + 1
            if s > 0 and text[s - 1] == "(" and ")" in text[s:e]:
                s -= 1                      # '(919) 555-0142' leaves no stray parenthesis
            if any(mask[s:e]):
                continue                    # inside a placeholder another layer already put there
            cands.append((s, e, ent))
    cands.sort(key=lambda c: (c[0], -(c[1] - c[0])))
    merged: list[tuple[int, int, _Entry, list[_Entry]]] = []
    for s, e, ent in cands:
        if merged and s < merged[-1][1]:
            ms, me, lead, members = merged[-1]
            if (e - s) > (me - ms) and s == ms:
                lead = ent
            merged[-1] = (ms, max(me, e), lead, members + [ent])
        else:
            merged.append((s, e, ent, [ent]))
    out = []
    for s, e, lead, members in merged:
        for ent in {id(x): x for x in members}.values():
            ent.occurrences += 1
            ent.pages.add(page_no)
        out.append((s, e, lead))
    return out


def classify_term(term: str) -> str:
    """A typed term is a name unless its shape is one of the other categories (an email, a phone number, an ID with digits...)."""
    t = " ".join((term or "").split())
    if not t:
        return "name"
    for category, pat in SERVER_PATTERNS:
        if category not in ("email", "phone", "address"):
            continue
        if pat.fullmatch(t):
            return category                 # a typed toll-free number is still a phone number the person asked to remove
    if re.fullmatch(r"\d{3}[ \-]?\d{2}[ \-]?\d{4}", t):
        return "ssn"
    if re.fullmatch(_DATE, t):
        return "dob"
    if re.fullmatch(r"(?=[A-Za-z0-9\-]{0,31}\d)[A-Za-z0-9][A-Za-z0-9\-]{3,29}", t):
        return "member_id"
    return "name"


def _confirmed_items(confirmed: Optional[Iterable[Any]]) -> list[tuple[str, str]]:
    out = []
    for c in confirmed or []:
        if isinstance(c, dict):
            cat, val = c.get("category"), c.get("value")
        elif isinstance(c, (tuple, list)) and len(c) == 2:
            cat, val = c
        else:
            continue
        if cat in CATEGORIES and isinstance(val, str) and val.strip():
            out.append((cat, val))
    return out


def mask_value(category: str, value: str) -> str:
    """A display form that never contains the value: initials for names and addresses, the last few characters of an ID or number, and the
    domain of an email address ('S•• R•••••', '•••• 0142', '••••@example.com')."""
    v = " ".join((value or "").split())
    if category == "email":
        domain = v.rpartition("@")[2] if "@" in v else ""
        return f"••••@{domain}" if domain else "••••"
    if category in ("name", "address"):
        words = [w for w in re.split(r"[ ]+", v) if w]
        return " ".join((w[0] + "•" * (len(w) - 1)) if w[0].isalnum() else "•" * len(w) for w in words) or "••••"
    alnum = re.sub(r"[^0-9A-Za-z]", "", v)
    shown = alnum[-4:] if len(alnum) >= 8 else (alnum[-2:] if len(alnum) >= 5 else "")
    return f"•••• {shown}" if shown else "••••"


def empty_summary() -> dict:
    return {"total": 0, "by_category": {}, "occurrences": 0, "from_device": 0, "from_server_check": 0, "device_not_found": 0, "masked": []}


def redact_pages(pages: Sequence[str], confirmed: Optional[Iterable[Any]] = None, extra_terms: Optional[Iterable[str]] = None
                 ) -> tuple[list[str], dict, list[str]]:
    """Remove every confirmed value and typed term, then every server-pattern identifier, from each page.

    Returns (redacted pages, summary, legacy labels). The summary counts DISTINCT identifiers removed from what the model receives:
    {total, by_category, occurrences, from_device, from_server_check, device_not_found, masked: [{category, masked, occurrences}]}."""
    entries: dict[str, _Entry] = {}
    order: list[_Entry] = []

    def add(ent: _Entry) -> _Entry:
        if ent.key in entries:
            return entries[ent.key]
        entries[ent.key] = ent
        order.append(ent)
        return ent

    for cat, val in _confirmed_items(confirmed):
        key = value_key(val)
        if len(key) >= MIN_KEY_CHARS:
            add(_Entry(cat, val, key, "device", pattern=_value_pattern(key)))
    for term in extra_terms or []:
        if not isinstance(term, str) or not term.strip():
            continue
        key = value_key(term)
        if len(key) >= MIN_KEY_CHARS:
            add(_Entry(classify_term(term), term.strip(), key, "term", term=term.strip(), pattern=_value_pattern(key)))
    device = [e for e in order if e.source in ("device", "term")]

    # layer 1: confirmed values and typed terms, longest first where they overlap
    out = [str(p or "") for p in pages]
    for i, text in enumerate(out):
        spans = _value_spans(text, device, i + 1)
        if spans:
            out[i] = _apply(text, spans)

    # layer 2: server patterns, category by category; a match that touches a placeholder is already handled
    found_server: list[_Entry] = []
    for category, pat in SERVER_PATTERNS:
        for i, text in enumerate(out):
            mask = None
            spans = []
            for m in pat.finditer(text):
                span = _accept(category, m, text)
                if span is None:
                    continue
                s, e = span
                if mask is None:
                    mask = _protected_mask(text)
                if any(mask[s:e]):
                    continue
                value = text[s:e]
                key = value_key(value)
                if len(key) < MIN_KEY_CHARS:
                    continue
                ent = entries.get(key) or add(_Entry(category, " ".join(value.split()), key, "server", pattern=_value_pattern(key)))
                ent.occurrences += 1
                ent.pages.add(i + 1)
                if ent.source == "server" and ent not in found_server:
                    found_server.append(ent)
                spans.append((s, e, ent))
            if spans:
                out[i] = _apply(text, spans)

    # layer 3: an identifier the server found (a name next to its label, an ID after 'Member ID') is removed wherever else it appears,
    # however it is spaced there (prose, letters, page footers, 'HB26 0042 7731' on a later page)
    if found_server:
        for i, text in enumerate(out):
            spans = _value_spans(text, found_server, i + 1)
            if spans:
                out[i] = _apply(text, spans)

    found = [e for e in order if e.occurrences > 0]
    found.sort(key=lambda e: CATEGORIES.index(e.category))          # stable: first appearance within a category
    by_category: dict[str, int] = {}
    for e in found:
        by_category[e.category] = by_category.get(e.category, 0) + 1
    summary = {
        "total": len(found),
        "by_category": {c: by_category[c] for c in CATEGORIES if c in by_category},
        "occurrences": sum(e.occurrences for e in found),
        "from_device": sum(1 for e in found if e.source in ("device", "term")),
        "from_server_check": sum(1 for e in found if e.source == "server"),
        "device_not_found": sum(1 for e in device if e.occurrences == 0),
        "masked": [{"category": e.category, "masked": mask_value(e.category, e.value), "occurrences": e.occurrences} for e in found],
    }
    labels = [LEGACY_LABELS[c] for c in CATEGORIES if any(e.category == c and e.source != "term" for e in found)]
    labels += [f"user:{e.term[:3]}…" for e in order if e.source == "term" and e.occurrences > 0 and e.term]
    return out, summary, labels


def redact_detailed(text: str, confirmed: Optional[Iterable[Any]] = None, extra_terms: Optional[Iterable[str]] = None) -> tuple[str, dict]:
    """One text → (redacted text, summary). `confirmed` is the device's list of {category, value} (or (category, value) pairs)."""
    pages, summary, _ = redact_pages([text or ""], confirmed, extra_terms)
    return pages[0], summary


def redact(text: str, extra_terms: Optional[list[str]] = None) -> tuple[str, list[str]]:
    """The original interface: (redacted text, labels of what was removed: category labels, then 'user:Abc…' per typed term found)."""
    pages, _, labels = redact_pages([text or ""], None, extra_terms)
    return pages[0], labels


# ---------------------------------------------------------------- client_redaction intake
class InvalidClientRedaction(ValueError):
    """Any malformed client_redaction. The HTTP layer answers 422 {"error": "invalid_client_redaction"} and never echoes the input."""


def _clean_string(s: Any, lo: int, hi: int) -> str:
    if not isinstance(s, str):
        raise InvalidClientRedaction()
    v = s.strip()
    if not lo <= len(v) <= hi or _CONTROL.search(v):
        raise InvalidClientRedaction()
    return v


def parse_client_redaction(raw: Any) -> dict:
    """client_redaction (a JSON string from a multipart field, or an already-decoded object) → {"version": 1, "identifiers": [{category,
    value}], "extra_terms": [...]}, de-duplicated. Raises InvalidClientRedaction for anything outside the contract: not JSON, over 64 KB,
    a version other than 1, over 300 identifiers or 20 terms, an unknown category, a value outside 2..120 characters, a term over 64
    characters, or control characters."""
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = bytes(raw).decode("utf-8")
        except UnicodeDecodeError:
            raise InvalidClientRedaction()
    if isinstance(raw, str):
        if len(raw.encode("utf-8")) > MAX_CLIENT_REDACTION_BYTES:
            raise InvalidClientRedaction()
        try:
            data = json.loads(raw)
        except (ValueError, RecursionError):
            raise InvalidClientRedaction()
    elif isinstance(raw, dict):
        try:
            if len(json.dumps(raw).encode("utf-8")) > MAX_CLIENT_REDACTION_BYTES:
                raise InvalidClientRedaction()
        except (TypeError, ValueError, RecursionError):
            raise InvalidClientRedaction()
        data = raw
    else:
        raise InvalidClientRedaction()
    if not isinstance(data, dict):
        raise InvalidClientRedaction()
    version = data.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version != REDACTION_VERSION:
        raise InvalidClientRedaction()
    idents = data.get("identifiers", [])
    terms = data.get("extra_terms", [])
    if not isinstance(idents, list) or len(idents) > MAX_CLIENT_IDENTIFIERS or not isinstance(terms, list) or len(terms) > MAX_EXTRA_TERMS:
        raise InvalidClientRedaction()
    out_ids: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for it in idents:
        if not isinstance(it, dict):
            raise InvalidClientRedaction()
        cat = it.get("category")
        if not isinstance(cat, str) or cat not in CATEGORIES:
            raise InvalidClientRedaction()
        val = _clean_string(it.get("value"), MIN_VALUE_CHARS, MAX_VALUE_CHARS)
        k = (cat, value_key(val) or val.casefold())
        if k not in seen:
            seen.add(k)
            out_ids.append({"category": cat, "value": val})
    out_terms: list[str] = []
    for t in terms:
        if not isinstance(t, str):
            raise InvalidClientRedaction()
        v = t.strip()
        if len(v) > MAX_TERM_CHARS or _CONTROL.search(v):
            raise InvalidClientRedaction()
        if v and v not in out_terms:
            out_terms.append(v)
    return {"version": REDACTION_VERSION, "identifiers": out_ids, "extra_terms": out_terms}
