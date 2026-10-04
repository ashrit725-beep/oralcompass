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

## Docs / presentation (filled by the polish pass)
- README quick start must cover: `api/.env` from `api/.env.example`, demo mode vs live mode, `npm install` (Tailwind/shadcn stack), `web/THIRD_PARTY_NOTICES.md`,
  Tailwind v4 browser floor, the screenshot walk, the demo script (`docs/ORALCOMPASS_DESIGN_SPEC.md` §11) and the judging-criteria map (`docs/JUDGING_CRITERIA.md`).
