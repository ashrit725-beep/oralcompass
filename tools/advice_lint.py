#!/usr/bin/env python3
"""Advice linter — enforces the information-only policy (spec §3.6) on UI copy, templates, notification text and model output.

Usage:
  python3 tools/advice_lint.py web/src/lib/copy.ts api/app/templates.py        # lint string literals in source files
  python3 tools/advice_lint.py --text "Schedule the crown in January to save $410."
  python3 tools/advice_lint.py --json strings.json                             # a JSON list of strings

Exit code 1 on any violation. Import `lint_text` for runtime use (api/app/lint_runtime.py).
Rules:
  1. Banned words/phrases (case-insensitive, word boundaries).
  2. Imperative openers on sentences of ≥ 5 words (UI control labels ≤ 4 words are exempt from rule 2, not from rule 1).
  3. Second-person steering modals: "you can save", "you could save", "you'll save", "you should", "you need to", "you must".
  4. Ranking/winner vocabulary.
  (owner rule) No advice of any kind: "ask your", "talk to", "call the", "contact your", "check with", "make sure", "remember to",
     "don't forget", "you may want", "it's a good idea", "worth it", "consider", "recommend", "should", "best", "wait until",
     "schedule it/your/now..." are banned anywhere; tests in api/tests/test_advice_lint.py.
  5. (source files only, tests excluded) No em dash used as punctuation (" — ") in a one-line string literal (antislop R-02; a lone "—"
     placeholder for a missing value is allowed). Not applied to `--text`/`--json` or to runtime model output (`lint_text` is unchanged).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BANNED = [
    r"\bshould\b", r"\brecommend(s|ed|ation|ations)?\b", r"\bbest\b", r"\boptimal\b", r"\bsmart(est|er)?\b", r"\bconsider\b",
    r"\bmake sure\b", r"\bdon'?t forget\b", r"\buse (up )?your benefits\b", r"\bsav(e|es|ed|ing|ings)\b", r"\bbefore it'?s too late\b",
    r"\bbook (now|today|an appointment)\b", r"\bschedule (now|today|before)\b", r"\bact now\b", r"\bhurry\b", r"\bdeal\b", r"\bwin(ner|ning)?\b",
    r"\bbetter plan\b", r"\bright plan for you\b", r"\byou qualify\b", r"\byou can enroll\b", r"\bavailable to you\b", r"\bcheapest\b",
    r"\bdon'?t waste\b", r"\bexpir(e|es|ing) soon\b", r"\bmaximize\b", r"\btake advantage\b", r"\bwe suggest\b", r"\bideal\b",
    # owner rule (no advice for anything at all): never tell anyone what to ask, call, check, wait for or schedule
    r"\bask your\b", r"\btalk to\b", r"\bcall (your|the|us|them|a|an)\b", r"\bcontact (your|the|us|them|a|an)\b", r"\bcheck with\b",
    r"\bremember to\b", r"\byou may want\b", r"\byou might want\b", r"\bit'?s a good idea\b", r"\ba good idea\b", r"\bworth it\b",
    r"\bconsider(ing)?\b", r"\bwait until\b", r"\bplease ask\b",
    r"\bschedule (it|the|your|a|an|this|that|them|now|today|before|soon)\b",
]
IMPERATIVE_OPENERS = [
    "schedule", "book", "use", "consider", "choose", "pick", "select the", "spend", "save", "hurry", "act", "call your", "ask your",
    "switch", "wait until", "delay", "postpone", "avoid", "try the", "go with", "enroll", "upgrade", "downgrade", "get the", "take the",
    # master prompt §1: no suggestions to book, schedule, call, consult, contact, visit, submit or obtain anything
    "contact", "consult", "submit", "obtain", "visit your", "request", "see your", "talk to", "follow up", "rest", "rinse", "take ibuprofen",
    "call", "check with", "remember", "please", "make sure", "don't forget", "wait",
]
STEERING_MODALS = [r"\byou (can|could|will|'ll|would) save\b", r"\byou (should|need to|must|ought to|had better)\b", r"\bwe (recommend|advise|suggest)\b"]
UI_EXEMPT_MAX_WORDS = 4


def lint_text(text: str, is_ui_label: bool = False) -> list[dict]:
    out = []
    for pat in BANNED:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            out.append({"rule": "banned", "match": m.group(0), "text": text})
    for pat in STEERING_MODALS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            out.append({"rule": "steering", "match": m.group(0), "text": text})
    if not is_ui_label:
        for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
            words = sentence.split()
            if len(words) < UI_EXEMPT_MAX_WORDS + 1:
                continue
            low = sentence.lower().lstrip("\"'“”(")
            for opener in IMPERATIVE_OPENERS:
                if low.startswith(opener + " ") or low.startswith(opener + ","):
                    out.append({"rule": "imperative", "match": opener, "text": sentence})
    return out


STRING_RE = re.compile(r"(?:\"((?:[^\"\\]|\\.)*)\"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)", re.S)


_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
_LINE_COMMENT = re.compile(r"(?<![:\\\w\"'`])//[^\n]*")        # not the "//" of a URL inside a string
_PY_COMMENT = re.compile(r"(?m)^\s*#[^\n]*$")


def strip_comments(src: str, suffix: str) -> str:
    """Code comments are not copy: apostrophes and quotes in them would otherwise pair up into false 'strings' (info-only-13)."""
    if suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs"}:
        return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", src))
    if suffix == ".py":
        return _PY_COMMENT.sub("", src)
    return src


def lint_file(path: Path) -> list[dict]:
    if ".test." in path.name or path.name.startswith("test_"):
        return []      # test files hold sample plan text and denied examples on purpose; they are not copy a person reads
    src = strip_comments(path.read_text(encoding="utf-8", errors="ignore"), path.suffix)
    out = []
    for m in STRING_RE.finditer(src):
        s = next(g for g in m.groups() if g is not None)
        if len(s.split()) == 0 or "://" in s or s.startswith("#") or re.fullmatch(r"[\w\-./:${}()\[\] ,%]+", s) and len(s.split()) <= 2:
            continue
        is_label = len(s.split()) <= UI_EXEMPT_MAX_WORDS
        if re.search("\\s\u2014\\s", s) and "\n" not in s:
            out.append({"rule": "em-dash", "match": "\u2014", "text": s, "file": str(path)})
        for v in lint_text(s, is_ui_label=is_label):
            v["file"] = str(path)
            out.append(v)
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__); return 2
    violations: list[dict] = []
    if argv[0] == "--text":
        violations = lint_text(" ".join(argv[1:]))
    elif argv[0] == "--json":
        for s in json.loads(Path(argv[1]).read_text()):
            violations += lint_text(s)
    else:
        for p in argv:
            path = Path(p)
            files = [path] if path.is_file() else [f for f in path.rglob("*") if f.suffix in {".ts", ".tsx", ".py", ".json", ".md"}]
            for f in files:
                violations += lint_file(f)
    for v in violations:
        print(f"[{v['rule']}] {v.get('file', '')} :: '{v['match']}' in: {v['text'][:140]}")
    print(f"{len(violations)} violation(s)")
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
