---
description: Rebuild all generated data from the extracted sources, validate, audit and sync the web fixtures
---
1. `python3 tools/ingest_sources.py` — regenerates `fixtures/sources.json`, `fixtures/evidence/*.json`, `fixtures/procedure_codes.json`, `fixtures/fee_benchmarks.json`
   and the real presets (`ml26*, dd24*, fm26*, fd26*`). The report must end with `"validation_errors": []`.
2. `python3 tools/build_fictional_plans.py` only if a fictional plan changed (regenerates its PDF and fixture together; never edit those by hand).
3. `python3 tools/audit_data.py` — 0 high findings; read `docs/DATA_AUDIT.md` and fix anything new.
4. `cd engine && python3 -m pytest -q` and `cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m pytest -q tests` — the demo numbers in CLAUDE.md rule 8 must still hold.
5. `cp fixtures/plans/*.json web/public/fixtures/plans/ && cp fixtures/documents/*.pdf web/public/fixtures/documents/`.
6. Update the counts in `docs/ORALCOMPASS_DATA_SOURCES.md` §3 from `fixtures/ingest_report.json` and `fixtures/audit_report.json`.
