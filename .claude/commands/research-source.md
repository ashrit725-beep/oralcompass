---
description: Add or re-verify one authoritative source (plan document, fee schedule, code reference) following sources/RESEARCH_PROTOCOL.md
---
Input: a document title/URL and what it should establish. Steps:
1. Read `sources/RESEARCH_PROTOCOL.md`. Open the document itself with the sanctioned fetch tool (never curl/wget/python; if the fetch fails, record the failure
   in `access_limits` and stop). Search snippets, FAQs and summaries are not evidence.
2. Extract facts with exact quotes, printed page numbers (say which numbering), section names, units (cents), percentage basis (plan pays vs you pay),
   frequency periods, per-person/family/period wording, age/tooth conditions. Unknown → `status: UNKNOWN` with where you looked. Disagreements → `conflicts`, both sides.
3. Map internal procedure keys to printed codes only when the code is printed in that document; set `review: true` whenever more than one code could apply.
4. Write `sources/extracted/<source_id>.json` and `sources/notes/<source_id>.md`; validate with `python3 -c "import json;json.load(open(path))"`.
5. If the source feeds a preset, add/extend a builder in `tools/ingest_sources.py` (pull every value by fact_id; never retype quotes), then run `/data-refresh`.
6. Add the row to `docs/ORALCOMPASS_DATA_SOURCES.md` §2 with scope, period, access limits and what it contributes.
