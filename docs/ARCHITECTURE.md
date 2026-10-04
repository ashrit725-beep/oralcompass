# OralCompass architecture

How the pieces fit, where every number comes from, what a model can and cannot touch, and how the product was built. Module names are
the files in this repository; the governing details live in `docs/ORALCOMPASS_DESIGN_SPEC.md` (+ addendum), `docs/ORALCOMPASS_DATA_MODEL.md`
and `docs/SECURITY.md`.

## 1. System

```mermaid
flowchart LR
  subgraph Browser["Browser (React 18 + Vite + Tailwind v4 + shadcn + Motion)"]
    Views["Views: My journey, My plan, Compare, Documents"]
    Lib["web/src/lib: passage.ts, trail.ts, stitches.ts, api.ts, copy/*"]
    Views --> Lib
  end
  subgraph API["FastAPI (api/app)"]
    Main["main.py: presets, documents, account"]
    Records["records.py: plans, rules, procedures, benefits, treatment items, estimates"]
    Journeys["journeys.py"]
    Uploads["uploads.py + extraction.py + redaction.py"]
    AI["assistant.py, treatment_reader.py, explain.py via ai_support.py"]
    Guard["llm_guard.py + lint_runtime.py"]
    Store["store.py (memory) or store_sqlite.py"]
  end
  Engine["engine/oralcompass_engine (stdlib Python, integer cents)"]
  Fixtures["fixtures/ (plans, procedures, codes, users, documents)"]
  Sources["sources/extracted/*.json (quotes + pages)"]
  LLM["OpenRouter: Claude Haiku 4.5 (live mode only)"]

  Lib -- "/api (JSON)" --> API
  Records --> Engine
  Uploads --> Engine
  Records & Main & Journeys & Uploads & AI --> Store
  Sources -- "tools/ingest_sources.py" --> Fixtures
  Fixtures --> Records
  AI --> Guard
  Uploads --> Guard
  Guard -. "redacted text only, capped" .-> LLM
```

- **Development:** `uvicorn app.main:app` on one port, Vite dev or preview on another with `/api` proxied (`web/vite.config.ts`;
  `ORALCOMPASS_API_TARGET` overrides the target). Dev auth reads an `X-Dev-User` header.
- **Production shape (not deployed):** `api/app/server.py` serves the API under `/api` and `web/dist` at `/` from one container
  (`Dockerfile`, `railway.json`), with signed HttpOnly session cookies (`sessions.py`), CSP and body limits (`security.py`) and the SQLite store.

## 2. Request flow: one estimate

```mermaid
sequenceDiagram
  participant W as Web (useAppData)
  participant R as records.py
  participant O as repo.get_owned
  participant E as engine
  participant S as store
  W->>R: POST /me/estimates {plan_code, treatment_item_ids, network, hypotheticals}
  R->>O: read every referenced item and benefits record
  O-->>R: owned records (anything else: constant 404)
  R->>E: load_plan(plan) + items + benefits snapshot
  E-->>R: ledger.lines[].steps {label, cents, owner, rule, stitch}, totals, missing_inputs, could_change
  R->>S: save SavedEstimate (immutable), audit event with ids only
  R-->>W: SavedEstimate
  W->>W: buildTrail(line) and buildPassage(...): display only, reconciled against engine totals
```

The web layer never computes a new amount. `lib/trail.ts` sums the steps for display and checks the sum against the engine's
`patient_cents` and `plan_cents`, showing "Amounts reconcile" or "do not reconcile".

## 3. The Passage: data to map

All derivations are pure functions in `web/src/lib/passage.ts` (unit-tested against captured Alex and Sam payloads in
`web/src/__fixtures__/passage/`). Spec §3 is the full table.

```mermaid
flowchart TB
  TI["GET /me/treatment-items"] --> Split{"item.status"}
  Split -- "planned, scheduled (in estimate order)" --> Route["Procedure islands on the route"]
  Split -- "completed" --> Visited["Visited islands in the wake (figures USER, never recomputed)"]
  Split -- "consultation_mentioned" --> Margin["Marginal island: coverage rule only, no amount"]
  Split -- "cancelled" --> List["Overview list only"]
  EST["POST /me/estimates: ledger.lines[]"] --> State{"line.status"}
  State -- "estimate" --> Clear["Clear island + checkpoints from line.steps"]
  State -- "unresolved" --> Fog["Fog + 'Waiting for information' with missing_inputs"]
  State -- "not_covered" --> Closed["Closed channel: Fee + one closed checkpoint (X, W or F)"]
  Clear --> CP["Checkpoints in fixed order: Fee, Allowed (N), Alternate (AB), Deductible (D), Plan share (CO), Maximum (M), Listed, You pay"]
  EST --> Sound["Soundings between islands: line.remaining_after (deductible, maximum)"]
  BEN["GET /me/benefits"] --> Start["START harbor: remaining deductible and maximum with derivation"]
  EST --> Light["Harbor Light: totals, order_note, could_change, after-the-route stages"]
  JRN["GET /journeys"] --> Light
```

Route order equals ledger order, which is the order the engine consumed the deductible and annual maximum; it is causal, so it is not
user-sortable. Each checkpoint carries its evidence badge or a stitch (`ML26#p25`) that opens the ClauseCard and the Documents page.

## 4. Upload and extraction pipeline

```mermaid
flowchart LR
  U["POST /me/documents/upload (PDF, owner space, api/.data, never web/public)"] --> RT["reading_text: PyMuPDF per page; mostly scanned means failed"]
  RT --> RD["redacting: redaction.py + the person's own terms; preview shown (PUT .../redaction)"]
  RD --> ID{"identifying_fields"}
  ID -- "demo: checksum matches a fixture PDF" --> FX["FixtureExtractor (cached model)"]
  ID -- "demo: unknown PDF" --> NM["demo_no_model: every field not_found"]
  ID -- "live: guard allows" --> M1["Call 1: verbatim sentences + pages"]
  M1 --> M2["Call 2: structure into typed schema (values, pages, quotes only)"]
  FX & M2 --> MR["matching_rules: wording to the 16 fixed keys via printed vocabulary only"]
  MR --> VQ["verifying_quotes: exact on page = confirmed; within ±2 pages or similarity ≥ 0.92 = likely; else dropped"]
  VQ --> RV["Review table (PUT .../review): person confirms or edits each field"]
  RV --> PB["POST .../publish: immutable UP1, UP2, ... loads through engine load_plan"]
```

Document text is data. Sentences addressed to automated readers (the fictional fixtures carry one on p.11) are removed from every quote and
listed under `structure.ignored_wording`. No document text, filename, quote or amount is logged.

## 5. Assistant guardrails

```mermaid
flowchart TB
  Q["POST /me/assistant {scope, question}"] --> L["Scope lock: every id through repo.get_owned (404 otherwise)"]
  L --> T["Six read-only tools gather facts first (tools_used lists ids only)"]
  T --> I{"Intent: advice question?"}
  I -- "yes" --> AT["Fixed template from engine fields"]
  I -- "no" --> Mode{"Live and guard allows?"}
  Mode -- "no" --> DT["Demo templates (assistant_templates.py) over engine fields"]
  Mode -- "yes" --> LV["Model gets facts as a JSON data block; returns sentences with refs"]
  LV -- "any failure" --> DT
  AT & DT & LV --> G["Per sentence: lint_runtime.guard; at least one ref in the scope's allowed set; no digit beside $ or % outside a {{ref:n}} placeholder"]
  G --> A["Answer: sentences with chips resolved from the stored ledger; mode ribbon"]
```

The assistant never computes money; amounts come only from the engine's stored ledger through `{{ref:n}}` placeholders. The treatment-plan
reader and clause explainer follow the same pattern (redact, guard, verify against the source text, fall back to a template) and are
described in `README.md` and `docs/SECURITY.md`.

## 6. LLM cost guard

```mermaid
flowchart LR
  C["Feature wants a live call (extraction, reader, explainer, assistant)"] --> K{"Per-visitor limit for this kind"}
  K -- "over" --> F["Refuse: demo/template behaviour + limit ribbon"]
  K -- "ok" --> D{"Global daily requests (300) and estimated spend (US$2.00)"}
  D -- "over" --> F
  D -- "ok" --> R["Reserve one request"] --> Call["extraction.OpenRouterExtractor._call (json_schema, one retry)"]
  Call --> Rec["Record provider-reported token usage once, priced per 1k tokens"]
  G2["Error inside the guard"] --> F
```

Per-visitor limits by kind: extraction 5 per UTC day, reader 10 per day, explainer 60 per day, assistant 30 per 10-minute window, other
kinds 20 per day; every limit and cap is an environment variable (`api/app/llm_guard.py`). An unknown model is priced high rather than free.
The guard fails closed on spend. The in-process limiters in `ai_support.py` also apply in demo mode, since PDF parsing costs CPU.

## 7. Test safety

`api/tests/conftest.py` sets `ORALCOMPASS_LLM_PROVIDER=none` and clears `OPENROUTER_API_KEY` before the app imports, and
`load_dotenv(override=False)` never replaces an existing variable, so a live `api/.env` cannot switch the suite to live calls. Tests that
mock a live call bring their own fake key and `httpx.MockTransport`; a real call needs `@pytest.mark.live_llm` and
`ORALCOMPASS_ALLOW_LIVE_LLM=1`. The suite runs on both the memory and the SQLite store.

## 8. How it was built

```mermaid
flowchart LR
  B["Owner's brief (MASTER_BUILD_PROMPT_V2)"] --> P["Design panel: parallel concept agents"]
  P --> S["Design spec (ORALCOMPASS_DESIGN_SPEC)"]
  S --> AD["Addendum: owner concerns override (AI features, cost guard, production)"]
  AD --> CP["Component plan with anti-slop rules and acceptance"]
  CP --> WB["Parallel worktree builds (foundation, journey, plan, upload + assistant, API, AI features)"]
  WB --> RL["Review lenses + skeptic verifiers"]
  RL --> FX["Per-area fix branches"]
  FX --> FN["Parallel finish (fixes, docs, screenshots) then integration and provers"]
```

1. **Design panel.** Several agents proposed directions against the brief; the selected direction became the painted-atlas Passage.
2. **Spec.** `docs/ORALCOMPASS_DESIGN_SPEC.md` fixed the data-to-map mapping, layouts, states with exact copy, motion vocabulary,
   accessibility and the demo script, with file ownership and frozen shared interfaces for parallel work.
3. **Addendum.** `docs/ORALCOMPASS_DESIGN_SPEC_ADDENDUM.md` records the owner's later decisions; where it and the spec disagree, the addendum wins.
4. **Component plan.** `docs/ORALCOMPASS_COMPONENT_PLAN.md` lists every component, the vendored sources (`web/THIRD_PARTY_NOTICES.md`) and
   the anti-slop rules checked by grep (§4) and acceptance checks (§6).
5. **Parallel worktree builds.** Each area was built in its own git worktree and branch against the frozen interfaces, then merged into
   `build/journey-v2`.
6. **Review lenses and skeptics.** Reviewers read the merged build through separate lenses (information-only copy, evidence, accessibility,
   security, motion, data); skeptic agents re-verified each finding before it became a fix item (`docs/BUILD_FOLLOWUPS.md`).
7. **Per-area fixes, then a parallel finish.** Fix branches per area, merged with the full check suite: engine and API pytest, web build
   and tests, the ingest check, the advice linter, and the screenshot and layout walks on desktop and phone.
