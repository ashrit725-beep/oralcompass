# FinePrint — codeLinc 11 · Path 1 Dental

*Your plan's fine print, stitched to your estimate. Information only; the user makes every decision.*

A Claude Code–ready repository: open it in Claude Code, and the project instructions (`CLAUDE.md`), milestone commands (`.claude/commands/`),
subagent roles (`.claude/agents/`) and a copy-lint hook (`.claude/settings.json`) steer the build. The deterministic engine, the API's
isolation model, the fixtures and the web shell are already working and tested — the milestones extend them.

## 60-second start
```bash
# engine (no dependencies)
cd engine && python3 -m pytest -q                          # 15 passed
# api
cd ../api && pip install -r requirements.txt && FINEPRINT_DEV_AUTH=1 python3 -m pytest -q tests   # 5 passed
FINEPRINT_DEV_AUTH=1 uvicorn app.main:app --reload --port 8000
# web (new terminal)
cd ../web && npm install && cp ../fixtures/plans/*.json public/fixtures/plans/ && cp ../fixtures/documents/*.pdf public/fixtures/documents/ && npm run dev
# open http://localhost:5173 — Harborview (fictional) preset, Sam's estimate, Page + Ledger joined by stitches
```
Then in Claude Code: `/m0-validate` → `/m1-thread-demo` → `/m2-scenarios` → `/m2b-presets-compare` → `/m3-privacy` → `/m4-live-upload` → `/m5-accessibility` → `/m6-notifications` (last). `/run-checks` any time; `/lint-copy` for any sentence; `/pitch-from-fixture` before slides.

## What is already true (tested)
| Area | Status |
|---|---|
| Engine: deductible scope, coinsurance, annual-max cap, alternate benefit (incl. unknown allowance → upper bound), waiting periods (unknown enrollment → two branches), three frequency clocks, exclusions, out-of-network balance, processing-order note, ranges + "what moves these numbers", three-plan comparison with factual Differences sentences | `engine/tests` 15/15 |
| Acceptance example from the design brief ($600 in-network / $900 out-of-network; ordering $850 either way) | `tests/test_acceptance.py` |
| The ONE demo fixture (Harborview $665/$535; OON $965; deductible-unknown $640–$665; premolar $565/$635; Delta ≥$685/≤$815 and 6-month $1,500/$0; MetLife $732.50/$767.50) | `tests/test_fixture.py` |
| Harborview fictional certificate PDF (14 pages) generated from one source of truth; all 23 fixture citations found on their cited pages | `tools/build_harborview_pdf.py`, `tools/verify_citations.py` |
| API: owner-scoped reads with constant 404 and ids-only audit; presets GET-only (405 on writes); redaction preview; delete/export; fixture totals through the API | `api/tests` 5/5 |
| Advice linter (banned words, imperatives, steering modals) over UI copy and generated sentences | `tools/advice_lint.py` — 0 violations |
| Web shell: pdf.js Page with dim-and-highlight stitches, receipt Ledger with stitch chips, depth-dial Clause card, comparison grid, phone split panes / desktop columns, reduced-motion CSS | `npm run build` passes |

## What is NOT done (honest list)
Live Bedrock extraction (`BedrockExtractor` raises until M0/M4); Cognito/KMS/S3 wiring (infra skeleton only; dev auth header locally);
real preset documents not yet downloaded/seeded (`tools/seed_presets.py` at the venue; DD24/ML26 page indexes to confirm; MetLife Classic premium
and class definitions UNKNOWN until extracted from the 2026 guide/certificate); notifications; accessibility audit; any deployment.

## Documents
`docs/CODELINC_DENTAL_PRODUCT_SPEC.md` (source of truth) · `docs/CODELINC_DENTAL_BUILD_BRIEF.md` (schedule, pitch, packet) · `docs/CODELINC_DENTAL_RESEARCH.md` (evidence).

## Data and licensing posture
Member data is synthetic (Sam Rivera, Northside Dental Group, Harborview). Real plan documents are public (Delta Dental MSU 2024 EOC; NCFlex 2026 guide / 2020 certificate) and contain no personal data. No CDT code catalog is shipped (ADA license); FAIR Health data is not used (terms); Bedrock usage costs must be documented in the Devpost packet ("components incurring future licensing costs").
