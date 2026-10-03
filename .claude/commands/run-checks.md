---
description: Run every automated check (engine tests, API tests, citation verification, copy lint, web build) and summarize failures
---
Run, in order, and report each result in one line; stop and fix on the first failure unless told otherwise:
1. `cd engine && python3 -m pytest -q` (19 tests)
2. `cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m pytest -q tests` (10 tests)
3. `python3 tools/ingest_sources.py --check` (validation_errors must be []) and `python3 tools/audit_data.py` (0 high findings)
4. `for f in hb26 sm26 nw26 tw26; do python3 tools/verify_citations.py fixtures/plans/$f.json; done` (all citations found);
   real presets report NOT SEEDED until `tools/seed_presets.py` has downloaded and hashed their PDFs (network permitting)
5. `python3 tools/advice_lint.py web/src/lib/copy.ts` and `python3 tools/advice_lint.py api/app/templates.py` (0 violations)
6. `cd web && npx tsc --noEmit && npm run build`
7. With the API on :8000 and the preview on :4173: `python3 tools/screenshots.py shots/` (44/44)
8. Compare the demo numbers in `CLAUDE.md` rule 8 and `docs/CODELINC_DENTAL_PRODUCT_SPEC.md` §7 against the tests — identical, or fix the docs, not the tests.
Finish with a table: check | status | note.
