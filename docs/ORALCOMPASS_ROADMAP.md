# OralCompass — roadmap: integrating the uploaded master prompt

`docs/MASTER_PROMPT_UPLOADED.md` is the team's master build prompt (Lincoln-style Plan A/B/C, chat-first journey, ten oral-surgery
journeys, intro animation, summary, admin import). Nothing in this repository was removed to accommodate it; this page maps each of its
sections onto what already exists and adds the work as Claude Code commands. Where the two conflict, the stricter rule wins (both are
information-only; this repo additionally forbids steering language by linter and requires a cited clause behind every number).

| Master prompt section | Status here | Where / how |
|---|---|---|
| §1 Educational-only boundary (no treatment, recovery, booking, provider or plan recommendations) | Done, enforced | `tools/advice_lint.py` (word list now includes contact/consult/submit/obtain/visit-your openers), `api/app/lint_runtime.py`, copy files, PostToolUse hook |
| §2 Source hierarchy, version/page/confidence per rule, unknown stays unknown, conflicts preserved | Done | `sources/RESEARCH_PROTOCOL.md`, `tools/ingest_sources.py`, `fixtures/sources.json`, `fixtures/evidence/`, `docs/ORALCOMPASS_DATA_SOURCES.md` |
| §2 "Plan A / Plan B / Plan C" from three provided documents | Partly — presets exist for 9 real + 4 fictional plans; A/B/C labels are a selection layer | `/plan-import-review` adds upload → extract → review → publish; A/B/C become user-assigned aliases on presets or uploaded documents |
| §3 Runnable project with backend + database | Done as FastAPI + in-memory owner-scoped store (DynamoDB shape); SQLite/SQLAlchemy optional | `/persist-sqlite` (below) |
| §3 Mobile: React Native/Expo | Not done — the product is a phone-first PWA (React + Vite) that meets the same screens | `/mobile-expo` scopes a native port; the API contracts are already typed |
| §3 Demo mode without API keys; server-side Anthropic adapter by env var | Partly — the app runs fully without any model; extraction has a fixture extractor; the grounded assistant is not built | `/assistant-grounded` |
| §4 Login + demo login, plan dropdown, composer | Partly — dev auth header locally, Cognito JWT path for production; plan picker exists; no composer yet | `/assistant-grounded` adds the composer; `/auth-local` adds hashed local accounts + demo login |
| §5 Ten oral-surgery journeys + checkup + braces, research with sources, cost low/central/high with methodology | Not done — journeys exist as data-driven templates (3 samples); procedures catalog has 16 ids | `/procedure-journeys` (research protocol applies; provisional labels; no fabricated prevalence) |
| §6 Normalized plan tables, flattened cross-reference view, CSV/JSON exports, admin import/review/publish | Partly — normalized presets + evidence + rules endpoint; no SQL view/CSV yet | `/plan-import-review`, `/exports-crossref` |
| §7 Deterministic engine: billed vs allowed, deductible, coinsurance basis, caps, lifetime ortho, waiting, frequency, exclusions, OON, units, bundles, alternate benefit, benefit-year change, chronological accumulators | Mostly done (see `engine/`); ortho lifetime, bundles/duplicate prevention, per-unit quantities beyond `quantity`, low/central/high are not | `/scenarios-low-central-high`, `/engine-bundles-ortho` |
| §7 Baseline formula fixture ($200 allowed, $50 deductible, 80% → insurer $120 / member $80; cap $60 → $60 / $140) | Done — test added | `engine/tests/test_master_prompt_fixture.py` |
| §8 Clarification + grounded assistant with read-only tools; outputs validated against the engine | Not done | `/assistant-grounded` (tools: resolve_procedure, get_plan_rules, get_journey_template, get_estimate, explain_line_item, compare_requested_scenario) |
| §9 State machine LOGIN → CHAT → CLARIFYING → ESTIMATING → INTRO → MAP_READY → CHECKPOINT → MAP_REVIEW → SUMMARY → EXIT; intro ("Your Journey" typed, map fades in, Begin), traveler along the route, X review, summary, Exit | Partly — map, islands, checkpoints, detail panel, summary-like cost trail exist; intro/traveler/X/summary/Exit flow not | `/journey-intro` |
| §10 Visual quality (parchment, charcoal intro, sky-blue island scenes, restrained red X, no neon, no emoji decoration, reduced motion, safe areas) | Done in spirit (painted atlas, tokens, reduced motion) — note the em-dash rule below | `docs/ORALCOMPASS_UI_GUIDE.md`, `/ui-cinematic`, `/copy-style` |
| §11 Typed endpoints, estimate snapshots, secrets only server-side, upload validation, no HIPAA/Lincoln claims | Done for existing endpoints | `docs/ORALCOMPASS_DATA_MODEL.md`, `infra/template.yaml` |
| §12 Financial test list | Partly (deductible exemption, met/partial deductible, insurer vs member %, max exhaustion, noncovered/unknown, OON, multi-line, plan switching, reconciliation) — braces/installments, bundles, plan-year rollover, low/central/high not yet | `/engine-bundles-ortho`, `/scenarios-low-central-high` |
| §13 Deliverables: README for beginners, docs set, ZIP script | Partly — README, docs, zip exist; `docs/TEST_RESULTS.md`, `ASSUMPTIONS.md`, `CALCULATION_RULES.md` are produced by `/handoff-docs` | `/handoff-docs`, `scripts/package.sh` |

## Style rules adopted from the master prompt (additive)
- Navigation labels (Begin, Next, Back, End journey, Exit) are allowed; healthcare action verbs are not.
- "The X is the end of the modeled journey, not a clinical clearance" — reuse the existing progress note; the X (when added) carries the same sentence.
- No em dashes in user-facing copy and no decorative quoted slogans: apply with `/copy-style` (rewrites `copy.ts` and `templates.py`; the linter gains a check).
- Premiums stay separate from procedure totals (already true); payment timing is shown only when known ("Payment timing is not included in this estimate").

## Order of work for Claude Code (after `/run-checks` is green)
1. `/journey-intro` — the cinematic intro, Begin/Next/Back, traveler, X review, summary, Exit (keeps the composer mounted once it appears).
2. `/assistant-grounded` — composer + bounded read-only tools + demo mode; every amount rendered from engine fields.
3. `/procedure-journeys` — ten oral-surgery templates + checkup + braces, researched with sources.
4. `/scenarios-low-central-high`, `/engine-bundles-ortho` — engine extensions with tests.
5. `/plan-import-review`, `/exports-crossref`, `/persist-sqlite`, `/auth-local` — data operations.
6. `/art-assets` once the paintings are generated; `/ui-cinematic` for polish; `/handoff-docs` and `scripts/package.sh` to ship.
