---
description: M1 — make the 90-second "pull the thread" demo run end to end on the Harborview fixture (phone + laptop)
---
Build milestone M1 from docs/CODELINC_DENTAL_PRODUCT_SPEC.md §6/§7 using the existing scaffold (do not restart from scratch).

Target: `cd api && ORALCOMPASS_DEV_AUTH=1 uvicorn app.main:app --port 8000` + `cd web && npm run dev` shows:
1. The Page (fixtures/documents/harborview_certificate.pdf) rendered with everything dimmed except the stitched sentences, each with a `HB26 ⓝ` chip
   (PageView.tsx already does dim-and-highlight via text match; verify every HB26 stitch lands on its sentence; fix `locate()` if a quote spans lines).
2. The receipt Ledger for Sam's estimate: crown $625 (deductible $50 + your 50% share $375 + $200 allowed-vs-alternate difference; $200 network adjustment not owed)
   and composite $40; totals $640 / $560 — exactly `engine/tests/test_fixture.py`.
3. Tap a Ledger stitch → the Page scrolls to the sentence and it gets the selected outline; the Clause card opens at depth 1; depths 2 and 3 work;
   Esc/close restores the previous scroll position in both panes. Tap a Page stitch → the same card with "Show in Ledger" (add the button: outline the Ledger row).
4. Scenario controls in the app bar: In-network/Out-of-network → $640 / $940; "Remaining deductible entered" off → range $640–$665 with the cause sentence.
   Add the premolar scenario (tooth 4) as a third control → $540 / $660.
5. Phone layout (360 px): draggable divider works with pointer and Alt+↑/↓; desktop ≥1024 px: Page left, Ledger right.
6. Reduced motion: no smooth scroll/pulse; end states identical. Keyboard: Tab reaches every stitch; Enter selects; Esc closes the card.
Acceptance: run `python3 tools/advice_lint.py web/src/lib/copy.ts` (0 violations), `npm run build`, both pytest suites; then record a 90-second screen capture.
Do not add chat, insurer integrations, or any sentence that tells the user what to do.
