# Test results

Gate run on build/journey-v2 after merging feat/mobile-cinematic (2026-10-04, 06:52–06:59).

| Check | Command | Result |
|---|---|---|
| Web build | `cd web && npm run build` | built in 10.74 s, no TypeScript errors |
| Web tests | `npm test` | 534 passed (534), 45 files |
| Engine count | `npm run check:engines` | OK-one-engine |
| Bundle budget | `npm run check:bundle` | OK-bundle main=136.8KB (gzip) |
| Copy lint | `npm run lint:copy` | 0 violations |
| API tests | `cd api && ORALCOMPASS_DEV_AUTH=1 python3 -m pytest -q tests` | 387 passed, 105 skipped |
| Engine tests | `cd engine && python3 -m pytest -q` | 22 passed |
| Source ingest | `python3 tools/ingest_sources.py --check` | validation_errors: [] |
| Advice lint | `python3 tools/advice_lint.py web/src/lib api/app/templates.py api/app/assistant_templates.py api/app/assistant_glossary.py` | 0 violations |

Not run in this pass: `tools/screenshots.py` (the phone walk timed out waiting for the old journey copy after the merge and needs updating),
`tools/layout_audit.py`, `tools/error_sweep.py`.
