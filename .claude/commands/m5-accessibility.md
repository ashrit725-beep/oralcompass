---
description: M5 — accessibility pass: keyboard model, live region, contrast, Rule Table parity, reduced motion
---
Build milestone M5 (spec §3.7, §4.6).

1. Keyboard model: Tab moves between stitches in page order (Page) and between rows (Ledger); Enter pulls the thread; keys 1/2/3 set the depth in an
   open Clause card; Esc closes the card and restores focus to the stitch that opened it. In comparison, Tab moves across a row before moving down.
2. Live region: announce recalculations ("Scenario updated: estimated patient payment $965, changed because HB26 ⑫") and comparison column states
   ("Delta Dental column: unresolved — four inputs not provided"). Keep announcements factual.
3. Rule Table: a `/rules` view listing Rule · Plain English · Applies when · Effect in this scenario · Source (document, page) · Evidence, with a Plan column in
   comparison mode; printable; every acceptance check must be passable from the table alone.
4. Contrast audit (≥ 4.5:1 for text on paper and dark backgrounds, including badges and chips); 44 px touch targets; focus rings visible on both themes.
5. Reduced motion: verify no smooth scroll, no pulse, no fade; end states identical. Screen-reader labels on stitches include the scope and page.
Acceptance: keyboard-only run of the 90-second demo and the comparison beat; axe-core (or equivalent) reports 0 critical issues; record results in `docs/ACCEPTANCE_LOG.md`.
