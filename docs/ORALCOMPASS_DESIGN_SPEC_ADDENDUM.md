# OralCompass design spec — addendum (binding, 2026-10-03)

`docs/ORALCOMPASS_DESIGN_SPEC.md` was synthesized from the ranked proposal titles, the master prompt and the codebase; the judges' written
concerns and grafts below were recorded by the design panel and are reproduced verbatim here. **Where the spec and a concern below
conflict, the concern wins.** Grafts are to be applied where the spec does not already contain them. Build agents read this file
immediately after the spec.

## A. Owner decisions on the synthesizer's open questions

1. Art files are `.webp` (plus `emblem.png`, `favicon.ico`, `icons/*.png`); `ArtPlate` requests `<name>.webp`, then `.png`, then the SVG fallback. No PNG re-export.
2. The engine stays unchanged; `treatment_item_id` and `procedure_key` are added to saved-estimate ledger lines by `api/app/records.py`.
3. Hand entry for fields the extractor could not find is **in scope**: the review table's `Edit` (USER, with a required source) and `Not in document` (UNKNOWN) decisions cover it; no separate form.
4. Dark mode / dusk palette is out of scope for this release.
5. The 'you are here' pin is static and lives on the Care timeline rail.
6. The advice linter runs on copy files (`web/src/lib/copy.ts`, `api/app/templates.py`, `api/app/assistant_templates.py`, `api/app/assistant_glossary.py`, reminder templates), not on specs.
7. The owner wants the component ecosystem used broadly (Tailwind v4 + shadcn infrastructure bridged to the existing tokens; components from the libraries in `docs/ORALCOMPASS_COMPONENT_PLAN.md`); the spec's 'two new dependencies only' sentence is superseded by that plan. Anti-slop rules still apply in full.
8. Live AI calls go through OpenRouter (`anthropic/claude-haiku-4.5` by default) with server-side quote verification; demo mode works with no key.

## B1. Judge lens: patient (comprehension and trust)

**Scores (total / comprehension · trust · differentiation · restraint · feasibility · info-only):**
- Soundings: the sounding-chart journey: 47 / 6 · 8 · 9 · 8 · 7 · 9
- Stitched Passage: the receipt you can sail: 48 / 8 · 9 · 8 · 7 · 7 · 9
- SOUNDINGS: the chart that measures as you sail: 46 / 8 · 8 · 8 · 6 · 7 · 9

**Best:** Stitched Passage: the receipt you can sail

**Concerns (must be applied):**
- Ring crowding breaks 44 px targets: with r = 78 and up to 8 checkpoints the under-island sub-route (~198 px at 878 px width) yields ~28 px pitch. Fix before build: lengthen the sub-route (span 3.6r+ or route rings along the inter-island leg as well), cap visible rings per island by collapsing pass-through steps into one marker (P1 graft), and verify with a Playwright bounding-box overlap check on Alex and sample_sam.
- Mobile screenshot parity: the phone run clicks `button[aria-label^='Before your visit']` and `Appointment information recorded` straight after load. Either the default mobile view keeps shoreline stage buttons reachable (e.g., a compact stage strip above the island cards) or screenshots.py is deliberately extended to switch the segment first; the proposal currently claims parity it does not have.
- PlanSelector must keep a single `label.plan-pick select` whose option values are plan codes; the carrier → plan → year selects can sit beside it, but `select_option('FM26H')` must still work and the FM26H → fog → ML26 beat must survive.
- Drop the blur 4→0 island entrance and the pointer-driven fog parallax; both are motion-skill anti-patterns and the filter work is expensive on low-end phones. Reserve the 1400 ms route-draw for first load and plan change only; estimate recomputation (hypothetical, corrected input) should use the 480 ms number-reflow alone so cause reads before effect.
- Destination must be the journey's last stage as the data defines it (Alex: Follow-up / Compass Rest), not 'the last stage with finance.kind none'; do not rename stages, and keep the Lighthouse plate as the frame around that stage.
- The ten-section drawer must collapse sections 5–8 and 10 by default on the phone sheet and keep section 2 (You pay) above the fold; otherwise the sheet fails the five-second test it wins on the card.
- Negative terracotta pills (−$170.00 'not owed by you') must never read as the patient's cost: use the sand hatch and the words 'not owed by you' for owner nobody, and reserve terracotta strictly for owner patient and the you-pay buoy, as the proposal's own colour rule states.
- Hero and totals: specify explicitly that every hero, ribbon tick and pill shows '—' plus 'Waiting for information' whenever line.status or ledger.status is unresolved (patient_cents is null), including the compass planned segment, so nothing renders as $0.00 by formatting a null.
- Hash routes (#island, #cp) must be parsed only on My journey and only after the estimate has loaded, and browser Back must pop checkpoint → island → map without reopening a stale selection after a plan switch.
- Keep `.total` with '$902.00', 'Amounts reconcile', 'waiting period: not found' and the ML26 `.ts-clause` reachable on the My plan lighthouse via the unchanged CostTrail; the drawer's ReceiptRail is additive, not a replacement.
- Run tools/advice_lint.py on every new copy group (CHECKPOINT, VOYAGE, REVIEW, ASSISTANT) and on assistant_templates.py in CI; the proposal's suggested chip 'How much would I pay if the remaining maximum were $400.00?' is fine as a hypothetical but the answer template must carry the ASSUMED badge on every figure.
- Quote verification must never promote to Confirmed without an exact text-layer match; scanned PDFs yield Not found with an honest message, and the review table footer must say extraction can return paraphrases that are rejected.

**Grafts (apply where the spec lacks them):**
- From SOUNDINGS (P3): the ledger ribbon under the chart showing cumulative you-pay and line.remaining_after.annual_max_cents draining island by island ('$1,260 → $672 → $162 remaining'), display-only and shown only when the running sum equals ledger.patient_total_cents.
- From SOUNDINGS (P3): fixed checkpoint slots in trail order so every island's ring set has the same silhouette; absent or zero-change rules render as pass-through markers rather than disappearing, so the second island needs no explanation.
- From SOUNDINGS (P3): title the Benefits Compass with the question it answers from fields ('How much of the $1,500.00 maximum remains after the planned work? $162.00') but keep Stitched Passage's bullet bars, not a dial.
- From SOUNDINGS (P3): keep a single `label.plan-pick select` of plan codes as the fast path beside any richer PlanSelector so keyboard users and screenshots.py keep working.
- From SOUNDINGS (P3): add `line.treatment_item_id` in records.py (one line) alongside P2's LedgerLine.ref, and fog the island with 'could not match this estimate line to a record' when the label assertion fails rather than mis-attributing money.
- From SOUNDINGS (P3): the loading checklist copy bound to real promises ('Reading plan ML26 · Reading your records · Matching 2 procedures to the plan's rules · Drawing your chart') and the error state that keeps the last good chart dimmed instead of a blank map.
- From SOUNDINGS (P3): on mobile, between island cards, show the up-to-three non-zero TrailStep changes as small signed rows so the leg reads without opening the sheet.
- From Soundings (P1): when a channel cannot hold its markers at the minimum spacing, collapse zero-change steps into one hollow 'passed' marker whose tooltip and drawer list every collapsed step by name, so no step is ever silently dropped.
- From Soundings (P1): buoy aria-labels that carry the whole fact ('Deductible: no change, amount out $980.00, clause ML26 page 25') so a screen-reader user gets the five-second read per checkpoint.
- From Soundings (P1): checkpoints with links.treatment_items offer 'Show on the chart' to select the matching procedure island; visited islands cap at 3 and collapse into 'Earlier visits (n)'.
- From Soundings (P1): extend tools/screenshots.py with a DOM diff asserting reduced-motion end states equal full-motion end states, a 360 px scrollWidth check, and a keyboard arrow walk across islands.
- From Soundings (P1): z-order tokens (chart 0, controls 10, drawer 20, clause card 30, sheet 40, tooltip 50) and an Escape order test (clause card closes first, then drawer).

## B2. Judge lens: taste (differentiation and restraint)

**Scores (total / comprehension · trust · differentiation · restraint · feasibility · info-only):**
- Soundings: the sounding-chart journey: 49 / 7 · 9 · 9 · 8 · 7 · 9
- Stitched Passage: the receipt you can sail: 52 / 8 · 10 · 8 · 9 · 7 · 10
- SOUNDINGS: the chart that measures as you sail: 49 / 9 · 9 · 8 · 6 · 8 · 9

**Best:** Stitched Passage: the receipt you can sail

**Concerns (must be applied):**
- Density must be proven before geometry is final: coast band with five stage buttons and revealed checkpoints, plus islands with up to eight 28 px rings and amount pills under them, in an 878 px plate. Build the layout math first and screenshot it with a multi-line fixture (sample_sam or a 5-line synthetic) at 1366 px; if pills collide, adopt P3's fixed slots and pass-through rings and collapse zero-change rings before touching art.
- route-draw at 1400 ms is triggered on 'estimate loaded or changed'. Its own frequency gate says estimate changes get 480 ms. Restrict the 1400 ms draw to first load and plan switch; hypotheticals and corrected inputs retarget rings and pills in 480 ms with no redraw.
- Drop the pointer parallax on fog-layer-2. It has no written UX purpose (R-19) and is the one 'because it was possible' gesture in the proposal.
- The 'You pay' hero in the serif at 2.2rem with font-variant-numeric: tabular-nums will jitter during number-reflow if Iowan Old Style or Palatino lack tnum. Verify, or set the counting figure in the sans (P1's dataviz choice) and record the departure in the UI guide.
- ExtractionReview pre-checks 'Accept' on Confirmed rows. Fixed decision 8 says the user confirms. Replace pre-checked boxes with an explicit 'Confirm all verified quotes' action so no extracted value enters the engine without a user gesture.
- Pill colour rule needs one more sentence: terracotta on 'negative-change pills' must apply only when the step owner is patient. The allowed-amount reef is a negative change with owner nobody and must stay ink with the 'not owed by you' wording, or the map will paint the in-network write-off as money the patient owes.
- Scope for the first build: ship one assistant placement (drawer section 9) before the ClauseCard footer and fog-card entries; defer the hypothetical form and TreatmentItemForm to a second pass unless the empty-treatment state is in the demo path. The engine LedgerLine.ref field stays (one line, with index fallback and a fixture test).
- Em dashes: the existing ribbon copy ('Sample journey — fictional person and records') and other current strings carry em dashes. The proposal commits to none in new strings; the /copy-style sweep must run in the same pass or the Delivery Gate fails on R-02 regardless of the new work.
- Mobile three-segment control 'Map view · Care stages · Overview list' must keep those exact button names (screenshots.py clicks 'Map view' and 'Overview list') and each segment must stay at or above 44 px tall and legible at 328 px of content width.
- Add the legend row to the mobile vertical model too; the mini-receipt rows reuse the ring and glyph vocabulary and currently only the desktop map carries the legend.
- The Benefits Compass vanishes from the right column the moment an island is selected. Keep the one-line strip ('Deductible remaining $0.00 · Annual maximum remaining $1,260.00') at the top of the drawer so the whole-plan numbers are never off screen while a line is open.

**Grafts (apply where the spec lacks them):**
- From SOUNDINGS (P3): the ledger ribbon under the map, one tick per island showing cumulative you-pay and remaining_after.annual_max_cents draining leg by leg, with the display sum shown only when it equals ledger.patient_total_cents. This is the clearest whole-journey causality in any proposal and Stitched Passage lacks it.
- From SOUNDINGS (P3): fixed checkpoint slots so every island's sub-route has the same silhouette; absent or zero-change rules draw as pass-through rings at the same slot rather than being omitted, so the second island needs no explanation.
- From SOUNDINGS (P3): the honest degrade rule for dense estimates (more than six lines: rings leave the map, legs become plain, the drawer and list stay complete, and a note under the legend says so) instead of only widening a pannable viewBox.
- From SOUNDINGS (P3): dedupe treatment items with status completed against benefits.claims so a visit is one islet, and show unmatched completed items with 'amount paid by the plan not provided'.
- From SOUNDINGS (P3): the assistant answer card lists the tool calls made ('read: ledger line 1, clause ML26#p25') and the count of sentences removed by the information-only guard. Cheap, and it is a trust feature a judge can be shown.
- From SOUNDINGS (P3): the compass headline is the question it answers, filled from fields ('How much of the $1,500.00 maximum remains after the planned work? $162.00').
- From Soundings (P1): keyboard-initiated selection snaps the camera (no viewBox tween) while pointer selection animates; and project(x,y) for the HTML overlay is driven from the same motion value in one requestAnimationFrame subscriber so buttons never drift from the paint.
- From Soundings (P1): z-order tokens (map 0, controls 10, drawer 15, clause card 20, sheet 30, tooltip 40) and a tested Escape order (clause card first, then drawer).
- From Soundings (P1): screenshots.py checks that the reduced-motion end-state DOM equals the full-motion end-state DOM, plus the 360 px scrollWidth check and a keyboard arrow walk.
- From Soundings (P1): semantic owner tokens (--owner-patient, --owner-plan, --owner-nobody, --owner-basis, --fog) so components never read paint names.
- From Soundings (P1): a single grouped native select (optgroup per insurer, option 'Plan name, Option, Year, Region') is fewer controls than three chained selects and keeps the existing label.plan-pick selector.
- From Soundings (P1): the Fog lift sequence (fog .7 to 0 over 700 ms, then the route draw replays for that leg only) when a missing input is entered and the line resolves.

## B3. Judge lens: engineer (feasibility and compliance)

**Scores (total / comprehension · trust · differentiation · restraint · feasibility · info-only):**
- Soundings: the sounding-chart journey: 48 / 7 · 9 · 9 · 8 · 6 · 9
- Stitched Passage: the receipt you can sail: 46 / 7 · 9 · 8 · 8 · 5 · 9
- SOUNDINGS: the chart that measures as you sail: 46 / 8 · 8 · 9 · 7 · 5 · 9

**Best:** Soundings: the sounding-chart journey

**Concerns (must be applied):**
- Scope versus two agent-days: build in this order and stop where the time runs out: chart.ts + SoundingChart + ProcedureDrawer + CostPipeline + CareRail + CoastVertical + BenefitsCompass + PlanSelector (grouped select) + screenshots.py extension; demo-mode assistant templates only; FixtureExtractor-only upload with the review table reading existing review_status; the OpenRouter extractor, quote verification and live assistant are a third day and must not block the chart.
- Uploaded plans cannot drive the records estimate today: records.estimate_from_records, put_benefits and derived_benefits index PLANS[code] and 404 otherwise; resolve_plan handles 'upload:<id>' only for legacy /estimates. Either wire resolve_plan into the records path (and a per-upload benefits record) or mark 'upload:<id>' as not selectable for estimates in this iteration.
- Stage ↔ island cross-links must bridge seed ids: stage.linked_treatment_items and view.links.treatment_items are keyed by seed_id ('ti-a-rct-19') while estimate.inputs.treatment_item_ids carry stored uuids; match items by `item.seed_id ?? item.id`, never by label, and keep lineIndex as the selection key.
- The buoy offset is an encoding without an axis; cap it at the proposed 44 units, keep every zero-change buoy on the line, print the amount on every buoy, keep the legend sentence under the chart, and make the collapse rule collapse only zero-change buoys (never a step with a non-zero change). Verify with Alex's own ledger: the 273-unit approach segment with 7 buoys already breaches the 48-unit minimum.
- tools/screenshots.py parity: the first Enter in the Tab walk that lands on an element named 'Starting point…' must produce a heading named 'Starting point' (give the START drawer that h2, or put the rail's Starting point stage first in Tab order); keep `.total` with '$902.00', `.ts-clause` with 'ML26' and 'waiting period: not found' on the My plan lighthouse; keep `label.plan-pick select`; mobile must keep 'Before your visit' buttons in the default view (CoastVertical + JourneyVertical together, as proposed). Extend the script; do not relax existing checks.
- Reduced motion: CSS duration tokens do not stop motion's animate() on the viewBox MotionValue or number tweens; gate every JS-driven tween with useReducedMotion and set final values synchronously, and add a desktop reduced-motion run to screenshots.py that diffs the DOM against the full-motion end state.
- Hit areas: every buoy and You-pay landing button needs a 44×44 px hit area on desktop as well as mobile (the proposal states it only for rail checkpoints); with buoys ~40 px apart in viewBox units, hit areas will overlap, so offset the hit padding vertically along the sounding line rather than symmetrically.
- ViewBox framing plus HTML overlay: drive the SVG viewBox attribute and project(x,y) from one MotionValue in a single requestAnimationFrame subscriber; disable feTurbulence/feDisplacementMap filters during the tween (or use PNG plates when present) because re-rasterising filters per frame will drop below 60 fps on the 2019-laptop budget.
- Copy and lint: run tools/advice_lint.py on copy.ts and on api/app/assistant templates in CI; the planned CHART/PIPELINE/COMPASS/UPLOAD/ASSISTANT groups must avoid em dashes, and the existing TRAIL explanations with em dashes need the roadmap /copy-style sweep in the same change or the Delivery Gate R-02 fails.
- Hero numeral switch from serif to sans departs from the UI guide; keep the `.total` class and tabular/proportional decision documented in docs/ORALCOMPASS_UI_GUIDE.md, or keep the serif hero and drop the departure.
- Visited islands read claim figures (plan_paid_cents, patient_paid_cents, deductible_applied_cents) typed from a benefit statement; keep them badged USER with the statement date, never pass them to CostPipeline or any total, and say so in their drawer.
- URL state (?island=, ?step=): parse only when tab === 'journey' and only after the estimate has loaded; pushState on select and popstate to deselect must not fight the existing tab state or Vite preview deep links.

**Grafts (apply where the spec lacks them):**
- From SOUNDINGS (P3): fixed buoy slots at constant t positions so every approach channel has the same silhouette; use them as the baseline positions and let P1's signed offset be the only variable, which also fixes P1's collapse-rule problem on Alex's own demo.
- From SOUNDINGS (P3): the ledger ribbon under the water line reading remaining_after.annual_max_cents per island ($1,260 → $672 → $162) and a display-only cumulative you-pay shown only when it equals ledger.patient_total_cents.
- From SOUNDINGS (P3): assert that the rebuilt label (procedure_name + ' (tooth N)') equals line.label and draw the island in fog with 'could not match this estimate line to a record' on mismatch, instead of mis-attributing money.
- From SOUNDINGS (P3): keep `label.plan-pick select` as a fast path beside any grouped selector or dialog, and keep a heading named 'Starting point' reachable from the first Enter on the chart so tools/screenshots.py's keyboard check survives.
- From SOUNDINGS (P3): the compass card titled by the question it answers ('How much of the $1,500.00 maximum remains after the planned work? $162.00'), implemented on P1's bullet-bar meters rather than arcs.
- From Stitched Passage (P2): the 'How was this calculated?' equation rows formatted only from Step.cents and remaining_after ('$980.00 × 60% = $588.00 plan share'), each row ending with its stitch chip, with the reconciliation line printed only when trail.reconciles.
- From Stitched Passage (P2): the optional treatment-item reference on each ledger line (LedgerLine.ref / line.treatment_item_id set in records.lines_from_items; default None; existing tests unchanged) with index fallback.
- From Stitched Passage (P2): the 'What moves these numbers' section with the movers table and a hypothetical form that re-POSTs /me/estimates with hypotheticals, every affected row wearing the ASSUMED badge; P1 names the re-sound motion but not the control that triggers it.
- From Stitched Passage (P2): the screenshots.py assertion count('.amt') ≤ count('.badge, .stitch') inside the drawer, and a 'Care stages for this procedure' row listing stages whose linked_treatment_items include the item (bridged through seed_id).
- From Stitched Passage (P2): the extraction-review decision model (Confirmed rows pre-checked, Needs-review rows disabled until a candidate is chosen, Not-found rows only accept 'Enter from another document' with a required source) and the 'Text in the document that was not used as a rule' block for injected instructions.
- From Stitched Passage (P2): badge icons as inline SVG glyphs instead of emoji, keeping the words.

## C. Art plates as delivered (repainted 2026-10-03; binding notes for the map agents)

All plates are WebP under `web/public/art/` (`ArtPlate` requests `.webp` → `.png` → SVG fallback). Observed facts the layout must respect:

1. `journey-backdrop.webp` (2400×1350, opaque): a wide open sea fills the centre; painted coastlines, coves and small islets occupy the margins
   (top-left, top-right, bottom-left, bottom-right); **a compass rose is painted at the bottom-left corner**. Therefore: suppress the SVG `Compass`
   ornament whenever the backdrop plate has loaded (keep it only in the SVG fallback); keep START, islands, soundings and the Harbor Light inside the
   open-water region (roughly the central 70 % width × 65 % height of the plate); never place HTML text directly on the painting (parchment lozenges
   and cards only). The water is a saturated impasto teal, darker than `--water`; cards and numbers stay on parchment/ink so contrast is unaffected.
2. `island-generic.webp` (flat green island, sand rim, no water halo, transparent background) composites directly onto the sea.
3. `island-major.webp` (mountain with a golden zigzag path, **painted water and surf around its base**) and `island-lighthouse.webp` (lighthouse at
   golden hour, harbour and surf painted in) carry their own water: composite them at a slightly larger scale than the generic plate (≈ 3.4r wide) and
   let the painted surf meet the sea; do not clip them to an ellipse. The golden path on the major plate reads as "the route" — align the route's
   entry point to the plate's lower-left shore where the path begins.
4. `benefits-chest.webp`: a walnut navigator's chest with an inlaid compass dial; use at ≤ 96 px in the START drawer and the Benefits compass; never as
   a decorative background.
5. `paper-texture.webp`: ivory parchment brushwork tile; use at opacity ≤ .18 multiply on parchment surfaces; it is not seamless-guaranteed, so apply
   `background-size` ≥ 600 px and a soft-light blend rather than a visible repeat.
6. `fog-layer-1/2.webp` and `emblem.png` are unchanged from the first set.
7. Page weight: backdrop 565 KB + three islands ≈ 1.6 MB + fog 480 KB; lazy-load fog, chest and paper; the backdrop is the LCP image (`fetchpriority="high"`).

## D. Owner decisions on AI scope and production (2026-10-03, 22:05) — binding

1. **Do not deploy yet.** Build everything deployment-ready (single container serving the API under `/api` and the built web app at `/`, Dockerfile,
   Railway config, health check, production env template, `docs/DEPLOY.md`, a local production smoke test) and stop before any publish step.
2. **Live AI with limits** on the eventual public deployment: the OpenRouter key (Claude Haiku 4.5) is used for document extraction, the treatment-plan
   reader, the clause explainer and the assistant, guarded by per-visitor rate limits and a global daily cap (requests and estimated spend, env-configurable);
   when a limit is hit the app falls back to demo/template behaviour and says so honestly. The key lives only in server env; never in the bundle or logs.
3. **SQLite on a persistent volume**: an owner-scoped `SqliteRepo` with the same interface as `InMemoryRepo` (constant 404, ids-only audit), selected by
   `ORALCOMPASS_STORE=sqlite` + `ORALCOMPASS_DB_PATH`; uploaded PDFs under `ORALCOMPASS_DATA_DIR` on the same volume. In-memory stays the default for tests.
4. **Private per-visitor sessions replace the shared dev user** in production: the server issues an opaque random session id in a signed, HttpOnly,
   Secure, SameSite=Lax cookie (secret from `ORALCOMPASS_SESSION_SECRET`); every owner-scoped read keys on it; "Delete all my data" clears it. The
   `X-Dev-User` header remains for tests/local dev only (`ORALCOMPASS_DEV_AUTH=1`). No account system is built (judging criterion 7: describe, don't build).
5. **"Full AI product" scope additions**: (a) an AI treatment-plan reader (paste the dentist's estimate text or upload a photo/PDF → the model extracts line
   items; procedures map ONLY to the 16 fixed keys via `fixtures/procedure_codes.json` candidates and descriptor text, ambiguous ones offer choices; fees, teeth
   and codes are kept as written; the user reviews and confirms before any treatment item is created; demo mode uses stored fixture estimates);
   (b) an AI clause explainer for depth 1 of the clause card and drawer sections (one plain sentence ≤ 25 words per clause, grounded on the quote, runtime-linted,
   cached per clause; demo mode uses the existing PLAIN templates). AI never produces amounts; the engine remains the only source of money.
