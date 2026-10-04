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


## Follow-up merge (fu/redaction, fu/ask, fu/labels, fu/walk), 2026-10-04 07:20

Merged with --no-ff onto build/journey-v2 (516bc60, 674e077, ff956e1, 9656e8b). No conflicts.

| Check | Result |
|---|---|
| `npm run build` | built in 16.67s; main index 465.69 kB (140.13 kB gzip) |
| `npm test` | 46 files, 537 tests passed |
| `npm run check:engines` | OK-one-engine |
| `npm run check:bundle` | OK-bundle main=136.8KB |
| `npm run lint:copy` | 0 violation(s) |
| `advice_lint.py web/src/lib api/app/templates.py api/app/assistant_templates.py` | 0 violation(s) |
| `advice_lint.py api/app/assistant_glossary.py` | 0 violation(s) |
| engine `pytest -q` | 22 passed |
| `ingest_sources.py --check` | validation_errors: [] |
| API `pytest -q tests` | 2 failed, 384 passed, 106 skipped. Both failures are `test_explain.py::test_live_once_for_real_when_the_stored_key_and_network_allow` (directly and inside the SqliteRepo re-run in `test_store_backends.py`). That test calls the live provider with the stored key and network; api/ is unchanged by these branches. |
| `tools/screenshots.py` walk | Not run at merge (deadline). fu/walk reported 240 of 242 checks against the merged app: open fails are the Pixel 7 review-count position (y=447 of 839) and the wide upload dialog not found. |

## rm/* merge round (2026-10-04, 07:29)

Merged (--no-ff, in order): rm/redaction, rm/ask-ui, rm/ask-api, rm/bedrock, rm/docs-ui (conflicts resolved: DocumentsView uses
docs-ui's `fieldPathLabel` general map, `needsLabels` kept for its test; upload.ts keeps both imports; styles.css takes docs-ui's
`--bottom-chrome` token), rm/fixtures, rm/mobile (assistant.css conflict: dropped an orphan comment), rm/art. Dropped: none.
Live model-call tests (`test_live_once_for_real_when_the_stored_key_and_network_allow` in test_explain.py and
test_treatment_reader.py) are now `@pytest.mark.live_llm`: skipped unless ORALCOMPASS_RUN_LIVE_TESTS=1.

Final gate (actual output tails):
- web `npm test`: Test Files 51 passed (51); Tests 562 passed (562)
- api `ORALCOMPASS_DEV_AUTH=1 pytest -q tests`: 523 passed, 3 skipped, 5 warnings in 127.04s
- engine `pytest -q`: 22 passed in 0.08s
- `advice_lint.py web/src/lib api/app/templates.py api/app/assistant_templates.py api/app/assistant_glossary.py`: 0 violation(s)
- web `npm run lint:copy`: 0 violation(s)
- web `npm run check:bundle`: OK-bundle main=139.0KB

## Post-merge phone check (2026-10-04, 07:35)

Independent check of build/journey-v2 in LIVE mode (`/health`: llm_mode live, providers openrouter → bedrock, model anthropic/claude-haiku-4.5),
VITE_DEV_AUTH preview, iPhone 13 (WebKit) and Pixel 7 (Chromium): every tab opens at the top, no horizontal scroll, no page errors, no console
errors, no 5xx. Two issues found and fixed with tests:
- 0609639: assistant answers showed a line's you-pay / plan-pays (and what remains after it) with the bare "From the plan document" badge; they
  now read "Calculated from the clauses cited" (an assumption keeps its ASSUMED badge).
- 288580d: journey-level answers (definitions, totals, remaining benefits, procedure by name, compare terms, document overview) are composed
  from the engine's figures in every mode; on a live server they are labelled "Fixed template", not "Demo mode".
Gate after the fixes: web build OK; vitest 51 files / 562 tests passed; lint:copy 0; check:bundle OK (main 139.1 KB). api/ and engine/
unchanged since the merge round gate above (API 523 passed / 3 skipped; engine 22 passed).
