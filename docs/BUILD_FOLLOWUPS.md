# Build follow-ups (living list; the review-and-polish workflow works through this)

Status legend: OPEN · DONE · DEFERRED (with reason). Every item names the file(s) and the acceptance check.

## API (from the API build and merge, 2026-10-03)
1. OPEN — `api/app/assistant.py` (`get_benefits`, `resolve_plan_ref`) and `api/app/notifications.py` (`reminders_for_plan`) resolve plans via `PLANS[code]`
   only; route `upload:<id>` refs through `uploads.resolve_plan_ref` so published UPn plans get assistant answers and reminders. Check: assistant test with an
   uploaded HB26 (UP1) scope answers with UP1 stitches; reminders for UP1 list the benefit-year end.
2. OPEN — `api/app/main.py` `/me/export` must include the `push_subscription` record type (DELETE /me already clears it). Check: export after subscribing lists it.
3. OPEN — UI distinction: with the server in live mode, `out_of_scope` and `advice_request` intents return fixed templates labelled `mode: "demo"` with the demo
   ribbon by design; the web answer card should say "fixed template" rather than "demo environment" in that case (API: add `template_only: true`, or the UI
   derives it from `intent`). Check: live mode + "Should I get the crown?" shows the template label, not the demo-environment ribbon.
4. DEFERRED (platform) — uploads live extraction runs as an in-process BackgroundTask; assistant rate limit is in-process memory; extraction stage status is persisted via
   `repo.put` (audit logs 'create'). Production (Lambda) needs a queue/step function, a shared rate-limit store and an update verb in the repo. Documented in
   `infra/README.md` honesty list by the docs pass.
5. DEFERRED (model) — live extraction completeness varies per run (fee-schedule rows); missing rows are honest UNKNOWNs and the review table's Edit path covers them.
   Call 2 runs as json_object because OpenRouter rejects the strict grammar for the full schema. Possible improvement: split call 2 into several strict calls.
6. DEFERRED (scope) — reminders cover `interval_months` and `calendar_count` clocks only (matches the engine's enforced clocks).

## Web (observed by the orchestrator in the builders' in-progress screenshots, 2026-10-03 21:55; verify after integration)
7. OPEN — Passage map label collisions (`components/atlas/PassageControls.tsx`, `Soundings.tsx`, `lib/passage.ts` layout): the soundings lozenge after the
   root canal sits on top of the crown island button; the crown title truncates ("Crown, porcelain/cera…"); visited-island chips truncate ("Periodic oral..",
   "Adult cleani...", "Bitewing x-..."). Check: no control rectangle overlaps another (assert in layoutPassage), full titles visible or available via the
   accessible name + a 2-line clamp, soundings placed on the route between islands, not on a label.
8. OPEN — Demo-mode assistant answers the selected step instead of the question (`api/app/assistant.py` intent/step resolution, `assistant_templates.py`):
   with step key "deductible" selected, "What happens to the annual maximum on this line?" returned the deductible template. Demo intent should read the
   question (maximum/annual max → M, deductible → D, share/percent/coinsurance → CO, allowed/network → N, downgrade/alternate → AB) and fall back to the
   selected step only when the question names none. Check: that exact question returns the annual-maximum sentence with the M step and maximum refs.
9. OPEN — Upload review table clipped inside the stepper (`components/upload/UploadWizard.tsx` / vendored `ui/Stepper.tsx` container width, `styles/upload.css`):
   the Confidence/Quote/Decision columns are cut off at 1366 px; the review step needs the full dialog width (or a horizontal scroll container with a
   scroll-fade) and a stacked card layout at 360 px. Check: all five columns visible at 1366, no clipped text at 360.
10. OPEN — The advice-question template reads mechanically ("status estimate; steps cited to the plan document: coinsurance, network basis"); rewrite as
   plain sentences from the same engine fields (antislop-copywriting), still information-only. Check: lint clean and reads as prose.

## Integration (2026-10-03, merge of the four web build branches into `build/journey-v2`)
Merged with `--no-ff` in order: journey-map (`worktree-wf_e9768877-b02-2`), drawer-pipeline (`-3`), plan-compass-compare (`-4`), upload-assistant (`-5`).
One conflict (`components/notifications/RemindersPanel.tsx`: the plan agent's null stub vs the real panel; the real panel won, DocumentsView passes
`refreshKey`). Integration edits: `lib/copy.ts` re-exports `DRAWER`/`COMPASS` from their own files; `styles.css` imports `styles/drawer.css`; additive
`types.ts`/`api.ts` fields the agents had typed locally (Benefits record extras, UploadedPlanSummary versions/banner, PlanEvidence upload fields,
AssistResponse ribbon, template `out_of_scope`, UploadResponse mode/note, `BenefitsIn` extras, `api.documentFile`); `useAppData` exposes `loadRecords`
(PlanView and the drawer call it after a PUT/POST); `ClauseCard` gets `askScope` from App; `StartSections` imports the Benefit statement form
statically; `vite.config.ts` splits react/radix/vaul into `ui-vendor` (main 121 KB gzip, no Rollup advisory); `styles.css` `.grid` → `table.grid`;
`ComparisonGrid` keeps the cell value printed while its clause card is open.
11. OPEN — Compare `tr.differences` rows (the API's per-topic difference sentence, e.g. "MetLife NCFlex Dental: $37.94; Delta Dental PPO: $41.57")
   print figures without a badge; the cells above them are badged. Either badge each figure in the sentence or render the row as the accessible
   summary only. `tools/screenshots.py` excludes `tr.differences` from the compare evidence check until then.
12. OPEN — Vendored shadcn radix-nova components lack `forwardRef` under React 18 (ui/drawer.tsx DrawerOverlay, ui/textarea.tsx, ui/button.tsx under
   `asChild`, ui/dialog.tsx DialogOverlay): dev-console "Function components cannot be given refs" warnings; plan §6 item 4 wants zero.
13. OPEN — `Primitives/Sheet.tsx` / `ui/drawer.tsx`: no `aria-modal` on the vaul content; the ProcedureDrawer sets it through a ref callback.
14. OPEN — Money.tsx passes no `transformTiming` to NumberFlow, so soundings/island amounts roll at NumberFlow's default (~750 ms), not the spec's 480 ms.
15. OPEN — No `#island/#cp` hash state (Back does not pop checkpoint → island → map); selection is in-memory only.
16. OPEN — Cancelled treatment items are not listed in the Overview list (PassageVM has no slot); the walk's added procedure is reverted by cancelling it.
17. OPEN — `PageView.tsx` draws stitch outlines with three hex literals on the canvas (foundation file); the plan §6 colour grep names it.
18. OPEN — Inline assistant in the drawer: the section heading says "Ask about this step" while the composer placeholder reads "Ask about this plan…"
   (the drawer scope carries `treatment_item_id`/`line_index` but no `step_key`); pass the selected checkpoint's step key or align the copy.
19. OPEN — Web Push subscribe/unsubscribe and "Send a test push" unverified end to end (headless Chromium denies Notification permission).
20. OPEN — Live-mode extraction of the 14-page fixture took ~5 min on one run; the screenshot walk runs the API in demo mode (`ORALCOMPASS_LLM_PROVIDER=demo`).

## Production readiness (2026-10-03, addendum §D; not deployed — see `docs/DEPLOY.md`)
21. NOTE for the AI-features branch — the treatment-plan reader and clause explainer must call the live-AI cost guard:
   `from . import llm_guard`; `ok, reason = llm_guard.allow(user.sub, "reader" | "explainer")` before the provider call (on refusal use the demo
   path and `templates.LLM_LIMIT_RIBBON`), then `llm_guard.record(kind, *llm_guard.usage_tokens(resp_json, fallback_in=..., fallback_out=max_tokens))`.
   Tests get fresh counters per test (`api/tests/conftest.py`). A reader route that accepts a photo/PDF must end in `/upload` (35 MB body limit,
   `api/app/security.py`) or be listed in `ORALCOMPASS_LARGE_BODY_PATHS`; every other route is capped at 1 MB.
22. NOTE — The production bundle no longer sends `X-Dev-User` (only `import.meta.env.DEV` or `VITE_DEV_AUTH=1` builds do; `web/src/lib/auth.ts`).
   `tools/screenshots.py` adds the header to `/api` requests itself, so the dev walk works against `npm run build` output unchanged. The walk can also
   run against the single server instead of `vite preview` (CSP applied): `cd api && ORALCOMPASS_DEV_AUTH=1 ORALCOMPASS_LLM_PROVIDER=none
   python3 -m uvicorn app.server:app --port <p>` then `ORALCOMPASS_WEB_BASE=http://127.0.0.1:<p> python3 tools/screenshots.py shots/` (134/134 there).
23. OPEN — Docker was unavailable on the build machine: `docker build` and the container pass of `tools/prod_smoke.py` have not run. The local
   production smoke (`python3 tools/prod_smoke.py`, same server and settings) passes 29/29.
24. OPEN — Assistant: the existing per-user 429 rate limit (30 per 10 min, all requests) and the guard's live-call limit (30 per 10 min) are equal, so
   the guard's assistant ribbon appears only after the global caps; lower `ORALCOMPASS_LLM_LIMIT_ASSISTANT` to make the per-visitor fallback reachable.
25. OPEN — No expiry for abandoned sessions' records in SQLite (a periodic purge by `updated_at` would be the next step).

## Docs / presentation (filled by the polish pass)
- README quick start must cover: `api/.env` from `api/.env.example`, demo mode vs live mode, `npm install` (Tailwind/shadcn stack), `web/THIRD_PARTY_NOTICES.md`,
  Tailwind v4 browser floor, the screenshot walk, the demo script (`docs/ORALCOMPASS_DESIGN_SPEC.md` §11) and the judging-criteria map (`docs/JUDGING_CRITERIA.md`).
