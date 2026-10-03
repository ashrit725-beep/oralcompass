# OralCompass — UI guide and art direction

*Your care journey. Your coverage. Clearly mapped.* OralCompass is a hand-painted atlas: islands for the stages of a dental journey,
five landmarks on one coast for the parts of a plan, and a cost trail from the dentist's fee to what you pay. The painting is the
mood; the HTML is the product. This guide is the brief for anyone (including Claude Code) who touches `web/`.

## 1. The bar
A judge opens the app on a phone and on a laptop and, within ten seconds, says "that is beautiful" — and within thirty seconds can say
exactly where a number came from. Both halves are required. Beauty that hides evidence fails; evidence without beauty is table stakes.

Quality checklist (all must hold before a commit touches `web/`):
1. `npm run build` (type-check + bundle) passes; `python3 ../tools/advice_lint.py src/lib/copy.ts` reports 0 violations.
2. `python3 tools/screenshots.py <dir>` passes every check on desktop (1366×900) and phone (360×780, reduced motion).
3. No horizontal scroll at 360 px (`document.documentElement.scrollWidth === 360`).
4. Every interactive element is a real `<button>`, `<a>`, `<select>`, `<input>` with a visible focus ring and an accessible name.
5. Every painted scene has a text equivalent (Overview list, landmark list, engine receipt table).
6. Every figure wears an evidence badge (icon + word) and, when document-supported, a scoped stitch chip (`ML26 ⑫`).
7. Motion is subtle (≤ 10 px, ≤ 500 ms for UI; slow drifts for scenery) and fully disabled under `prefers-reduced-motion`.
8. No patient information in decorative labels; island and landmark names are fixed place names.
9. Copy states facts; it never advises (the linter enforces the word list; the reader enforces the spirit).

## 2. Art direction — "a watercolor atlas, lit like a film still"
- **Medium**: watercolor and gouache on warm paper. Soft wobbly coastlines (SVG `feTurbulence` + `feDisplacementMap`), bleeding washes
  (`feGaussianBlur`), visible paper grain (multiply blend, opacity ≈ .2), a gentle vignette so the eye settles in the middle of the scene.
- **Light**: one warm sun wash top-right; mist on the horizon; distant hills lighter and bluer than near ones (atmospheric perspective).
- **Palette** (tokens in `src/styles.css` `:root`): paper `#f6f0e3`, parchment `#e9dcc0`, ink `#23303d`, water `#7fa9a6` / light `#a9c7c3`,
  sage `#9db08a`, forest `#5f7a52`, sand `#e3cf9f`, gold `#c59a3c`, terracotta `#b86a4b`, wood `#8a6a45`, sky `#e9e2cf`, hills `#b9c2b3` / `#8fa78a`.
  Never add a saturated blue or neon accent. Status colors are always paired with a glyph (✓ ● ○ ?).
- **Type**: serif headings (Iowan Old Style / Palatino stack), humanist sans body, tabular numerals for every amount (`.num`, `.amt`, `.total`).
  Numbers are the sharpest thing on the page: dark ink on light paper, never on the painting itself.
- **Composition**: the painting is a wide-screen plate (`viewBox` 1000×600 / 1000×520), horizon at ≈ 1/3, islands below it along an S-curve
  whose positions are computed from the stage count (`lib/journey.ts`), never stored in data. Controls float on parchment cards with a soft
  shadow; cards never cover another island's checkpoints.
- **Cinema**: views rise in on a 10 px wash (`rise`), maps wash in from blur (`washin`), the route marches slowly, ripples and clouds drift over
  minutes, the lighthouse beam sweeps ±6°. Nothing bounces, nothing loops faster than 2 s. Reduced motion: every animation off, every end state intact.
- **Phone**: the journey becomes a vertical coast (stacked islands on a dashed shoreline); the plan map becomes a short painted header + a landmark
  list; details open in a bottom sheet (72 vh, grab handle, close button). Side panels on ≥ 760 px.

## 3. Information architecture
Navigation: **My journey · My plan · Compare · Documents** (top bar; fixed order).

| View | Painted scene | Real controls | Detail surface |
|---|---|---|---|
| My journey | islands = stages (Starting point, Before your visit, Your appointment, Recovery, Follow-up — count/order from the journey data), dotted route, "you are here" pin, checkpoint markers on a short path per island | one button per island (name + "n of m checkpoints completed"), one button per checkpoint (status glyph, accessible name includes attribution) | DetailPanel: island → purpose, progress, dates with source, procedures (fee vs allowed amount, both labeled), dental-team instructions verbatim + source, checkpoints; checkpoint → status pill, attribution, explanation, date (with who gave it), source, linked document / procedures / amounts, actions (record with attribution; enter date; add instructions; open landmark), next-checkpoint navigation with the "does not record anything" note |
| My plan | one coast with five landmarks: Your plan (harbor), Deductible (bridge), Coverage (cove), Annual maximum (lookout), Cost breakdown (lighthouse) | landmark buttons with the familiar term first and the live summary (e.g. "$25.00") | LandmarkContent with the depth dial (plain words / your numbers / exact wording) and, at the lighthouse, the CostTrail |
| Compare | — | three plan pickers in the user's order; the grid; per-plan rails | eligibility banner under every column; nothing transfers |
| Documents | pdf.js Page with dim-and-highlight stitches when the PDF is stored; otherwise clause list with page reference + official link | plan picker, clause filter, source inventory (expandable), privacy controls | ClauseCard (depth dial; "Open in Documents") |

## 4. The cost trail (signature)
Fixed order: **Dentist's fee → Allowed amount → (Alternate benefit) → Deductible → Plan share → Annual maximum adjustment → You pay**.
Each step shows amount in, the rule, the change, amount out, a one-sentence explanation and the clause stitch with its quote and page.
The trail is rebuilt from the engine's ledger steps (`lib/trail.ts`); the engine remains the truth and the receipt table is one click away.
"Amounts reconcile" is computed, not asserted. Exclusions, waiting periods and frequency limits replace the middle of the trail with one
"Not covered" step that cites the clause. Unresolved lines show the missing inputs with where each comes from.

## 5. Product states (each must look designed, not broken)
new user (no documents) · labeled sample journey (ribbon) · processing (spinner + "Reading your records…") · plan with missing details ("Not stated
in this document" badges) · estimate waiting for information (missing-input list with how-to) · checkpoint with no date ("No date recorded") ·
multiple procedures (line tabs on the trail) · completed and revisited checkpoints (still selectable; attribution shown; undo available) ·
errors with retry (banner + "Try again").

## 6. Evidence and attribution vocabulary
Badges: From the plan document 📄 · You entered ✎ · Hypothetical you entered ~ · Ambiguous in the document ? · Not provided ∅ · Sources disagree ⇄.
Attribution: "Marked by you" vs "Confirmed by your dental team · date". Dates always carry their source. Instructions are only ever the dental
team's own words with a source line; the app never writes instructions. Progress language is always "n of m checkpoints completed" and the
note "Completion describes recorded activity… not a statement about treatment or healing" stays visible.

## 7. Files
`src/lib/copy.ts` (all copy, linted) · `src/lib/journey.ts` (layout from data, progress, attribution) · `src/lib/trail.ts` (cost trail) ·
`src/lib/stitches.ts` (numbered clause stitches from the API evidence list) · `src/components/atlas/{Paper,JourneyMap,PlanAtlas}.tsx` (paint) ·
`src/components/{DetailPanel,LandmarkContent,CostTrail,OverviewList,DocumentsView,CompareView,ClauseCard,ComparisonGrid,PageView,Primitives}.tsx` ·
`src/App.tsx` (state, navigation, data loading) · `src/styles.css` (tokens, components, phone rules) · `tools/screenshots.py` (verification walk).

## 8. Ideas with headroom (in priority order for `/ui-cinematic`)
1. Day-to-dusk palette shift by local time (two token sets; keep contrast ≥ 4.5:1 in both).
2. Painted procedure icons on the trail (tooth, crown, root) drawn as small gouache marks — no stock icons, no emoji.
3. A "pull the thread" micro-interaction: when a stitch chip is pressed, a thin gold thread draws from the chip to the clause (SVG line, 300 ms).
4. Island weather: awaiting-information islands sit under a light mist; completed islands get a warm highlight.
5. Parallax on the map (two scenery layers moving 2–4 px with pointer or scroll), off under reduced motion.
6. Printable "map of my plan" (CSS print stylesheet: paper white, no animations, stitches as footnotes).
