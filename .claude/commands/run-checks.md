---
description: Run every automated check (engine tests, API tests, citation verification, copy lint, web build) and summarize failures
---
Run, in order, and report each result in one line; stop and fix on the first failure unless told otherwise:
1. `cd engine && python3 -m pytest -q`
2. `cd api && FINEPRINT_DEV_AUTH=1 python3 -m pytest -q tests`
3. `python3 tools/verify_citations.py fixtures/plans/hb26.json` (expect 23/23); `python3 tools/verify_citations.py fixtures/plans/dd24.json` and `ml26.json`
   (expect NOT SEEDED until `tools/seed_presets.py` has run at the venue; after seeding expect all verified or an explicit list of page-index fixes)
4. `python3 tools/advice_lint.py web/src/lib/copy.ts` and `python3 tools/advice_lint.py api/app/templates.py` (0 violations)
5. `cd web && npm run build`
6. Compare the fixture totals in `docs/CODELINC_DENTAL_PRODUCT_SPEC.md` §7 against `engine/tests/test_fixture.py` — they must be identical; if the spec drifted, fix the spec, not the test.
Finish with a table: check | status | note.
