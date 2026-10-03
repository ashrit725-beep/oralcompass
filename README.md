# OralCompass — codeLinc 11 · Path 1 Dental

*Your care journey. Your coverage. Clearly mapped.* A hand-painted atlas of a dental journey and a dental plan, where every dollar on the
cost trail is stitched to the clause that produced it. Information only; the user makes every decision.

This is a **Claude Code–ready repository**: open it in Claude Code and `CLAUDE.md` tells it what to read, what the quality bar is, which
commands to run and what must never change. Everything below already runs and is tested; the commands extend it.

## 60-second start
```bash
cd engine && python3 -m pytest -q                                          # 21 passed
cd ../api && pip install -r requirements.txt && ORALCOMPASS_DEV_AUTH=1 python3 -m pytest -q tests     # 10 passed
ORALCOMPASS_DEV_AUTH=1 uvicorn app.main:app --reload --port 8000           # API
cd ../web && npm install && cp ../fixtures/plans/*.json public/fixtures/plans/ && cp ../fixtures/documents/*.pdf public/fixtures/documents/ && npm run dev
# open http://localhost:5173 → "Open a labeled sample journey: Alex Chen" (real public plan rules) or Sam Rivera (fictional plan with a stored PDF)
```
Verification walk (desktop + phone screenshots, 44 checks): `cd web && npm run build && npx vite preview --port 4173 &` then `python3 tools/screenshots.py shots/`.

## In Claude Code
Start with `/run-checks`, then `/ui-cinematic` (beauty pass with before/after screenshots) and `/art-assets` once you have generated the paintings from
`docs/ORALCOMPASS_IMAGE_PROMPTS.md`. The roadmap for the team's master prompt (intro animation, grounded assistant, ten procedure journeys, scenarios,
import/review, SQLite, local login, handoff docs) is in `docs/ORALCOMPASS_ROADMAP.md` with one command per item (`/journey-intro`, `/assistant-grounded`,
`/procedure-journeys`, `/scenarios-low-central-high`, `/engine-bundles-ortho`, `/plan-import-review`, `/exports-crossref`, `/persist-sqlite`, `/auth-local`,
`/copy-style`, `/handoff-docs`, `/mobile-expo`). Data work: `/research-source`, `/data-refresh`. Any sentence: `/lint-copy`.

## What is already true (tested)
| Area | Status |
|---|---|
| Deterministic engine: deductible scope, coinsurance (plan-pays and you-pay bases), annual-max cap and "Unlimited", separate out-of-network deductible/maximum, alternate benefit (unknown allowance → upper bound; general clause flagged), procedure-scoped waiting periods (AMBIGUOUS flagged; unknown enrollment → two branches), frequency clocks, exclusions, out-of-network balance billing, processing-order note, ranges + "what moves these numbers", three-plan comparison | `engine/tests` 21/21 |
| Real plan presets generated from cited facts: NCFlex MetLife 2026 Classic/High/Low (NC), Delta Dental MSU 2024 High/Low (MS), FEDVIP 2026 MetLife and Delta (High/Standard); 437 facts from 12 sources; 16 procedure ids mapped to printed codes (9 flagged for review); NC Medicaid benchmark rows labeled by payer/geography/date | `tools/ingest_sources.py` (0 validation errors), `tools/audit_data.py` (0 high findings), `docs/ORALCOMPASS_DATA_SOURCES.md` |
| Demo numbers: Sam (fictional plan HB26) $640/$560 in-network, $940 out-of-network, $540/$660 premolar, $640–$665 when the deductible is unknown; Alex (real plan ML26) $392/$588 + $510/$510 = $902/$1,098 with every step stitched to the guide's page 25 | `engine/tests/test_fixture.py`, `engine/tests/test_real_presets.py`, `api/tests/test_records.py` |
| API: owner-scoped reads with constant 404 and ids-only audit for benefits, treatment items, saved estimates, journeys, documents; presets GET-only; derived remaining benefits with derivation strings and CONFLICT detection; missing-input explanations; sources/evidence/codes/benchmarks endpoints; journeys with user-marked vs dental-team-confirmed attribution | `api/tests` 10/10 |
| Web: painted atlas (My journey islands + checkpoints, My plan landmarks, cost trail, documents with clause list / pdf.js stitches, compare, privacy controls), phone layout with bottom sheet, reduced motion, overview list | `npm run build`; `tools/screenshots.py` 44/44 |
| Information-only policy enforced on copy, templates, generated sentences and edits (hook) | `tools/advice_lint.py` 0 violations |

## What is NOT done (honest list)
Real plan PDFs are not stored and hashes are pending (binary downloads were blocked where this was built; `tools/seed_presets.py` is the seeding path);
NCFlex certificate clauses past p.51 and FEDVIP brochure pages past ~p.30 are UNKNOWN (waiting periods, missing-tooth, some rows, FEDVIP premiums);
DD24 is a 2024 document; live Bedrock/Anthropic extraction and the grounded assistant are not wired; Cognito/KMS/S3 are a SAM skeleton; the master-prompt
intro/summary flow, ten procedure journeys, low/central/high scenarios, admin import/review, SQLite and local login are roadmap items; no deployment.

## Documents
`CLAUDE.md` · `docs/ORALCOMPASS_UI_GUIDE.md` · `docs/ORALCOMPASS_IMAGE_PROMPTS.md` · `docs/ORALCOMPASS_DATA_MODEL.md` · `docs/ORALCOMPASS_DATA_SOURCES.md` ·
`docs/ORALCOMPASS_ROADMAP.md` · `docs/MASTER_PROMPT_UPLOADED.md` · `docs/DATA_AUDIT.md` · `docs/CODELINC_DENTAL_PRODUCT_SPEC.md` · `docs/CODELINC_DENTAL_BUILD_BRIEF.md` ·
`docs/CODELINC_DENTAL_RESEARCH.md` · `sources/RESEARCH_PROTOCOL.md`.
