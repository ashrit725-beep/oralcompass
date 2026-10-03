---
description: M2b — preset catalog (GET-only, searchable) and the three-plan comparison grid with scoped stitches and per-plan ledgers
---
Build milestone M2b (spec §3.8–3.10, §4.7, §5.10, checks 7–12). The API already serves `GET /presets`, `GET /presets/{code}`, `POST /comparisons`
and rejects writes with 405; `web/src/components/ComparisonGrid.tsx` renders the grid and the three ledgers.

1. Catalog screen: search by carrier / plan name / state / plan year; result cards show carrier, exact plan name + option, plan year, where offered,
   eligibility (quoted), source document title/date, verification date, and the `Fictional demonstration plan` ribbon for HB26. Fixed banner:
   "Listed here means the document is public — not that you are eligible to enroll."
2. Comparison grid, phone: topic-first rows, one expanded at a time, three stacked plan cards in the user's order; a plan switcher above the Page pane.
   Desktop: real `<table>` with `<th>` row/column headers; equal column widths; no sort control; no color on totals; Differences sentence under each row.
3. Scoped stitches: when ≥2 plans are loaded, render the scope tag prominently on every chip (`prominent` prop); build stitches per plan with
   `buildStitches(plan)`; the paired Clause card shows one excerpt pane per plan (plan name, scoped stitch, badge) under one depth dial; a plan whose
   document is silent shows "Not stated in this document" in its pane.
4. Per-plan inputs panels above each Ledger (network, allowed amounts, enrollment date, usage), each starting at UNKNOWN; **no copy/transfer control**;
   label "Entered for this plan only". Delta with nothing entered must read "Unresolved — not provided: …"; with the hypotheticals from
   `engine/tests/test_fixture.py` it must read "at least $685 / at most $815" with the alternate-allowance flag; 6-month enrollment → "not covered, $1,500".
5. Premium row per plan for the selected enrollment category (employee only; Harborview $31.00 from the rate sheet; DD24/ML26 "not stated"); combined figure
   only per plan and only when both parts exist, with the period stated.
6. Check 7 automation: extend `tools/verify_citations.py` to iterate the comparison grid cells (via the API) and assert each cell's cite resolves to the
   right plan's document; add it to `/run-checks`.
Acceptance: checks 7–12 in `docs/ACCEPTANCE_LOG.md`; linter 0 violations on all Differences sentences (`api/app/lint_runtime.guard` already runs on them).
