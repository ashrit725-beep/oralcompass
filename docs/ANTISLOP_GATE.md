# Anti-slop delivery gate: OralCompass web (build/journey-v2 @ e5c24bc)

Review date: 2026-10-04. Lens: anti-slop delivery gate (master prompt §14, §25 to §34, §45, §48; component plan §4; spec §1.3).
Verdict: **FAIL, do not ship as is.** 30 items fail (listed in §5 with the file to change and the redesign). The painted Passage is a real
identity; the failures are the chrome around it: em dashes in visible copy, a phone journey that opens with 930 px of text and a sheet over
the heading, clipped content hidden by an overflow guard, label collisions on the map, a Compare page titled with a disclaimer, and computed
totals wearing a "From the plan document" badge.

## 1. Inputs and method

- Skills loaded with the Skill tool (all 14 requested exist, none skipped): antislop, antislop-ui, antislop-layoutmobile,
  antislop-copywriting, antislop-code, antislop-human, anti-ai-slop, anti-ui-slop, taste-skill, gpt-tasteskill, senlin-taste-skill,
  redesign-skill, impeccable, make-interfaces-feel-better. Also loaded per orchestrator note 10: frontend-design. Read directly per note 8:
  `~/.claude/skills/mobile-app-ui-design/SKILL.md`.
  Not applied: gpt-tasteskill's "huge section padding, GSAP everywhere, hover scale-105, picsum imagery" and senlin-taste-skill's URL
  scraping pipeline are landing-page/URL tools that conflict with CLAUDE.md and component plan §4 (one motion engine, no GSAP, no stock
  imagery); taste-skill §13 itself declares dashboards and data tables out of scope. Their transferable checks (no meta labels, no
  em dashes, no duplicate intents, copy self-audit) were applied.
- Screenshots: `shots/merge/` (00:07, the newest full walk, closest to HEAD e5c24bc; same file names as the integrator's
  `shots/integration/`, plus `desktop-29-treatment-plan-reader.png`). Every PNG was opened; tall captures were cropped into viewport pieces.
- Live DOM verification (my own servers, now stopped): API in demo mode on :8012 with a fresh data dir, `vite preview` of the current
  `web/dist` (built 00:18, after the last `web/src` commit) on :4178; Playwright probes at 1366×900 and 360×780 (reduced motion).
  Probe numbers are quoted as "live:" below.
- Code read: `web/src/styles.css`, `web/src/styles/*.css`, the components under `web/src/components` named in each finding, `web/src/lib/copy*.ts`.

## 2. Design read and dials

Reading this as: an Operate-mode benefits tool for a patient who is anxious about money, in a hand-painted sea-chart language on parchment,
dial ENERGY 2 / RHYTHM 2 / MOTION 2 (one orchestrated route draw; everything else answers a click).

The brief pins the direction (spec §1, §5; addendum): painted atlas, parchment/ink tokens, Iowan/Palatino serif display with a system sans
body, tabular numerals, gold reserved for number to clause. frontend-design lists "cream background, serif display, terracotta accent" as an
AI cluster; here it is the owner's written brief, so it is identity, not slop (the brief wins). The painting, the dashed route, the parchment
lozenges and the evidence stitches are the identity motif; the gate checks whether every other surface earns its place next to them.

## 3. Per-screen answers

| Screen (evidence) | Looks generated? | Repetitive sections / cards overused? | Decorative gradients / generic motion? | Typography | Whitespace | Every element supports the concept? | Could be 100 other SaaS products? | Numbers crispest, on parchment not painting? |
|---|---|---|---|---|---|---|---|---|
| My journey, desktop (`desktop-01-journey.png`, `desktop-11-passage.png`) | No for the plate; yes for the header (paragraph + 5-row log + 3 pills + 2 full-width selects) | Care timeline: 4 identical cards, each with its own "Show on the chart" link; 5th card hidden (live: rail 1152 px in 870 px) | GradualBlur horizon and scroll parallax on the fog (`OceanLayers.tsx:19-31`); page seam at y = 900 | Serif heading runs 2 lines with an em dash | Map starts at y = 564 and ends at 1086 on a 900 px screen (live); right column filled by an auto-opened stage panel | Soundings collide with labels and markers; visited chips truncate | No, the plate is unmistakable | On parchment, yes; but sounding amounts are 12 px (live) |
| My journey, phone (`mobile-01-journey.png`, `mobile-11-passage.png`) | Yes above the fold | Every checkpoint row repeats a right-aligned badge row under it | None | Heading 4 lines | 930 px of header before the passage (live: head 189 → passage 1119) | 150 px header crop shows open water only, no islands or route | Below the fold no; above the fold yes | Amounts in "Completed on your statement" clipped to "$45.0" |
| Drawer (`desktop-12-drawer.png`, `desktop-21/22/25-*.png`, `mobile-12-drawer.png`) | Partly | Allowance is cards inside the drawer card; badges after every value | None | Good hierarchy in sections; header overcrowded | Allowance below the fold at 1366×900 (heading at y = 845) | Harbor crumbs "Harbor Light · Harbor Light"; fog says "You pay —", "Not provided", "Waiting for information" | No | Hero $510.00 is crisp; badges wrap to 2 and 3 lines in the Harbor table |
| Pipeline (`desktop-13-pipeline.png`) | No | Equation rows fine | Beam `repeat={1}` plays twice (`CostPipeline.tsx:105`) | Good | Track wider than the 440 px drawer (live: nodes past the right edge); equation badges clipped ("From the plan d") | Yes | No | Yes, but clipped |
| My plan + compass (`desktop-05-plan.png`, `desktop-19-compass.png`, `mobile-05-plan.png`) | The atlas does: flat vector hills plus one pasted painted lighthouse | Compass quads are fine | Atlas sky gradient + sun glow | Plan-source segment set in serif (controls are sans in spec §5.2) | 450 px dead column right of the content at 1366 | Atlas does not match the Passage art; "Add a procedure" reads as an orphan heading | The atlas, yes | Compass $162.00 crisp; selects truncate labels |
| Compare (`desktop-09-compare.png`, `desktop-20-compare-clause.png`, `mobile-09-compare.png`) | Yes | Every row repeated as italic prose; flags duplicated; gold left-stripe callouts ×4 | None | Page H1 is a disclaimer | Table cut mid-row by a nested 628 px scroll box holding 2366 px (live) | No | Yes | Figures crisp, but the table is clipped |
| Documents + upload review (`desktop-10-documents.png`, `desktop-15-upload-review.png`, `desktop-26-published.png`, `mobile-10/15-*.png`) | Yes | 60 clause rows flat (6565 px desktop, 15894 px phone), duplicate quotes, gold-striped reminders | None | Developer field paths in captions | Upload stepper is four unlabeled dots | Field paths ("catalog eligibility cite") and "retrieved Not stated in this document" | Yes | Yes |
| Assistant (`desktop-16-assistant.png`, `mobile-16-assistant.png`) | The composer is a generic chat box | Pill suggestions wrap to 2 lines | Breathing compass glyph only while working (allowed) | Fine | Fine | "7 lookups in 0.0s" timer artifact | Mostly yes | n/a |

Identity without the logo: **PASS** on My journey (desktop and phone below the fold) and the drawer; **FAIL** on Compare, Documents and the
My plan atlas, which read as a cream-themed admin panel.

## 4. Delivery Gate (antislop core), PASS/FAIL with evidence

### Block 1: Hard Gate

| Rule | Result | Evidence |
|---|---|---|
| R-02 em dash | **FAIL** (slop-1, slop-2) | Ribbon "Sample journey — fictional person and records" and journey H2 (`desktop-01-journey.png`); Compare H1 (`desktop-09-compare.png`); "— no adjustment" (`desktop-13-pipeline.png`); "You pay —" (`desktop-25-fog-drawer.png`); "Deductible — individual" (`mobile-09-compare.png`) |
| R-03 mobile | **FAIL** (slop-3, slop-4, slop-5, slop-20) | Clipped amounts and select (`mobile-01-journey.png`, `mobile-10-documents.png`; live: 12 nodes end at x = 363, documents select at x = 712, hidden by `.view { overflow-x: hidden }`); "(1)" escapes the plan-source segment (`mobile-05-plan.png`); 12 px gutter |
| R-17 / R-36 / R-38 numbers and claims | **FAIL** (slop-14) | Computed totals badged "From the plan document" (`desktop-12-drawer.png` $510.00, `desktop-22-harbor-drawer.png` $902.00, `desktop-05-plan.png` $162.00 with only the ML26 stitch) |
| R-18 testimonials, R-28 FAQ | PASS | None exist |
| R-23 assets | PASS | Art is owner-generated (`web/public/art/LICENSE.md`); sample person labeled fictional on every view |
| R-24 navigation | PASS | Four tabs, four real views |
| R-25 contrast | PASS | Spec §5.1 computed ratios; no text on the painting (all labels on parchment lozenges) |
| R-26 controls | **FAIL** (slop-22) | "Add a procedure" disclosure shows no affordance (live: `summary` is `display:flex`, marker removed) |
| R-27 states | PASS | Fog/unresolved, empty journey, upload error alert, assistant error line all present (`desktop-17-fog.png`, `desktop-25-fog-drawer.png`) |
| R-32 keyboard | PASS | 137/137 walk checks include Escape order and focus return; focus ring tokens in every component |
| R-33 patch scripts | PASS | No script rewrites `web/src` (the scratchpad patch helpers are outside the repo) |
| R-34 themes | PASS | One light theme, no toggle shipped (spec §5.1) |
| R-35 verify | PASS for this report | Live probes above; the walk's checks.json is 137/137 |
| R-37 direction | PASS | Spec + addendum |

### Block 2: Purpose-Gate

| Rule | Result | Evidence |
|---|---|---|
| R-01 gradients | **FAIL** (slop-8) | Viewport-sized body radial gradients leave a seam at y = 900 (`desktop-01-journey.png`, right column; live: body 900 px, document 1461 px) |
| R-04 icons | PASS | Custom RuleGlyph set tied to the six rules; lucide limited to X, Compass, Upload, Check, ChevronDown |
| R-06 type | PASS | Written reason in spec §5.2; no uppercase tracked labels except `.pw-eyebrow` ("PLAIN WORDS", `desktop-16-assistant.png`, minor, folded into slop-25) |
| R-07 background | PASS | Seigaiha waves are the sea motif |
| R-08 arrows, R-09 badges | PASS for arrows; badges are functional evidence statuses, but their weight fails slop-15 |
| R-10 glass | **FAIL** (slop-26) | GradualBlur backdrop-filter over the LCP painting; component plan allows it, spec §5.5 / addendum B1 and the delight plan (mo-07b) remove it |
| R-12 shadow, R-13 glow | PASS | Shadows only on the plate, the drawer and lozenges; no glow |
| R-14 cards | **FAIL** (slop-27, slop-12) | Identical care cards; duplicated callout cards in Compare |
| R-19 motion | **FAIL** (slop-26) | Scroll parallax on the fog layer (`OceanLayers.tsx:19-20`), which spec §5.5 forbids |
| R-22 illustration | **FAIL** (slop-21, slop-28) | My plan flat vector atlas; phone header crop of empty water |
| Colored left stripe (antislop-ui, anti-ai-slop P0) | **FAIL** (slop-13) | `.flag`, `.rm-item`, `.up-note`, `.up-quote`, `.as-mode`, `.wording`, `.tpr-ribbon` (`desktop-09-compare.png`, `desktop-10-documents.png`, `desktop-06-lighthouse.png`) |

### Block 3: Liveliness

| Check | Result | Evidence |
|---|---|---|
| Dials declared | PASS | §2 |
| Output matches dials | **FAIL** | MOTION 2 claims one orchestrated moment; the code adds scroll parallax and a twice-playing beam (slop-26, slop-19) |
| One focal point per screen | **FAIL** on Compare (the disclaimer is the H1) and Documents (no focal point in a 6565 px list); PASS on journey (plate), drawer (hero), plan (compass answer) |
| Structural whitespace | **FAIL** | 450 px dead column on My plan (`desktop-05-plan.png`); 930 px header on phone journey |
| One deliberate accent | **FAIL** | Gold is spec-reserved for number to clause, but it also paints every callout stripe, the reminders rule, the ribbon and the upload notes |
| Identity motif | PASS | Painted archipelago, dashed route, parchment lozenges, stitches |

### Block 4: Craftsmanship and quality locks

| Check | Result | Evidence |
|---|---|---|
| C-1 intentionality | **FAIL** | Plan atlas style, card-in-card Allowance, pill suggestions are defaults, not choices |
| C-2 function | **FAIL** (slop-22) | Disclosure without affordance |
| C-3 content-driven | **FAIL** (slop-9, slop-11, slop-23, slop-29) | Disclaimer repeated 4 to 5 times per Compare screen; prose rows restating each cell; 60-row clause dump; duplicate progress note |
| C-4 resilience | **FAIL** (slop-5, slop-10, slop-19) | Clipping at 360 px; nested scroll clip; pipeline overflow |
| C-5 evidence | **FAIL** (slop-14) | Computed totals labeled as document facts |
| R-05 template layout | PASS | No hero/feature-grid template |
| R-11 radius | PASS with note | Scale `--r-1..4`, but assistant suggestions and RubberSegment use pill radius on 2-line text (slop-25) |
| R-15 CTAs, R-16 buzzwords | PASS | Specific verbs ("Record this checkpoint", "Confirm all verified quotes"); advice_lint 0 violations |
| R-20 identity | **FAIL** on Compare, Documents, plan atlas | §3 |
| R-21 dark mode | PASS | Daylight painting, decision recorded in spec §5.1 |
| R-29 palette | PASS | Tokens only |
| R-30 clone | PASS | |
| R-31 reasons | PASS | Spec §5 and component headers record reasons |

### Skill checklists (summary of what each raised)

- antislop-copywriting: em dashes (slop-1/2), developer jargon and broken "retrieved Not stated" (slop-23), triple restatement in the fog
  drawer (slop-17), duplicated crumbs (slop-18), repeated disclaimers (slop-9, slop-29).
- antislop-layoutmobile: slop-3, slop-4, slop-5, slop-20, slop-30 (top tab row out of thumb reach; owner request 7).
- antislop-ui / anti-ui-slop / anti-ai-slop: left stripes (slop-13), card-in-card and identical cards (slop-16, slop-27), generic chat
  composer and pills (slop-25), unlabeled stepper (slop-24), glass and parallax (slop-26).
- antislop-human: clipped text is lost information (slop-5); contrast and focus pass.
- antislop-code: no FAIL. Comments are long but carry constraints; no banners, emoji or step narration found in the files read.
- taste-skill / redesign-skill / impeccable (critique): the plan atlas (slop-21), the dead right column, the Compare H1, the scrolling table
  inside a scrolling page (slop-10), the Documents dump (slop-23).
- make-interfaces-feel-better: badge wrapping and orphan separators (slop-15, slop-16); disclosure affordance (slop-22); timer artifact
  (slop-25).
- frontend-design: brief-pinned direction kept; "one memorable thing" is the plate, so the header, atlas and compare chrome must go quiet.

## 5. FAILs with the redesign (ids match the returned findings)

| Id | Sev | Screen / evidence | File to change | Redesign |
|---|---|---|---|---|
| slop-1 | high | Ribbon, Compare H1, trail notes, DetailPanel rows (`desktop-01`, `desktop-09`, `desktop-13`, `desktop-25`) | `web/src/lib/copy.ts:54,55,62,65`; `web/src/lib/trail.ts:56,60`; `web/src/components/CostTrail.tsx:80,86,90,121`; `web/src/components/DetailPanel.tsx:47,54,59,69`; `web/src/components/pipeline/CostPipeline.tsx:30` | Replace each em dash with a colon, period or parentheses ("Sample journey: fictional person and records"; "Listed here means the document is public, not that you are eligible to enroll."). Update the screenshot check string in `tools/screenshots.py`. Add an em-dash rule to `tools/advice_lint.py` so it cannot return. |
| slop-2 | high | Journey label, plan option labels, compare topic (`desktop-01`, `desktop-05`, `mobile-09`) | `fixtures/journeys/sample_alex.json:3`; `fixtures/plans/*.json` labels; `api/app/templates.py:3,45`; `api/app/records.py:173`; `engine/oralcompass_engine/comparison.py:10,45` | Same replacement in authored labels ("Sample journey: Alex Chen (fictional), NCFlex Dental Classic Option 2026"; "Deductible (individual)"). Keep source document titles verbatim. `api/app/treatment_reader.py:155,162` split labels on " — ": switch them to the new separator in the same change. |
| slop-3 | high | Phone journey: 930 px of header before the passage (`mobile-01-journey.png`; live) | `web/src/views/JourneyView.tsx:126-136` | Phone order: one-line H2 (balanced), progress as "6 of 13 checkpoints completed" plus a "What completion means" disclosure, Answers log collapsed to two lines (Estimated you pay, Where you are) with "All answers" disclosure, one 44 px three-segment control, and the journey picker plus "Add another journey" inside a "Journeys" disclosure. Target: passage top ≤ 420 px at 360×780. Keep the select's accessible names ("Journey", "Add a journey"). |
| slop-4 | high | Stage panel auto-opens at load: phone sheet covers the heading, desktop map shrinks (`mobile-01-journey.png`, `desktop-01-journey.png`; live: sheet and panel present at load) | `web/src/hooks/useJourneySelection.ts:16` | Load with no selection. On desktop show the ChartKey column (delight plan mo-04: whole-plan strip, legend, two reading lines) so the map rect never changes; mark the current stage on the care rail instead of opening it. |
| slop-5 | high | Phone clipping hidden by the overflow guard: "$45.0", documents select, URLs (`mobile-01-journey.png`, `mobile-10-documents.png`; live: 12 nodes end at 363 px, select at 712 px) | `web/src/styles.css:291,305` (with `web/src/styles/journey.css:229`, `web/src/components/DocumentsView.tsx`) | Remove `.view { overflow-x: hidden }` and fix the offenders: `.pv-mini` amount column `auto` with the title `minmax(0,1fr)`; documents `.plan-pick select { width: 100% }` at < 761 px; URLs `overflow-wrap: anywhere`. Phone gutter 16 px (`.view { padding: 16px }`). Assert `scrollWidth === 360` with no guard. |
| slop-6 | high | Desktop first viewport: passage at y 564 to 1086; Answers log ellipses (`desktop-01-journey.png`; live: 3 truncated log links) | `web/src/styles/journey.css:26`; `web/src/views/JourneyView.tsx:126-136` | Delight plan mo-05: progress note one line plus disclosure, journey picker (420 px) and a ghost "Add another journey" button in one 44 px row, log `dd` wraps to 2 lines (no ellipsis), H2 without the em dash. Target `#passage-map` top ≤ 340 and bottom ≤ 900 at 1366×900. |
| slop-7 | high | Soundings collide with the crown label ($672.00 cut to "$672.0") and the root-canal "You pay" marker; titles and visited chips truncate (`desktop-01`, `desktop-12`; live: overlaps 44×41 and 15×57 px; 7 truncated titles) | `web/src/lib/passage.ts:509-519` | Measure the real lozenge (three rows with the badge ≈ 58 px, not `hit` = 44), include checkpoint marker rects in `controls`, try x offsets along the leg as well as y, and never fall back to `candidates[0]` on a collision (drop to the inline sounding under the label instead). Visited chips become one "Earlier visits (4)" chip; island titles 2-line clamp at 150 px with `text-wrap: balance`. |
| slop-8 | medium | Page seam at y = 900 (`desktop-01-journey.png`, `desktop-12-drawer.png`; live: body 900 px vs document 1461 px) | `web/src/styles.css:68-71` | Move the radial washes to `body::before { position: fixed; inset: 0; z-index: -1; pointer-events: none }` and use `min-height: 100%` on `#root` (delight plan mo-20a). |
| slop-9 | high | Compare H1 is the disclaimer, repeated again in each of three column headers (`desktop-09-compare.png`) | `web/src/components/CompareView.tsx:61` (and `ComparisonGrid.tsx:48`) | H1 names the job: "Compare plans for the same estimate". The availability sentence appears once as a caption under the plan pickers; column headers keep eligibility text only. |
| slop-10 | high | Table cut mid-row inside a 628 px scroll box holding 2366 px; next heading butts against the cut (`desktop-09-compare.png`, `mobile-09-compare.png`; live) | `web/src/components/ComparisonGrid.tsx:35` | Drop `max-h-[70dvh]`: let the table flow with the page, sticky first column and sticky header row inside a horizontal-only `scroll-fade-x` container. |
| slop-11 | medium | Italic "differences" row restates every cell after every row (`desktop-09-compare.png`) | `web/src/components/ComparisonGrid.tsx:66` | Render the differences sentence as the row's `<caption>`/`aria-describedby` text only, or show it only where cells differ in kind (follow-up 11); badge any figure it prints. |
| slop-12 | medium | MetLife estimate card lists each flag twice (`desktop-09-compare.png`; live: 4 flags, 2 unique) | `web/src/components/ComparisonGrid.tsx:89` | De-duplicate (`[...new Set(L.flags)]`) and print one "Not found in the pages read: waiting period, alternate benefit" line. |
| slop-13 | medium | Gold left-stripe callouts as decoration (`desktop-09`, `desktop-10`, `desktop-06`) | `web/src/styles.css:107` (`.flag`), `web/src/styles/upload.css:14,71,112`, `web/src/styles/assistant.css:9`, `web/src/styles/reader.css:40` | Keep stripes only where they encode state (upload and reader confidence rows). Flags become a line led by the map's own dashed fog glyph on a parchment tint; reminders become a dated ledger (date column left, sentence right, hairline between rows); notes lose the rule. Gold returns to number to clause only. |
| slop-14 | high | Computed totals badged "From the plan document" (`desktop-12`, `desktop-22`, `desktop-05`) | `web/src/components/drawer/sections/FinalCostSection.tsx:24,28`; `web/src/components/drawer/ProcedureDrawer.tsx:164-165`; `web/src/components/drawer/sections/HarborSections.tsx:28,32`; `web/src/components/compass/BenefitsCompass.tsx:70` | Keep the six statuses. Under each computed total print "Calculated from the steps below" followed by the steps' own stitches (ML26 clause chips) and a "You entered" badge for the USER inputs, instead of a single DOC badge (orchestrator note 1). |
| slop-15 | medium | Badges outweigh numbers: 3-line badge stacks in the Harbor table, clipped "From the pla" on phone, badge rows under every phone checkpoint; sounding amounts 12 px (`desktop-22`, `mobile-22`, `mobile-01`; live: `.sounding .amt` 12 px) | `web/src/styles.css:214` (`.badge`); `web/src/styles/journey.css:125`; `web/src/components/drawer/sections/HarborSections.tsx` | Badge becomes 12 px glyph + word, no border, ink-soft, `white-space: nowrap`, placed on the caption line under the figure in table cells and phone rows (still one badge per figure). Figures: 600 weight; soundings 15 px (spec numeric role), phone rows 16 px. |
| slop-16 | medium | Drawer header: lede wraps "· plan $510.00" to line 2, two stitch chips, 6 chips in 2 to 3 rows, remaining strip as a box with an orphan "·"; Allowance at y = 845 (`desktop-12-drawer.png`, `mobile-12-drawer.png`) | `web/src/components/drawer/ProcedureDrawer.tsx:161-180`; `web/src/components/compass/BenefitsCompass.tsx:47-49` | Lede as a two-column `dl` (You pay / Plan pays) on one line; checkpoint strip as one row of six 44 px glyph buttons with the selected term under it; remaining strip as an unboxed caption line without separators; Procedure and Allowance visible at 1366×900 (orchestrator note 4). |
| slop-17 | medium | Fog: "You pay —" then "Not provided" then "Waiting for information" (`desktop-25-fog-drawer.png`) | `web/src/components/drawer/sections/shared.tsx:74`; `web/src/components/Money.tsx:35` | Print "Waiting for information" once as the value (italic, ink-soft) with the UNKNOWN badge; never render "—" as a value. |
| slop-18 | low | Crumbs "Harbor Light · Harbor Light" (`desktop-22-harbor-drawer.png`, `mobile-22-harbor-drawer.png`) | `web/src/lib/copy/drawer.ts:13` | When place equals title, print "End of the route · Compass Rest" (the destination's subtitle) instead. |
| slop-19 | medium | Pipeline track wider than the drawer; equation badges clipped; beam plays twice (`desktop-13-pipeline.png`; live: `.pipeline-track` nodes past the drawer edge) | `web/src/styles/drawer.css:99-101`; `web/src/components/pipeline/CostPipeline.tsx:105` | Vertical ledger in the 440 px column (delight plan mo-10): fee → allowed → deductible → plan share → you pay, one row each, one sweep (`repeat={0}`). Equation rows wrap the badge to the caption line. |
| slop-20 | medium | Plan selects truncate ("Classic Optio", "Metropolitan Life Insur"); plan-source segment set in serif; "(1)" escapes the segment on phone (`desktop-05-plan.png`, `mobile-05-plan.png`; live: 189 px selects for 45 to 60 character labels) | `web/src/styles/plan.css:10,12,20,25`; `web/src/components/plan/PlanSelector.tsx:44-45` | Carrier and plan-name selects on one full-width row, year narrow (`grid-template-columns: 1fr 1fr 8rem`), plan select full width above; carrier short names in options; segment in the sans face; count as a separate badge that may wrap. Keep `label.plan-pick select` values unchanged. |
| slop-21 | medium | My plan atlas: flat vector hills, sun glow and one pasted painted lighthouse; 450 px dead column at 1366 (`desktop-05-plan.png`) | `web/src/components/atlas/PlanAtlas.tsx` (and `web/src/views/PlanView.tsx` layout) | Use a crop of the painted backdrop (coast and lighthouse region) with the five landmarks as parchment lozenges, 300 px tall, and set the compass beside it at ≥ 1200 px (atlas 7 columns, compass 5) so the right column carries the answer. If the flat atlas is kept, record the reason here; today none is written (orchestrator note 6). |
| slop-22 | low | "Add a procedure" has no disclosure affordance (`desktop-05-plan.png`, `mobile-05-plan.png`; live: `summary` `display:flex`) | `web/src/styles/plan.css:114` | Add a chevron glyph that rotates on open and a sub-line "Type it, paste it or read a photo"; or keep `display: list-item`. |
| slop-23 | medium | Documents: 60 flat clause rows, duplicate quotes, developer field paths ("catalog eligibility cite", "unsupported rules"), "retrieved Not stated in this document", leading "· dated" (`desktop-10-documents.png`, `mobile-15-upload-review.png`) | `web/src/components/DocumentsView.tsx:89,112` | Group clauses by plan section (Costs, Coverage, Limits, Eligibility) with counts, collapsed except the section a stitch opened; one row per distinct quote listing every field it supports, labeled in plain words through a copy map; omit missing parts instead of printing "Not stated" mid-sentence. |
| slop-24 | medium | Upload wizard: four unlabeled dots (names only in `aria-label`), full-width yellow banner bars, heading outside the card padding, 3 stacked pill buttons per row (`desktop-15-upload-review.png`, `desktop-26-published.png`) | `web/src/components/upload/UploadWizardBody.tsx:82`; `web/src/styles/upload.css` | Visible stage names under the dots (Choose a file · Redaction · Extraction · Review and publish); banners as inline ribbons sized to their text; the three decisions as one segmented control per row; heading aligned to the card padding. |
| slop-25 | low | Assistant: "7 lookups in 0.0s"; two-line pill suggestions; uppercase "PLAIN WORDS" eyebrow (`desktop-16-assistant.png`, `mobile-16-assistant.png`) | `web/src/components/assistant/AskAboutStep.tsx:115-133`; `web/src/styles/reader.css:85` | Hide elapsed time under 0.1 s (or drop it); suggestions as a ruled list of text buttons with `--r-2` radius; eyebrow in sentence-case italic serif like the other kickers. |
| slop-26 | medium | Scroll parallax on the fog and GradualBlur glass over the painting | `web/src/components/atlas/OceanLayers.tsx:19-31` | Remove `useScroll`/`useTransform` and the GradualBlur call site; keep the static paper tint (delight plan mo-08/mo-07b). |
| slop-27 | medium | Care rail: 5th card hidden past the edge, 4 identical cards with 4 "Show on the chart" links (`desktop-01-journey.png`; live: 1152 px in 870 px) | `web/src/styles/journey.css:153-155`; `web/src/components/journey/CareTimeline.tsx:62` | Five equal columns (min 160 px) at ≥ 1366, otherwise `scroll-fade-x` with snap; the current stage gets the gold border and the only "Show on the chart" action, the others link from the title. |
| slop-28 | low | Phone header is a 150 px crop of open water, no islands or route (`mobile-01-journey.png`) | `web/src/styles/journey.css:179` | Crop to the start harbor and first island (`background-position`), with the dashed route starting under it so the vertical passage continues the painting; or remove it. |
| slop-29 | low | Progress disclaimer printed in the journey head and again in the stage panel (`desktop-01-journey.png`) | `web/src/components/DetailPanel.tsx:42` | Print it once, in the head's "What completion means" disclosure. |
| slop-30 | medium | Phone nav is a top tab row, out of thumb reach; owner request 7 (Eldora dock) not built (all `mobile-*.png`) | `web/src/App.tsx:45-52` | Implement orchestrator note 7: move the existing TabsList into a bottom dock on < 768 px (solid `--paper-deep`, hairline top rule, safe-area padding, 44 px items with Compass/Anchor/FileText/custom two-column glyph and visible labels, no magnification on touch, hidden while the procedure sheet is open). |

## 6. Kept on purpose (passes, with the reason)

- Parchment palette, Iowan serif display and system sans body: owner's brief (spec §5.1, §5.2).
- Evidence badge beside every figure: CLAUDE.md rule 2; only its weight changes (slop-15).
- RubberSegment "1 Plain words · 2 Your numbers · 3 Exact wording": a real depth sequence, so numbering is information.
- Route draw on first load and the 18 s route march: the one orchestrated moment; off under reduced motion.
- My plan atlas kept as the simpler side-view coast (slop-21, orchestrator note 6; fix pass 2026-10-04). The five landmarks are drawn
  forms (bridge, cove, lookout, lighthouse, harbor) on a side-view coastline; the only painted plate that would fit, `journey-backdrop`,
  is a top-down sea chart with none of those forms, so cropping it would leave the landmarks floating on open water. The dead third of
  the page is gone instead: with no landmark open the detail column is not reserved and, from 1200 px, the atlas and the Benefits compass
  share the width in two halves (`styles/plan.css`, `.plan-layout.is-solo`). A painted side-view coast plate is a follow-up for the art set.

## 7. Eldora UI portfolio repo: rejected components (orchestrator note 7)

Only `dock.tsx` + `navbar.tsx` fit (as the phone bottom tab bar, slop-30). Rejected: `blur-fade-text` (per-character blur entrance, banned
by component plan §4.3), `project-card`, `contributions-card`, `tweet`, `sandpack`, `mdx` (portfolio-specific), and `avatar`, `badge`,
`button`, `card`, `separator`, `tooltip` (duplicates of the installed shadcn primitives).
