# OralCompass — binding design specification (v1, 2026-10-03)

**Status: binding.** This document is the single specification for the next build. It is built on the highest-ranked design proposal,
*Stitched Passage: the receipt you can sail* (146), with the ideas worth keeping grafted from *Soundings: the sounding-chart journey* (144)
and *SOUNDINGS: the chart that measures as you sail* (141). Where this spec and an older doc disagree, this spec wins; where it and
`CLAUDE.md` or `docs/MASTER_BUILD_PROMPT_V2.md` disagree, the stricter rule wins.

Three build agents implement this in parallel (§13): **api/**, **web foundation + map**, **web upload-review + assistant**. Every
section is written so that none of them has to ask a question. If a sentence here is ambiguous, the engine's existing behaviour and the
information-only rule decide.

Skills applied while writing (cited inline as `[skill]`): `antislop` (Mode 1, DURING; Design Read and dials in §1.3), `anti-ui-slop`
(operate playbook: the product's own objects, routes and clauses are the UI, not a template), `design-motion-principles` (Emil primary,
Jakub secondary; frequency gate; keyboard-initiated actions never animate), `motion` (Motion for React rules: `MotionConfig
reducedMotion="user"`, `AnimatePresence` kept mounted, `layoutId` for the nav indicator, transform/opacity only, springs without
overshoot), `interfaces-that-feel` (copy voice by felt state), `dataviz` (gauges as stat tiles: one hue, thin marks, text in ink, table
equivalent), `ui-ux-pro-max` (44 px targets, 8 px gaps, exit shorter than enter, interruptible, sheet rises from its trigger).
`antislop-ui` was not loaded separately; the `antislop` core covers its rules.

---

## 1. Product thesis and the four tests

### 1.1 Thesis

OralCompass answers one question: *"Which parts of my dental plan touch this procedure, and how did those rules produce this estimated
cost?"* The answer is drawn as a passage across a painted sea. **Each planned procedure is an island. The route between the islands is
the engine's ledger: every checkpoint on the route is one ledger step, and every checkpoint is stitched with a gold thread to the exact
clause (document label, page, quote) that produced it.** Sailing the route from the START harbor to the Harbor Light is reading the
receipt from the dentist's fee to "you pay". The *soundings* printed on the chart after each island are the engine's `remaining_after`
figures: how much deductible and annual maximum is left in the water once that island has been passed.

The metaphor is the information architecture, not a skin: no island, checkpoint, sounding or thread exists without a field in an API
payload behind it (§3). Remove the painting and the same objects remain as an HTML list (§9).

Three things make it OralCompass and nothing else:
1. **The stitched passage.** Ledger steps as checkpoints on a route, each tied to a clause. (From *Stitched Passage*.)
2. **Soundings.** Running `remaining_after` figures printed along the route, and the dollar pipeline whose numbers visibly re-measure
   when an input changes. (Grafted from both *Soundings* proposals.)
3. **Fog and closed channels.** Unresolved lines are islands in fog with their named missing inputs; not-covered lines are a single
   closed checkpoint citing the clause. Uncertainty is painted, never hidden.

### 1.2 The four tests, as acceptance statements

Each view must pass all four before it ships. The screenshot walk (§12) encodes them.

| Test | Acceptance statement |
|---|---|
| **Comprehension** | Within five seconds of the map appearing, a first-time viewer can say how many procedures are planned, what each is estimated to cost them, and where they are in their care. Measured: the Answers log (§2.4) is the first text block after the heading; every island button carries procedure name + you-pay amount; the current care stage is named once in the log. |
| **Trust** | Every number on screen wears an evidence badge, and every document-backed number wears a stitch chip whose press opens the quote with its page. No `$` figure appears that was not returned by the engine or typed by the user. Measured: `tools/screenshots.py` counts `.amt`/`.num`/`.total` elements lacking a sibling badge or stitch inside the drawer and fails above zero. |
| **Differentiation** | With the logo and product name removed, the screen is still identifiable as OralCompass: a painted route with checkpoint markers and gold stitch threads on parchment. Measured by the anti-slop audit (§1.3): "Could this screen belong to 100 other SaaS products?" must be answered no for My journey, My plan and the procedure drawer. |
| **Restraint** | Nothing exists because a library offered it. Every animation names its cause (§5.5); every card, badge and gradient has a one-line reason recorded in §5.7. Two new dependencies only (`motion`, `@radix-ui/react-dialog`). No particles, no bounce, no heading that fades up, nothing looping under 2 s. |

### 1.3 Design Read and dials `[antislop]`

> Reading this as: a consumer healthcare / insurance explainer for patients (and hackathon judges), in a painted-atlas language with
> fintech-grade numbers, dial **ENERGY 2 / RHYTHM 2 / MOTION 2**.

- ENERGY 2: the painting says hello; the numbers stay quiet, crisp and dark on light paper.
- RHYTHM 2: My journey (map + log + rail), My plan (coast + landmark card), Compare (grid), Documents (page + list) are four distinct
  compositions; sections inside the drawer vary between prose, key-value lists, a pipeline and a quote.
- MOTION 2: transitions on cause (selection, data change, navigation); ambient drift on scenery only; no scroll choreography.
- Identity motif: **the stitch** (square scope tag + circled number, and the gold thread drawn from a number to its clause). It appears
  on the map, in the drawer, in the pipeline, in Documents and in Compare.
- One accent: gold (`--gold`) for completed/evidence; terracotta (`--terracotta`) is the selection and "you pay" ink, never decoration.
- One focal point per screen: My journey → the selected island (or the route when nothing is selected); My plan → the selected landmark
  card; drawer → the Final cost section's you-pay figure.

The anti-slop Delivery Gate (antislop Blocks 1–4) is run by the web agents before handoff and recorded in `docs/ANTISLOP_GATE.md`
(PASS/FAIL per item with evidence). Known carve-outs recorded now: the four navigation buttons are pill-shaped (fixed decision 5,
existing design system); the clause quote uses a left gold rule because it is a quotation mark, not a stripe.

---

## 2. Information architecture

### 2.1 Navigation (final)

Top bar, fixed order, labels unchanged: **My journey · My plan · Compare · Documents**. No migration note is needed. The active tab's
parchment background moves between buttons with a Motion `layoutId="nav-indicator"` (200 ms, `--ease-standard`); reduced motion: no
movement. On phones the bar is a 4-segment row directly under the brand line, each segment 25 % wide and 44 px tall; the tagline is
hidden under 400 px.

### 2.2 What each view contains

| View | Painted scene | Real controls (HTML) | Detail surface |
|---|---|---|---|
| **My journey** | The **Passage**: START harbor → procedure islands along the route with insurance checkpoints → the Harbor Light. Visited islands (completed claims) sit in the wake behind START; marginal islands (consultation-mentioned items) sit off-route in the margin; fog over unresolved islands. | Answers log (§2.4), plan picker, journey picker, one `<button>` per island (procedure name · tooth · you pay), one `<button>` per checkpoint (term · amount), "Add a procedure", the Care timeline rail (§2.3), view toggle **Route · Care timeline · Overview list** | **Procedure drawer** (desktop: right column 440 px; phone: bottom sheet) for islands and checkpoints; the existing **DetailPanel** for care stages and care checkpoints (unchanged semantics) |
| **My plan** | One coast with five landmarks (unchanged): Your plan (harbor), Deductible (bridge), Coverage (cove), Annual maximum (lookout), Cost breakdown (lighthouse) | Plan picker with **Preset / Upload** mode switch (§7), landmark buttons with live summaries | `LandmarkContent` with the depth dial; the **Benefits compass** at the harbor (§4.6); `CostTrail` at the lighthouse; the upload review table when an uploaded plan is selected |
| **Compare** | none | three pickers in the user's order; grid; rails | eligibility banner under every column; nothing transfers (unchanged) |
| **Documents** | pdf.js page with stitches when the PDF is stored; otherwise the clause list with page references and the official link | plan picker, clause filter, "Your documents" with upload entry point and extraction status, sources, privacy controls | `ClauseCard` (depth dial), review table link |

### 2.3 Where the care stages live

The five care stages (`journey.stages`: Starting point, Before your visit, Your appointment, Recovery, Follow-up; count and order from
the data) keep every semantic they have today and live in three places:

1. **The Care timeline rail** (`components/journey/CareTimeline.tsx`): a horizontal rail under the map on desktop (one card per stage,
   `n of m checkpoints completed`, its checkpoints as a row of glyph buttons) and the second segment of the **Route · Care timeline ·
   Overview list** toggle on phones (vertical, the current `JourneyVertical` layout). Each stage button's accessible name starts with
   the stage title (`Before your visit (Lantern Cove): 1 of 3 checkpoints completed`) and each checkpoint button's name starts with its
   label (`Appointment information recorded — Completed, confirmed by your dental team`). Clicking opens the existing `DetailPanel`
   with its forms (**Record this checkpoint**, date source, attribution, undo, instructions "Add as written", next-checkpoint note).
   `tools/screenshots.py`'s current clicks therefore keep working with one change: the test opens the Care timeline segment first on
   phones (on desktop the rail is always visible).
2. **The START harbor** reads the stage whose `finance.kind === "plan_details"` (Alex: `start`) and lists its checkpoints (plan document,
   treatment plan, pre-treatment estimate, benefit statement) in the START drawer as "What this journey is drawn from", each a button
   that opens the same checkpoint in `DetailPanel`.
3. **The Harbor Light** reads the stages after the last stage with linked planned items (Alex: `recovery`, `followup`) and lists them as
   "After the route" with their checkpoint progress; each opens `DetailPanel`.

The "you are here" pin stays on the care rail (current stage from `progress.current_stage`), not on a procedure island: procedures are
not completed by viewing them. The Overview list gains a first table for the islands (§9.3) and keeps the stage tables.

### 2.4 The home screen's five answers: the Answers log

Directly under the journey heading, before the map, a single `<dl class="log">` set in the serif, two rows on desktop, five rows on
phones. It is a log line, not a row of stat tiles: no cards, hairline separators only, tabular numbers. Each `<dd>` is a `<button
class="linklike">` that moves focus to the thing it names.

| # | Question (master prompt §17) | `<dt>` | `<dd>` reads | Focus target |
|---|---|---|---|---|
| 1 | Where am I in my care? | `Where you are` | `progress.stages[current_stage].title` + ` · ` + its `label` (e.g. `Before your visit · 1 of 3 checkpoints completed`); if no journey: `No care stages recorded` | the stage card on the Care rail |
| 2 | What procedures are included? | `On the route` | `${islands.length} procedure${s}` + `, ${visited.length} completed on your statement` when > 0; `No planned procedures` when 0 | first island button |
| 3 | What will each likely cost? | `Estimated you pay` | `money(estimate.user_estimated_payment_cents)` + ` · plan ${money(insurer…)}` (+ ` (upper bound)` when `plan_payment_is_upper_bound`); unresolved: `Waiting for information (${missing_inputs.length} input${s})`; none: `No estimate yet` | the Harbor Light button |
| 4 | Which rules affect those costs? | `Rules applied` | `${stepsWithStitch} step${s} cited` + ` · ${rulesNotStated} rule${s} not stated` where `stepsWithStitch = ledger.lines.flatMap(l => l.steps).filter(s => s.stitch).length` and `rulesNotStated = new Set(estimate.unknowns).size` (the engine repeats the same flag once per line; Alex: waiting period + alternate benefit → 2); e.g. `6 steps cited · 2 rules not stated` | the first island's first checkpoint |
| 5 | Where did the rules come from? | `From` | `${plan.source_document.version_label} · ${plan.source_document.title}` truncated to one line, `title` attribute with the full text; fictional plans append ` · fictional` | Documents tab (sets `tab="documents"`) |

Row 3 must never show `$0.00` for a missing estimate (master prompt §38–40): the unresolved and none branches above are mandatory.

---

## 3. Data → map mapping

All derivations live in `web/src/lib/passage.ts` (pure functions, unit-tested with the Alex and Sam fixtures) and read only the payloads
listed here. The UI never computes a new amount; the only arithmetic allowed in `passage.ts` is the display sum already performed by
`buildTrail` (`lib/trail.ts`), which is reconciled against the engine's `patient_cents`/`plan_cents` and shown with the existing
"Amounts reconcile" / "do not reconcile" sentence.

### 3.1 Inputs

| Payload | Endpoint | Fields read |
|---|---|---|
| `TreatmentItem[]` | `GET /me/treatment-items` | `id, seed_id, procedure_key, procedure_name, tooth, quantity, dentist_fee_cents, allowed_cents, allowed_status, allowed_source, code_as_written, network, appointment_date, planned_prep, planned_completion, status, source` |
| `SavedEstimate` | `POST /me/estimates` (latest for the selected plan) | `status, inputs.treatment_item_ids, inputs.network, inputs.network_status, inputs.benefits_snapshot, ledger.lines[] {label, status, steps[] {label, cents, owner, rule, stitch}, patient_cents, plan_cents, plan_is_upper_bound, flags, remaining_after {deductible_cents, annual_max_cents}, benefit_year, treatment_item_id (new, §13.2)}, ledger.flags, ledger.not_provided, ledger.assumptions, ledger.order_note, ledger.could_change, movers {range, movers[]}, user_estimated_payment_cents, insurer_estimated_payment_cents, plan_payment_is_upper_bound, assumptions, unknowns, missing_inputs[] {input, how, line}, sources.plan_document` |
| `Benefits` | `GET /me/benefits` (for the plan) | `deductible_met_cents, benefits_used_cents, remaining_deductible_cents, remaining_max_cents, annual_max_unlimited, derivation.remaining_deductible, derivation.remaining_max, source {label, date}, coverage_start, claims[] {id, date, procedure_key, tooth, dentist_fee_cents, allowed_cents, plan_paid_cents, patient_paid_cents, deductible_applied_cents, source}, conflict` |
| `JourneyView` | `GET /journeys` | `journey.stages[] {id, title, island, purpose, finance.kind, linked_treatment_items, checkpoints[], instructions, dates}, progress, links.treatment_items, links.latest_estimate, is_sample` |
| `CoverageRule[]` | `GET /plans/{code}/rules` (or `/me/plans/{id}/rules` for uploads) | per `procedure_key`: `covered, category, category_status, category_cite, plan_pays_pct, you_pay_pct, coverage_cite, deductible_applies, deductible_cite, counts_toward_annual_max, annual_max_cite, waiting {months, status, cite, note}, frequency[] {clock, n, cite}, alternate_benefit {status, conditions, cite, note}, exclusion {text, cite}, code_as_printed {code, descriptor, cite, review}, allowed_amount {value, status, note}` |
| `PlanFixture` + `PlanEvidence` | `GET /plans/{code}`, `GET /plans/{code}/evidence` | `deductible_individual, annual_max, classes, oon_rule, alternate_benefit, waiting_months, frequency, excluded, unsupported_rules, conflicts, source_document`; `clauses[]` → `stitchesFromClauses` (existing) |
| `Procedure[]` | `GET /procedures` | `key, name, category_hint, tooth_or_area_relevant, external_codes` (for the Add-a-procedure form and the island vocabulary) |

### 3.2 Islands

```
items          = treatmentItems
plannedIds     = estimate ? estimate.inputs.treatment_item_ids : items.filter(status in {planned, scheduled}).map(id)
routeItems     = plannedIds.map(id → items.find(i.id === id))          // ledger order == route order (§3.6)
visitedItems   = items.filter(status === "completed")  ∪  benefits.claims not matched to a completed item (matched by procedure_key + date)
marginalItems  = items.filter(status === "consultation_mentioned")
cancelled      = items.filter(status === "cancelled") → not drawn; listed in the Overview list only
```

**Procedure island** (`kind: "procedure"`), one per `routeItems[i]`:

| Visual element | Reads |
|---|---|
| Button title | `item.procedure_name ?? procedures[key].name` |
| Button subtitle | `tooth ? "tooth " + tooth : ""` + ` · ` + status word (`planned` / `scheduled`) |
| Button amount | `line.status === "estimate" ? "you pay " + money(line.patient_cents) : line.status === "not_covered" ? "not covered · " + money(line.patient_cents) : "waiting for information"` |
| Place name (small italic, decorative) | §3.7 vocabulary from `procedures[key].category_hint` |
| Plate | `island-major` for category `major`, `major/excluded (varies)`; `island-generic` otherwise (`island-preventive` / `island-reef` when those optional plates exist, §10) |
| State | `line.status` → `estimate` (clear), `unresolved` (fog), `not_covered` (closed channel) ; no estimate yet → `pending` (outline only) |
| Checkpoints | §3.3 from `line.steps` |
| Notices (pennants) | `line.flags` (each shown verbatim in the drawer's relevant section; the pennant count = `line.flags.length`) |
| Soundings after the island | `line.remaining_after.deductible_cents`, `line.remaining_after.annual_max_cents` (`null` → `no maximum applies`) |
| Line matching | `line = ledger.lines.find(l => l.treatment_item_id === item.id) ?? ledger.lines[i]` (index fallback until the API field lands) |

**Visited island** (`kind: "visited"`), one per `visitedItems`, drawn smaller (r × 0.6) in the wake behind START with a "visited" stamp;
no checkpoints; its drawer shows the claim figures as the benefit statement recorded them, every figure `USER`:
`date, procedure_key name, tooth, dentist_fee_cents, allowed_cents, plan_paid_cents, patient_paid_cents, deductible_applied_cents, source`.
Alex: exam, cleaning, bitewing x-rays (2026-03-02), composite tooth 14 (2026-04-14). Nothing is recomputed; the drawer states
"Figures as entered from the benefit statement dated {benefits.source.date}."

**Marginal island** (`kind: "marginal"`), one per `marginalItems`, drawn off-route in the lower margin, no route, dashed outline: the
drawer shows the coverage *rule* only (from `rules[key]`), never an amount: for Alex's night guard under ML26 → `rules.night_guard.covered
=== false` → a single closed checkpoint "Not covered · excluded by the plan" with the exclusion stitch (`ML26 p.26`, "Appliances or
treatment for bruxism (grinding teeth)."), and the sentence `Mentioned at the consultation; not on the treatment plan. No estimate is
calculated for it.` When `rules[key].covered === true` the drawer shows class, plan-pays %, deductible applicability and frequency as
rules only, with the sentence `No fee or allowed amount is recorded, so no estimate is calculated.`

### 3.3 Insurance checkpoints (from `line.steps` via `buildTrail`)

Checkpoints are the `TrailStep[]` of `buildTrail(line)` plus listed fees, in the fixed trail order. Each checkpoint reads:

| Checkpoint | `rule` | Term (HTML) | Place (decorative) | Amount shown on the marker | Source steps | Badge / stitch |
|---|---|---|---|---|---|---|
| Fee | `fee` | Dentist's fee | the quay | `money(amountOut)` | none (fee = `allowed + N.cents` reconciled) | `USER` (item.source) |
| Allowed | `N` | Allowed amount | the reef | `signed(change)` | step `rule === "N"` | stitch from `oon_rule.cite` when present, else `USER` with `item.allowed_source` |
| Alternate | `AB` | Alternate benefit | the point | `signed(change)` | `AB` owner `basis` (and `AB` owner `patient` for the difference) | stitch `alternate_benefit.cite` |
| Deductible | `D` | Deductible | the crossing | `signed(-D.cents)` | `D` | stitch `deductible_individual.cite` (or `_out`) |
| Share | `CO` | Plan share | the strait | `plan {planPct}% · you {100−planPct}%` | `CO` owner `plan_pre` + `CO` owner `patient` | stitch class `plan_share_bp_in.cite` |
| Maximum | `M` | Annual maximum | the gate | `signed(-M.cents)` or `within the maximum` | `M` | stitch `annual_max.cite` |
| Listed | `L` | Listed on your estimate | the ledger | `+money(sum)` | steps `rule === "X"` with label starting `Listed on your estimate` | `USER` |
| You pay | `total` | You pay | the landing | `money(line.patient_cents)` | reconciled sum | none (total) |

Rules for presence: Fee, Allowed, Deductible, Share, Maximum and You pay are always present on an `estimate` line (a zero change still
shows as a checkpoint with `$0.00`, because "no deductible applied" is itself information). Alternate appears only when an `AB` step
exists; Listed only when listed fees exist.

**Not covered** (`line.status === "not_covered"`): exactly two checkpoints: Fee and one closed checkpoint whose term depends on
`steps[0].rule`: `X` → "Not covered by this plan", `W` → "Waiting period", `F` → "Frequency limit"; place "the closed channel"; amount
`money(line.patient_cents)` labelled `you pay`; stitch from `steps[0].stitch`; explanation `steps[0].label` verbatim (e.g. `Not covered:
frequency limit (2 of 2 used this benefit year)`). The route into the island is drawn, the route out is drawn dotted-grey to the next
island (the sounding after it is unchanged from the previous one, which the engine's `remaining_after` already reflects).

**Unresolved** (`line.status === "unresolved"`): the island is in fog (§3.5) with one checkpoint "Waiting for information" (place "the
fog bank", `rule: "missing"`) whose drawer lists `estimate.missing_inputs.filter(m => !m.line || m.line === line.label)` plus
`line.flags`. If `ledger.lines.length === 0` (usage not provided at all), every planned island is in fog and the START drawer carries the
`missing_inputs` list with the Benefit statement form (§4.5).

### 3.4 START and destination

**START harbor** (`kind: "start"`, place "Harbor of Beginnings" from `stage.island` when the plan_details stage exists, else the fixed
string). Reads: `plan.summary.title`, `is_fictional`, `source_document.version_label`, `benefits.remaining_deductible_cents` +
`derivation.remaining_deductible`, `benefits.remaining_max_cents` + `derivation.remaining_max` (or `annual_max_unlimited`),
`benefits.source.label/date`, `estimate.inputs.network` + `network_status`, `coverage_start`, and the plan_details stage's checkpoints.
Button label: `Start · {plan_code} · {network word}`. Its drawer holds the compact Benefits compass (§4.6) and the Benefit statement
form (§4.5).

**Harbor Light** (`kind: "destination"`, place "Harbor Light", plate `island-lighthouse`). Reads: `estimate.user_estimated_payment_cents`,
`insurer_estimated_payment_cents`, `plan_payment_is_upper_bound`, `ledger.order_note`, `ledger.could_change`, `assumptions`, the last
line's `remaining_after`, and the post-route care stages (§2.3). Button label: `Harbor Light · you pay {total}` (or `waiting for
information`). Its drawer: totals, the per-island summary table (name, you pay, plan pays, status), the order note, `could_change`, the
"After the route" stage list. The beam sweeps only when `estimate.status === "estimate"`; in fog the lamp is lit but static.

### 3.5 Fog, closed channels, visited history

- **Fog**: two `fog-layer` plates (or the SVG mist fallback) clipped to a 1.6r × 1.1r ellipse over the island at opacity .85, drifting
  at 120 s / 160 s. The island button stays fully readable (it sits above the fog in the HTML layer). Fog lifts (§5.5 `fog-lift`) when a
  new estimate arrives with that line resolved.
- **Closed channel**: the island keeps its plate; the route segment leaving it is `stroke="var(--ink-soft)" strokeDasharray="2 6"`, the
  closed checkpoint marker is a terracotta ring with an inner bar glyph (`⊘` rendered as SVG, not emoji), and the legend gains "⊘ Not
  covered".
- **Visited**: islands in the wake behind START at 60 % size with a sage "visited" stamp; the wake is a faint dotted trail from the
  margin into START; no soundings; the legend gains "◌ Completed on your statement".

### 3.6 Ordering rules

Route order = `ledger.lines` order = `estimate.inputs.treatment_item_ids` order = the order the engine consumed the deductible and the
annual maximum. This is causal, so it is not user-sortable in this release; `ledger.order_note` is shown in the Harbor Light drawer
and, when it says the order changes a line, as a pennant on the first island. Visited islands are ordered by claim `date` ascending;
marginal islands by item creation order.

### 3.7 Island naming vocabulary (fixed place names per category; no patient data)

The procedure name and tooth are HTML control text; the place name is decoration keyed on `procedures.json` `category_hint`:

| `category_hint` | Place name | Plate (fixed slot) | Optional plate |
|---|---|---|---|
| `preventive` | Clearwater Shoal | `island-generic` | `island-preventive` |
| `basic` | Quiet Bay | `island-generic` | – |
| `basic/major (varies)` | Narrow Strait | `island-generic` | – |
| `major` | High Cliffs | `island-major` | – |
| `major/excluded (varies)` | Outer Reef | `island-major` | `island-reef` |
| not-covered line (any category) | the category name + ", closed channel" | as category | `island-reef` when present |

Repeats take a count: the second `major` island is `High Cliffs · 2`. Alex: root canal (`basic/major (varies)`) → Narrow Strait; crown
(`major`) → High Cliffs; night guard (marginal) → Outer Reef. Sam (HB26): crown → High Cliffs. START is "Harbor of Beginnings";
destination "Harbor Light". Checkpoint place names are in §3.3.

### 3.8 Layout by procedure count (`layoutPassage` in `lib/passage.ts`, viewBox 1000×600, horizon at y = 180)

| Count | Desktop composition | Phone (always vertical, §4.3) |
|---|---|---|
| **0** | START at (150, 380), Harbor Light at (860, 380), one straight dotted route between them labelled "open water"; the Add-a-procedure form opens from START; no soundings. Copy: `No planned procedures are recorded. The route is drawn once a treatment item is added.` | START card, "Add a procedure" card, Harbor Light card |
| **1** | START (130, 390) → island (500, 340, r 96) → Light (870, 390). Checkpoints on an arc of radius 1.35r above the island, 7 markers max. | same order, one island card |
| **2–6** | START (110, 400); islands on the S-curve `cx = 230 + t·560`, `cy = 350 + sin(t·π·1.4 + .3)·70`, `t = i/(n−1)`; `r = n ≤ 3 ? 84 : n ≤ 4 ? 74 : 62`; checkpoints on an arc above each island, marker radius `n ≤ 4 ? 9 : 7`; Light (890, 400). Soundings printed under the route midway between islands. | one card per island in route order |
| **7+** | Two-row serpentine: row A `cy = 300`, row B `cy = 470`, 4 islands per row max, `r = 54`; islands show a single compound marker (`{k} checkpoints`) until selected; the selected island expands its arc (§5.5 `focus-island`); soundings on hover/focus only; an **island strip** (horizontal list of chips above the map) duplicates the island buttons for quick selection. Above 12 the strip paginates by 12 and the map draws one page. | cards; the strip becomes a sticky `<select>` labelled "Jump to a procedure" |

Visited islands (any count): stacked left of START in the wake at `(40, 440 + j·34)`, max 4 drawn, then a `+k more` chip. Marginal
islands: lower-right margin at `(940 − j·70, 560)`, max 3, then `+k`.

Controls never overlap: island buttons sit at `cy + r·0.75 + 36` (below the plate), checkpoint buttons on the arc, and the layout
function asserts no two control rectangles intersect; when they would (n ≥ 5), checkpoint buttons shrink to 32 px visual with a 44 px
hit area (`::before` padding) and the island button width drops to 112 px.

---

## 4. Desktop and mobile layout, the drawer, the pipeline, the compass, the states

### 4.1 Desktop 1366×900 (My journey)

```
┌ appbar 64 ───────────────────────────────────────────────────────────────────────────┐
│ OralCompass  tagline                          [My journey][My plan][Compare][Documents]│
├──────────────────────────────────────────────────────────────────────────────────────┤
│ padding 24                                                                            │
│ ┌ main column 854 ─────────────────────────────┐  ┌ drawer 440 ────────────────────┐ │
│ │ h2 journey label · progress line        (56) │  │ (empty state: hidden, column   │ │
│ │ Answers log, 2 rows                     (64) │  │  collapses; map column = 1318) │ │
│ │ toggles: Route · Care timeline · Overview(44)│  │                                │ │
│ │ ┌ Passage map 854×512 (viewBox 1000×600) ──┐ │  │ sticky bar: crumbs · close (48)│ │
│ │ │                                          │ │  │ body: sections (§4.4)          │ │
│ │ └──────────────────────────────────────────┘ │  │ max-height calc(100vh − 136px) │ │
│ │ legend (28)                                  │  │ overflow-y auto                │ │
│ │ Care timeline rail (120)                     │  │                                │ │
│ └──────────────────────────────────────────────┘  └────────────────────────────────┘ │
│ footer 48                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: minmax(0, 1fr) 440px; gap: 24px` at ≥ 1200 px; the drawer column exists only when a selection is open
  (`AnimatePresence` + `layout` on the map wrapper so the map re-centres in 240 ms; reduced motion: instant).
- Map aspect is locked to 1000×600; width 854 → height 512. With the drawer closed the map is 1318×791, capped at `max-width: 1180px`
  and centred.
- Care timeline rail: `display:flex; gap: 12px; overflow-x: auto` with 5 stage cards of `min-width: 220px`, each: title (serif 15/20),
  island name (italic 13), progress (13 tabular), a row of 24 px checkpoint glyph buttons with 44 px hit areas (padding). The current
  stage card carries the "you are here" pin (16 px SVG) at its top-left corner.
- Vertical rhythm: 24 px between blocks; 8 px inside the log; 16 px inside cards.

### 4.2 Desktop 1920 wide

Columns: `minmax(0, 1fr) 480px`, content `max-width: 1680px` centred, padding 32. Map `max-width: 1180px` (height 708) left-aligned in
its column with the Answers log beside it on the right when the drawer is closed (`grid-template-columns: 1180px 1fr`), stacked when
open. Drawer sections keep a `max-width: 440px` measure for prose (`[ui-ux-pro-max] line-length-control`). The Care rail no longer
scrolls (5 × 220 + gaps < 1180).

### 4.3 Mobile 360×780

```
┌ brand row 48: OralCompass · ribbon ──────────────────┐
│ nav 44: [My journey][My plan][Compare][Documents]     │  each 90 px wide, 44 tall
├──────────────────────────────────────────────────────┤
│ padding 16                                           │
│ h2 (22/28) + progress line (13)                      │
│ Answers log: 5 rows, dt 11 caps-less muted / dd 15    │
│ segment 44: [Route][Care timeline][Overview list]    │
│ ┌ painted header 328×150: backdrop crop + START ───┐  │
│ └──────────────────────────────────────────────────┘  │
│ vertical passage:                                    │
│   ├─ START card (72)                                  │
│   │   soundings line (28): "deductible left … · max …"│
│   ├─ Island card (min 88): name, tooth, you pay, place│
│   │    └ checkpoint rows (44 each): glyph · term · amt│
│   │   soundings line (28)                             │
│   ├─ Island card …                                    │
│   └─ Harbor Light card (72)                           │
│ footer                                                │
└──────────────────────────────────────────────────────┘
bottom sheet (Radix Dialog, modal): max-height 72vh, radius 18 18 0 0, grab handle 44×4, close ×(44×44) top-right, sticky title bar 48
```

- `document.documentElement.scrollWidth === 360` is asserted; every text container has `min-width: 0; overflow-wrap: anywhere`.
- The route is a 3 px dashed `--water-ink` line at x = 28 px; island cards start at x = 52 px; the dashed line is `aria-hidden`.
- Checkpoint rows: 44 px tall, 8 px gap, glyph 24 px, term 15/20, amount right-aligned tabular 15; the row is the `<button>`.
- Opening an island card opens the bottom sheet (`drawer-rise`, §5.5); the card's top edge is the sheet's visual origin
  (`transform-origin` set from the card's `getBoundingClientRect`).
- The island strip (7+) becomes a `<select aria-label="Jump to a procedure">` sticky under the segment bar.
- The Care timeline segment renders the existing `JourneyVertical` markup; the Overview list segment renders `OverviewList`.

### 4.4 The procedure drawer / bottom sheet, section by section

Component `components/drawer/ProcedureDrawer.tsx` (shell) renders `sections/*` in this fixed order. Every section is an `<section
aria-labelledby>` with an `<h3>` (serif 17/24) and is **omitted entirely when its first-listed field is absent** (no empty boxes), except
Procedure, Final cost and How was this calculated?, which always render. When the drawer is opened from a checkpoint, the matching
section is scrolled into view and its heading receives focus (`tabindex="-1"`). Section numbers are not shown; the pipeline is the map.

| # | Section (`<h3>`) | Reads | Shows (copy lint-clean; every figure badge + stitch) |
|---|---|---|---|
| 1 | **Procedure** | item (`procedure_name`, `procedure_key`, `tooth`, `quantity`, `status`, `appointment_date`, `planned_prep`, `planned_completion`, `source`, `dentist_fee_cents`, `code_as_written`), `rules[key].code_as_printed`, `rules[key].category`, `category_status`, `category_cite`, `procedures[key].category_hint` | Name line: `{name}` + ` · tooth {tooth}` · status word. `<dl>`: **Identifier** → `code_as_written` with `USER` ("as written on your estimate") else `code_as_printed.code` with `DOC` + stitch, plus ` · {UI.reviewCode}` when `review`; else `UNKNOWN` "No code is printed in this document". **Dates** → each date with its source word (`appointment_date` "appointment", `planned_prep` "preparation, planned", `planned_completion` "completion, planned"); none → `UI.noDate`. **Dentist's fee** → `money(dentist_fee_cents × quantity)` `USER` + `item.source`. **Plan category** → `category` + badge (`DOC`/`AMBIGUOUS`/`UNKNOWN`) + stitch; `AMBIGUOUS` adds the rule `note`. |
| 2 | **Allowance** | trail steps Fee, Allowed; `item.allowed_cents`, `allowed_status`, `allowed_source`; `estimate.inputs.network`, `network_status`; `plan.oon_rule` | Two figures side by side: `Dentist's fee {money}` (USER) and `Allowed amount {money}` (badge from `allowed_status`, source line = `allowed_source`). Then **Network** → `in-network` / `out-of-network` + badge from `network_status` + the oon_rule stitch; explanation = Allowed checkpoint `explanation` (existing trail strings). `UI.allowedNote` as the closing note. When allowed is unknown this section is the fog section: `missing_inputs` entry for the line + an inline **Allowed amount** input (cents, source text) that PATCHes the item and re-estimates. |
| 3 | **Deductible** | `plan.deductible_individual`, `plan.deductible_waived_classes`, `rules[key].deductible_applies`, `benefits.remaining_deductible_cents` + `derivation.remaining_deductible`, trail Deductible step, `line.remaining_after.deductible_cents` | `<dl>`: **Plan deductible** → `money(plan.deductible_individual.value)` DOC + stitch (or `UI.notStated`). **Applies to this category** → `applies` / `waived for {class}` (DOC). **Remaining before this procedure** → `money(remaining_deductible_cents)` USER + derivation string in small text (or `UNKNOWN` + `derivation` text). **Applied to this line** → `money(D.cents)` or `$0.00` + the Deductible checkpoint explanation. **Remaining after** → `money(remaining_after.deductible_cents)`. |
| 4 | **Coverage share** | `rules[key].plan_pays_pct`, `you_pay_pct`, `category`, `coverage_cite`; trail Share step `split` | Sentence: `Your plan lists {category} at {plan_pays_pct}% of the allowed amount after the deductible.` + stitch. `<dl>`: **Plan share** `money(split.plan)` ({planPct}%) · **Your share** `money(split.patient)` ({100−planPct}%). A two-segment horizontal bar (dataviz: 8 px tall, 4 px rounded ends, 2 px surface gap, water fill for plan, sand fill for you, labels in ink; `role="img"` with the same sentence as `aria-label`). |
| 5 | **Annual maximum** | `plan.annual_max` (+ `unlimited`), `rules.counts_toward_annual_max`, `benefits.remaining_max_cents` + `derivation.remaining_max`, trail Maximum step, `line.plan_cents`, `line.remaining_after.annual_max_cents` | `<dl>`: **Plan annual maximum** (DOC + stitch, or `Unlimited (no dollar maximum)`). **Remaining before this procedure** (USER + derivation). **Consumed by this line** → `money(line.plan_cents)` ("the plan's payment for this line counts toward the maximum" or the exempt-class flag). **Beyond the maximum** → `money(M.cents)` when present, else `within the remaining maximum`. **Remaining after** → `money(remaining_after.annual_max_cents)` or `no maximum applies`. The AnnualMaximumGauge (§4.6) in compact form: before / after marks. |
| 6 | **Frequency** | `rules[key].frequency[]` (`clock`, `n`, `cite`), `benefits.claims.filter(c.procedure_key === key)`, trail closed checkpoint when `rule === "F"` | Per rule: `Your plan lists this service as covered {n} per {clockWords}.` where `clockWords` = `calendar_count → "calendar year"`, `interval_months → "{n} months (one per interval)"`, `rolling12_count → "rolling 12 months"`, `per_tooth_months → "{n} months per tooth (shown as a rule; not enforced in the arithmetic)"`, `per_quadrant_months` likewise, `lifetime → "lifetime"`. Stitch per rule. **Service dates on your statement** → list of claim dates for this key (USER) or `None recorded on your statement.` If the line is not covered by `F`: the engine's `steps[0].label` verbatim as the status line. Omitted when `frequency` is null and no F step. |
| 7 | **Waiting period** | `rules[key].waiting {months, status, cite, note}`, `benefits.coverage_start`, `estimate.inputs` (enrolled months via flags), line flags containing "waiting" | `status === "UNKNOWN"` → `UNKNOWN` badge + `The pages read do not state a waiting period for this service. The estimate is computed as if none applies; the flag below records this.` + the flag text. `months === 0` DOC → `This document states no waiting period for this service.` + stitch. `months > 0` → `Your plan lists a {months}-month waiting period for {category}.` + stitch + **Coverage start** `coverage_start` (USER) or `UNKNOWN` with the two-branch flag verbatim. |
| 8 | **Alternate benefit (downgrade)** | `rules[key].alternate_benefit {status, conditions, cite, note}`, `plan.alternate_benefit`, trail Alternate step, `line.plan_is_upper_bound`, AB flags | `UNKNOWN` → badge + `The pages read do not include an alternate-benefit clause for this service. Absence is not confirmed.` + flag. DOC with conditions → `When {conditionWords}, the plan pays on the allowance for {basis name}.` (`molar → "a crown is placed on a molar"`, `mandibular_molar → "… on a lower molar"`, `posterior → "… on a back tooth"`, `any → "this service is performed"`, `upper_second_third_or_lower_molar → "… on an upper second or third molar, or a lower molar"`) + stitch; **Applied to this line** → `signed(AB basis step)` and the difference step, or `Does not apply to tooth {tooth}.`; `plan_is_upper_bound` → `UI.upperBound` as a flag. |
| 9 | **Exclusions** | `rules[key].exclusion`, `plan.excluded[key]`, `plan.unsupported_rules` (filtered by `procedure_key` text match on the key's name words), trail closed checkpoint when `rule === "X"` | Excluded → `This document lists this service under its exclusions.` + quote stitch + `line.steps[0].label`. Not excluded → `The pages read list no exclusion naming this service.` + (plan `excluded` note when present: e.g. ML26 "The page says the list is partial and the certificate governs."). |
| 10 | **Final cost** | `line.patient_cents`, `line.plan_cents`, `line.plan_is_upper_bound`, `trail.reconciles`, `line.benefit_year` | Hero: `You pay` `money(patient_cents)` (serif 32/36, terracotta ink) · `Estimated plan payment {money(plan_cents)}` (+ ` (upper bound)`) · `benefit year {benefit_year}`. Then the **CostPipeline** (§4.5) for this line. `UI.reconciles` or the warn sentence. `UI.couldChange`. |
| 11 | **How was this calculated?** | `line` (all steps), stitches | `<details>` (open when arrived from a checkpoint): the existing `CostTrail` rendered for this line only (line tabs hidden), then the engine receipt table. Footer: `Every step above is a row the engine returned; nothing on this page is computed by the display.` |
| 12 | **Clause evidence** | `uniqueBy(stitch)(line.steps.map(stitchForStep))` + `rules[key].*cite` stitches | List of `StitchChip` + quote + `doc, page`; each chip opens `ClauseCard`; a `Open in Documents` button sets the tab and the selected stitch. Documents without a stored PDF show `UI.openSource` link. |
| 13 | **Ask about this step** | §8 | The `AskAboutStep` composer scoped to `{plan_ref, estimate_id, treatment_item_id, step_key, checkpoint_key}` with three suggested questions as 44 px buttons and the demo-mode label when applicable. |

Drawer header (sticky, 48 px): crumbs `Island {order} of {n} · {place}` (muted 13) + close button (44 × 44, `aria-label="Close
details"`). Below it the island title (serif 22/28) and the checkpoint strip: the island's checkpoints as 32 px glyph chips in trail
order; the selected one has the terracotta ring; pressing one scrolls to its section. Desktop: `role="region"` `aria-label="Procedure
details"`. Phone: Radix `Dialog` (`role="dialog" aria-modal="true"`, focus trapped, Escape and the handle-drag close, focus returns to
the island button). START and Harbor Light use the same shell with their own section lists (§3.4).

### 4.5 The dollar pipeline (`components/pipeline/CostPipeline.tsx`)

A horizontal flow of nodes for one `LedgerLine`, built from `buildTrail(line).steps`; the Soundings graft: when the underlying estimate
changes (new `estimate.id`) each node's amount rolls from its previous value to the new one (`sounding-roll`, §5.5).

```
 Dentist's fee      Allowed amount      (Alternate)      Deductible        Plan share            Annual maximum        You pay
 $1,150.00  ──▶  −$170.00 → $980.00  ──▶  …  ──▶  −$0.00 → $980.00 ──▶ plan $588.00 / you $392.00 ──▶ −$0.00 → $588.00 ──▶  $392.00
 USER             ML26 ①                             ML26 ③             ML26 ⑤                     ML26 ②                 total
```

- Node anatomy (min-width 132 px, desktop; phone wraps to a 2-column grid): term (13 muted), amount (18 tabular ink; the You pay node
  terracotta 22), change line (`signed(change)` 13; negative in terracotta ink with the `−` glyph, never colour alone), badge or stitch
  chip, a 2 px connector arrow (`→`, SVG, aria-hidden) between nodes. The connector is the only arrow in the UI (R-08 reason: it encodes
  flow direction in a pipeline).
- `aria-label` on the `<ol>`: `Cost pipeline for {line.label}: {n} steps from dentist's fee {fee} to you pay {youPay}.`
- Owner colour is never the only signal: owner words appear (`your share`, `plan share`, `not owed by you`, `basis`).
- Reconciliation line under the pipeline (existing strings). If `reconciles === false`, the pipeline is still shown and the receipt
  table is forced open.
- Unresolved line: the pipeline renders the first node (fee) and a fog node `Waiting for information` listing the missing inputs; no
  numbers invented.

Benefit statement form (`components/records/BenefitStatementForm.tsx`, lives in the START drawer and in the My plan bridge/lookout
cards at depth 2): fields `deductible_met_cents`, `benefits_used_cents`, `coverage_start`, `network_default`, statement `source.label`
and `source.date` (required), optional `_out` variants when the plan has separate out-of-network limits (`plan.deductible_individual_out
.value != null` or `annual_max_out`). Submits `PUT /me/benefits/{plan_code}`, then re-estimates. Every entered figure is `USER`; the
derivation sentence is shown back immediately. Copy: title `Benefit statement figures`, note `Remaining amounts are derived on the
server: plan limit (document) minus what the statement reports (entered by you).`

Add a procedure (`components/plan/TreatmentPlanImporter.tsx`): `<select>` of the 16 procedures (`procedures.name`; `category_hint`
in small text), `procedure_name` as written (optional), tooth (shown only when `tooth_or_area_relevant`), quantity, dentist fee
(dollars → cents), allowed amount (optional) + allowed source (required when allowed is given), network (in/out/not provided), dates
(planned prep, planned completion, appointment), status (planned/scheduled/consultation_mentioned), source (required, e.g. "treatment
plan 2026-09-24 (typed)"). Submits `POST /me/treatment-items`, then re-estimates; the new island is drawn with `chart-draw`. Code field:
`code_as_written` optional with the note `UI.codesNote`.

### 4.6 The benefits compass (`components/compass/BenefitsCompass.tsx`) `[dataviz]`

One parchment panel (not four cards) divided by hairlines into four quadrants around the emblem (`emblem.svg`, 56 px, decorative);
usability first, metaphor second. Full size on My plan at the harbor landmark (and as the depth-2 content of bridge/lookout), compact
(two gauges only) in the START drawer. Table equivalent: a `<table class="sr-only">` with the same figures, and the depth dial's "Your
numbers" view already lists them.

| Quadrant | Component | Reads | Mark spec |
|---|---|---|---|
| Deductible (NW) | `Gauge` (`DeductibleTracker`) | `plan.deductible_individual` (DOC + stitch), `benefits.deductible_met_cents` (USER), `remaining_deductible_cents` + derivation | horizontal meter 8 px, track `--parchment`, fill `--water` for met, 4 px rounded data end, 2 px gap; labels `met {money}` / `remaining {money}` in ink; `UNKNOWN` → empty track with dotted outline and `Not provided` |
| Annual maximum (NE) | `Gauge` (`AnnualMaximumGauge`) | `plan.annual_max` (+ `unlimited`), `benefits.benefits_used_cents`, `remaining_max_cents` + derivation, optional "after the planned work" from the last line's `remaining_after.annual_max_cents` | same meter; a thin terracotta tick (`▏`) marks the "after planned work" level with the label `after the planned work {money}`; unlimited → `Unlimited (no dollar maximum)` and no meter |
| Coverage (SW) | `CoverageMeter` × classes | `plan.classes[]` (`name`, `plan_share_bp_in` + cite, `plan_share_bp_out`) | one row per class: name (13), `plan pays {pct}%` (tabular), 6 px meter in `--water`, out-of-network pct in muted text when different; a stitch chip per row |
| Restrictions (SE) | `RestrictionsList` | counts from `plan.frequency.length`, `Object.keys(plan.excluded).length`, `plan.waiting_months.status/value`, `plan.alternate_benefit.status`, `plan.unsupported_rules.length` | four short lines: `Frequency limits · {n} listed`, `Exclusions · {n} named in the pages read`, `Waiting periods · {none stated / {k} months for … / not stated}`, `Alternate benefit · {clause present / not stated}`; each a button that opens the cove landmark at depth 3 |

Colours: a single sequential hue (`--water` → `--water-ink`) for all fills; status is never colour alone (glyph + word). No radial
chart. The panel's `aria-label`: `Benefits compass for {plan title}: deductible {remaining} remaining, annual maximum {remaining}
remaining.` Numbers animate with `sounding-roll` when the plan or benefits change; reduced motion: static.

### 4.7 States and their exact copy

All strings below live in `copy.ts` (`UI`, `PASSAGE`, `DRAWER`, `UPLOAD`, `ASSIST` namespaces) and pass `tools/advice_lint.py`. No em
dashes in any user-facing string (roadmap style rule; antislop R-02). `[interfaces-that-feel]`: loading is present and calm, errors
own the failure, empties say what belongs here.

| State | Where | Copy |
|---|---|---|
| Connecting | app | `Connecting…` (existing) |
| Loading records | journey | `Reading your records and the plan document…` (existing `UI.processing`) with the chart-draw skeleton: the route is drawn as a faint dotted line while islands are outlines |
| Estimate recalculating | map | islands keep their last numbers at 60 % opacity; the Answers log row 3 reads `Recalculating…`; `aria-live="polite"` announces `Estimate updated` when done |
| No plan selected | journey, plan | `No plan is selected. The route is drawn from a plan document and your records.` + the plan picker in place |
| No journey (new user) | journey | existing `UI.newUserTitle` / `UI.newUserBody` + buttons `Start my journey (no documents yet)` and labelled samples |
| No procedures | map | `No planned procedures are recorded. The route is drawn once a treatment item is added.` + Add a procedure |
| Estimate unresolved, no lines | map | all islands in fog; START pennant `Waiting for information`; drawer: `UI.missingTitle`, `UI.missingIntro`, the `missing_inputs` list (`input` bold, `how` text) and the Benefit statement form |
| Line unresolved | island | fog; checkpoint `Waiting for information`; drawer section 2 shows `missing_inputs` for the line |
| Line not covered | island | closed channel; drawer status line = `steps[0].label` verbatim; Final cost `You pay {money}` with `The plan pays nothing for this line; the full fee is your share.` (existing) |
| Plan field unknown | drawer/compass | `Not stated in this document` (existing `UI.notStated`) with the `UNKNOWN` badge; never a placeholder number |
| Ambiguous class | drawer | `AMBIGUOUS` badge + the engine flag verbatim (`class of '…' is AMBIGUOUS (…) — computed with …`); the flag's em dash is engine text and is displayed as returned |
| Conflict | compass, harbor | `CONFLICT` badge + both excerpts with dates (existing) |
| Movers | Harbor Light, fog drawer | `UI.rangeBecause` (existing) |
| Network status unknown | START | `Network status is not provided. In-network and out-of-network amounts differ; the estimate stays unresolved until it is entered.` + the network field |
| Upload states | §7 | §7.4 |
| Assistant states | §8 | §8.6 |
| API error | banner | `The records could not be loaded` (existing) + `Try again`; the map keeps its last drawn state; a failed re-estimate shows `The estimate could not be recalculated. The previous estimate is still shown.` |
| Unsupported procedure | Add form | the `<select>` lists only the 16 fixed keys; free text goes into `procedure_name`; note `Procedures are matched to one of 16 fixed identifiers; the name as written stays on the island.` |
| Sample ribbon | appbar | existing `UI.sampleRibbon` |
| Fictional plan | everywhere a plan is named | existing `UI.fictional` ribbon |

---

## 5. Design system

All tokens are declared once in `web/src/styles.css` `:root` (existing palette kept; semantic aliases added) and mirrored for JS in
`web/src/lib/motion.ts` (durations and easings only). Components reference tokens, never raw hex.

### 5.1 Colour tokens

```css
:root {
  /* paper and ink (existing) */
  --paper: #f6f0e3; --paper-deep: #efe6d2; --parchment: #e9dcc0;
  --ink: #23303d; --ink-soft: #5b6672; --muted: #7a8390; --rule: rgba(35,48,61,.18);
  /* scenery (existing) */
  --water: #7fa9a6; --water-light: #a9c7c3; --water-ink: #4e7f7c; --sage: #9db08a; --sage-light: #c3d0ad; --forest: #5f7a52;
  --sand: #e3cf9f; --gold: #c59a3c; --gold-soft: #e7cf8f; --terracotta: #b86a4b; --wood: #8a6a45;
  --sky: #e9e2cf; --hill-far: #b9c2b3; --hill-near: #8fa78a;
  --ok: #3f7d4e; --warn: #9a5b1f; --danger: #9b3b2f;
  /* semantic aliases (new) */
  --bg: var(--paper); --surface: var(--paper-deep); --surface-raised: #fffdf8; --surface-map: var(--water);
  --text: var(--ink); --text-soft: var(--ink-soft); --text-muted: var(--muted); --border: var(--rule);
  --accent: var(--gold); --accent-soft: var(--gold-soft); --select: var(--terracotta); --select-ring: rgba(184,106,75,.35);
  --you-pay: var(--terracotta); --plan-pays: var(--water-ink); --basis: var(--wood); --nobody: var(--ink-soft);
  --fog: rgba(246,240,227,.85); --closed: var(--terracotta); --visited: var(--sage);
  --focus: var(--terracotta);
  color-scheme: light;
}
```

Contrast (checked): `--ink` on `--paper` 11.9:1; `--ink-soft` on `--paper` 5.6:1; `--terracotta` on `--paper` 4.6:1 (used at ≥ 15 px
only); `--water-ink` on `--paper` 4.5:1 (used for text at ≥ 15 px only); `--muted` is never used for text under 13 px. No new hue is
added. Dark mode is not shipped in this release (the painting is a daylight scene; a dusk set remains the headroom item from the UI
guide).

### 5.2 Typography

Families unchanged: `--serif` (Iowan Old Style / Palatino stack) for display and headings and the Answers log; `--sans` (system humanist)
for body and controls; `--mono` only for the stitch scope tag. Tabular numerals on every amount (`.num, .amt, .total`).

| Role | Size / line | Weight | Family | Used for |
|---|---|---|---|---|
| display | 32 / 36 | 700 | serif | the you-pay hero in Final cost and the lighthouse |
| heading-1 | 24 / 30 | 600 | serif | app name, view titles |
| heading-2 | 22 / 28 | 600 | serif | drawer title, landmark term |
| heading-3 | 17 / 24 | 600 | serif | drawer sections |
| log | 15 / 22 | 400 (dt 600) | serif | Answers log |
| body | 16 / 24 | 400 | sans | prose, explanations |
| label | 13 / 18 | 500 | sans | dt labels, badges, legend |
| numeric | 18 / 24 | 600 | sans tabular | pipeline amounts, soundings |
| caption | 12 / 16 | 400 | sans | source lines, page references (never under 12) |
| quote | 15 / 24 | 400 italic | serif | clause quotes |

Phone: display 28/32, heading-2 20/26, numeric 16/22; body stays 16.

### 5.3 Spacing, radius, shadows

- Spacing scale (px): `--s-1: 4; --s-2: 8; --s-3: 12; --s-4: 16; --s-5: 24; --s-6: 32; --s-7: 48; --s-8: 64`. Section gaps use `--s-5`
  (desktop) / `--s-4` (phone); inside cards `--s-4`; between a label and its value `--s-1`; between touch targets ≥ `--s-2`.
- Radius: `--r-1: 4px` (badges, stitch chips, meters), `--r-2: 8px` (inputs, pennants), `--r-3: 12px` (cards, drawer sections),
  `--r-4: 16px` (map plate, drawer), `--r-sheet: 18px 18px 0 0`, `--r-pill: 999px` (navigation and primary buttons only). Reason
  recorded: pills mark "go somewhere / do something"; everything that holds information is rectangular.
- Shadows: `--shadow-1: 0 1px 2px rgba(35,48,61,.08)` (chips, buttons), `--shadow-2: 0 6px 18px rgba(35,48,61,.12)` (drawer, cards on
  the map), `--shadow-3: 0 -10px 30px rgba(35,48,61,.25)` (bottom sheet). The map plate uses `--shadow-2`; nothing else floats.

### 5.4 Motion tokens

```css
:root {
  --dur-micro: 120ms;     /* press, chip, pennant, nav indicator */
  --dur-standard: 240ms;  /* drawer slide, number roll, crossfade */
  --dur-journey: 700ms;   /* route draw, focus-island, fog-lift (900) */
  --dur-page: 420ms;      /* view wash-in */
  --ease-standard: cubic-bezier(.2,.7,.2,1);   /* ease-out: things arriving */
  --ease-in-out: cubic-bezier(.65,0,.35,1);    /* route drawing: constant feel with soft ends */
  --ease-land: cubic-bezier(.16,1,.3,1);       /* soft landing for focus and the sheet */
  --ease-exit: cubic-bezier(.4,0,1,1);         /* leaving: accelerate */
}
```

`lib/motion.ts` exports the same values plus the Motion spring for the sheet: `{ type: "spring", stiffness: 320, damping: 36, mass: 1 }`
(no overshoot, settles ≈ 350 ms), `exit = enter × 0.7` everywhere, and `useReducedMotion()` from `motion/react`. App root wraps
`<MotionConfig reducedMotion="user">`. Only `transform`, `opacity`, `clip-path`, `stroke-dashoffset` and `filter` are animated.

### 5.5 Named motion vocabulary (trigger → motion → reduced-motion end state)

Frequency gate `[design-motion-principles]`: island selection and drawer opening happen a few times per session (occasional → subtle,
≤ 700 ms); typing and keyboard navigation never animate; scenery drift is ambient and off under reduced motion.

| Name | Trigger (cause) | Motion (what it communicates) | Duration / easing | Reduced-motion end state |
|---|---|---|---|---|
| `wash-in` | a view mounts | the view rises 8 px and fades in: "a new page of the atlas" | 420 ms `--ease-standard` | visible, no movement |
| `chart-draw` | the estimate for the current plan loads or changes | the route is drawn START → islands → Light with `stroke-dashoffset` (`pathLength` 1 → 0); each island's checkpoint markers appear in trail order with a 60 ms stagger as the route reaches that island: "the receipt is written in processing order" | 700 ms per segment, `--ease-in-out`; markers 120 ms each | full route and all markers visible |
| `focus-island` | an island button is activated (pointer); not on keyboard focus | the viewBox interpolates toward the island (scale ≤ 1.35, island centred at 40 % x), other islands dim to .72, the selected island's checkpoint arc expands from a compound marker (7+) to its full arc: "this island comes into focus" | 600 ms `--ease-land`, interruptible (a new selection retargets mid-flight) | no viewBox change; selection ring + dimming applied instantly |
| `drawer-rise` | an island or checkpoint is selected | desktop: the drawer column enters from the right 24 px + fade while a 1 px gold "line" (SVG) is cast from the island's button edge to the drawer edge and fades; phone: the sheet rises from the island card's top edge with the spring: "the detail belongs to that island" | desktop 240 ms `--ease-standard`, exit 170 ms `--ease-exit`; phone spring ≈ 350 ms | drawer/sheet appears; no line |
| `thread-pull` | a stitch chip is pressed | a gold thread (SVG path, 1.5 px) draws from the chip to the opening `ClauseCard` header: "this number is sewn to this sentence" | 300 ms `--ease-standard` | card appears; thread omitted |
| `sounding-roll` | a new estimate id arrives while the pipeline, compass or soundings are visible | each amount rolls from old to new over tabular digits (Motion `animate` on a motion value, formatted on update): "the chart re-measures" | 400 ms `--ease-standard`, 40 ms stagger per node | new values swap instantly; `aria-live` announces once |
| `fog-lift` | a line moves from `unresolved` to `estimate` | the fog plates fade out and drift 12 px upward, then `chart-draw` continues from that island: "the missing input cleared the fog" | 900 ms `--ease-standard` | fog removed |
| `channel-close` | a line is `not_covered` on load | the route segment leaving the island draws grey-dotted and the closed marker's bar glyph draws | 300 ms | static |
| `pennant-raise` | flags exist for an island | pennant chips fade in 4 px upward after the island's markers | 120 ms | visible |
| `tab-glide` | navigation tab changes | `layoutId` indicator slides | 200 ms `--ease-standard` | jumps |
| `scenery-drift` | always (ambient) | ripples 40 s linear, clouds 90 s, fog layers 120 s / 160 s, lighthouse beam 7 s ease-in-out ±6°, route "march" 18 s linear (constant-rate flow is the one legitimate linear) | ≥ 7 s loops, nothing under 2 s | all off; beam at rest; route static |

Forbidden (and lint-checked by grepping `styles.css` and `*.tsx` for the keywords): `bounce`, `pulse`, `particles`, `confetti`,
`shimmer`, any `@keyframes` with a period < 2 s other than `spin` on the spinner, `translateY` entrance on headings, parallax on scroll.
The current `.you-are-here { animation: bob }` is removed (bounce); the pin is static.

### 5.6 Interaction states

Buttons: default / hover (background `--parchment`, no movement) / active (`transform: scale(.98)` 120 ms, transform-only) /
focus-visible (3 px `--focus` outline, 2 px offset) / disabled (opacity .55, `aria-disabled`). Island buttons: `is-selected` (terracotta
border + ring), `is-dim` (opacity .72 while another island is focused), `is-fog` (dashed border), `is-closed` (terracotta left glyph).
Checkpoint buttons: glyph by state (`✓ completed-equivalent` is not used here; insurance checkpoints use rule glyphs: `§` fee, `≈`
allowed, `⇄` alternate, `◐` deductible, `◑` share, `▲` maximum, `≡` listed, `●` you pay, `⊘` closed, `?` fog), all rendered as SVG
paths inside the button, never emoji. Every glyph pairs with its term in the accessible name.

### 5.7 Decision log (one line each, antislop R-31)

- Painted map: it is the information architecture (procedures → islands, ledger steps → checkpoints), not decoration.
- Parchment palette: existing identity; numbers must be the darkest thing on screen, so ink on paper, never on the painting.
- Serif headings / sans body: the atlas voice for titles, the ledger voice for prose; tabular numerals because amounts align.
- Gold accent: evidence and completion; terracotta selection and you-pay: the one warm ink that means "this is yours".
- Cards only for the drawer sections and care-stage rail: they hold a bounded set of fields; the Answers log is deliberately not cards.
- Pills on navigation only: pills mean "go / do"; information surfaces stay rectangular.
- Shadows at three levels: map plate, drawer, sheet; nothing else is elevated.
- Two fog plates: uncertainty needs a texture a solid overlay cannot give; fallback is SVG mist.
- One arrow in the UI (pipeline connector): it encodes direction of a flow.
- Motion on cause only: route draw = processing order; focus = selection; roll = recalculation; thread = citation.

---

## 6. Component inventory

Rule: no file over 300 lines; `App.tsx` becomes a shell that composes hooks and views. Existing primitives are reused where listed. File
paths are relative to `web/src/`. "Owner" refers to §13.

| Component | File | Props | Data read | Responsibilities | Owner |
|---|---|---|---|---|---|
| `App` | `App.tsx` | – | – | shell: `MotionConfig`, tabs, error/loading banners, composes views; ≤ 150 lines | foundation |
| `useAppData` | `hooks/useAppData.ts` | – | all `api.*` | loading, plan selection (`planRef`), journeys, items, benefits, estimate, rules, evidence, stitches; exposes `reestimate()`, `selectPlan(ref)` | foundation |
| `useJourneySelection` | `hooks/useJourneySelection.ts` | – | – | `{ stage?: Selection; island?: { islandId, checkpointKey? } }`, one open at a time, focus-return element | foundation |
| `JourneyView` | `views/JourneyView.tsx` | `data, selection, mobile` | passage VM | composes AnswersLog, toggles, PassageMap/PassageVertical/CareTimeline/OverviewList, ProcedureDrawer, DetailPanel | foundation |
| `PlanView` | `views/PlanView.tsx` | `data, mobile` | plan, benefits, rules, estimate | plan picker + mode switch (§7), `PlanAtlas`, `LandmarkContent`, `BenefitsCompass`, `CostTrail`, upload review entry | foundation (mode switch hook point for upload agent) |
| `AnswersLog` | `components/journey/AnswersLog.tsx` | `vm: PassageVM, progress, plan, onFocus(target)` | §2.4 | the five answers as a `<dl>` of link buttons | foundation |
| `PassageMap` | `components/atlas/PassageMap.tsx` | `vm: PassageVM, layout, selected, onSelect, reduced` | layout from `layoutPassage` | the desktop SVG scene + HTML control layer; composes the atlas pieces below | foundation |
| `ArtPlate` | `components/atlas/ArtPlate.tsx` | `slot, x, y, w, h, fallback: ReactNode` | `/art/<slot>.webp` then `.png` | `<image>` with `onError` → fallback SVG; shared by all plates | foundation |
| `RouteLine` | `components/atlas/RouteLine.tsx` | `points, segmentsState[], draw: boolean` | layout | the route path(s) with `chart-draw`, grey-dotted closed segments | foundation |
| `StartHarbor` | `components/atlas/StartHarbor.tsx` | `x, y, vm.start` | §3.4 | harbor plate + wake | foundation |
| `ProcedureIsland` | `components/atlas/ProcedureIsland.tsx` | `island: IslandVM, cx, cy, r, selected, dim` | §3.2 | plate, state ring, pennants, checkpoint arc path | foundation |
| `InsuranceCheckpoint` | `components/atlas/InsuranceCheckpoint.tsx` | `cp: InsuranceCheckpointVM, x, y, selected` | §3.3 | marker glyph (SVG) in the scene; the HTML button is rendered by `PassageControls` | foundation |
| `Soundings` | `components/atlas/Soundings.tsx` | `after: {deductible, annualMax}, x, y` | `remaining_after` | the two sounding figures on the water in ink on a parchment lozenge | foundation |
| `FogLayer` | `components/atlas/FogLayer.tsx` | `cx, cy, r, lifting` | state | two fog plates clipped to the island; `fog-lift` | foundation |
| `HarborLight` | `components/atlas/HarborLight.tsx` | `x, y, vm.destination, lit` | §3.4 | lighthouse plate, beam only when lit | foundation |
| `PassageControls` | `components/atlas/PassageControls.tsx` | `vm, layout, selected, onSelect` | – | the absolutely positioned HTML buttons (islands, checkpoints, START, Light, visited, marginal), legend | foundation |
| `PassageVertical` | `components/atlas/PassageVertical.tsx` | `vm, selected, onSelect` | §4.3 | the phone passage as an `<ol>` with the dashed route | foundation |
| `IslandStrip` | `components/journey/IslandStrip.tsx` | `vm, selected, onSelect, page` | – | 7+ chips / phone `<select>` | foundation |
| `CareTimeline` | `components/journey/CareTimeline.tsx` | `journey, progress, selected, onSelect, currentStageId` | stages | the rail (desktop) / `JourneyVertical` (phone) | foundation |
| `DetailPanel` | `components/DetailPanel.tsx` | existing | existing | unchanged; mounts inside the drawer shell when a stage is selected | foundation (no edits beyond import paths) |
| `OverviewList` | `components/OverviewList.tsx` | `journey, vm, onSelect` | §9.3 | adds the islands table before the stage tables | foundation |
| `ProcedureDrawer` | `components/drawer/ProcedureDrawer.tsx` | `island, vm, plan, rules, benefits, estimate, stitches, selectedCheckpoint, onSelectStitch, onOpenDocuments, onClose, mobile` | §4.4 | shell: header, checkpoint strip, section composition, focus management; renders `Sheet` on phones | foundation |
| `Sheet` | `components/Primitives/Sheet.tsx` | `open, onOpenChange, title, originRect, children` | – | Radix `Dialog` wrapper with handle, spring rise, focus return | foundation |
| `sections/ProcedureSection` … `ExclusionsSection`, `FinalCostSection`, `CalculationSection`, `ClauseEvidenceSection` | `components/drawer/sections/*.tsx` | `{ island, rules, plan, benefits, estimate, stitches, onSelectStitch }` (each reads what §4.4 lists) | §4.4 | one section each, 40–120 lines | foundation |
| `AskSection` | `components/drawer/sections/AskSection.tsx` | `scope: AssistScope` | §8 | mounts `AskAboutStep` | upload/assistant |
| `CostPipeline` | `components/pipeline/CostPipeline.tsx` | `line, stitches, previousLine?, onSelectStitch` | §4.5 | nodes, connectors, reconciliation | foundation |
| `RollingAmount` | `components/pipeline/RollingAmount.tsx` | `cents, previousCents?, className` | – | `sounding-roll`; renders `money()` | foundation |
| `CostTrail`, `MissingInputs` | `components/CostTrail.tsx` | existing + `lineIndex?` | existing | add the `lineIndex` prop to render one line without tabs | foundation |
| `BenefitsCompass` | `components/compass/BenefitsCompass.tsx` | `plan, benefits, estimate, stitches, compact, onOpenLandmark, onSelectStitch` | §4.6 | panel + quadrants | foundation |
| `Gauge` | `components/compass/Gauge.tsx` | `label, totalCents, usedCents, remainingCents, status, derivation, stitch, afterCents?, unlimited?` | – | the meter (used for deductible and maximum) | foundation |
| `CoverageMeter` | `components/compass/CoverageMeter.tsx` | `cls: PlanFixture["classes"][n], stitch` | – | one class row | foundation |
| `RestrictionsList` | `components/compass/RestrictionsList.tsx` | `plan, onOpen` | §4.6 | four lines | foundation |
| `BenefitStatementForm` | `components/records/BenefitStatementForm.tsx` | `planRef, plan, benefits, onSaved` | §4.5 | PUT benefits | foundation |
| `TreatmentPlanImporter` | `components/plan/TreatmentPlanImporter.tsx` | `procedures, onAdded` | §4.5 | POST treatment item | foundation |
| `PlanSelector` | `components/plan/PlanSelector.tsx` | `plans, uploads, value: PlanRef, onChange, mode, onMode` | `PlanSummary[]`, `UploadedPlanSummary[]` | carrier → plan → year cascading selects (derived from `PlanSummary.insurer/plan_name/plan_year`) + Preset/Upload switch | foundation (selects) + upload agent (Upload branch content) |
| `PlanUpload` | `components/upload/PlanUpload.tsx` | `onUploaded(doc)` | §7 | file input (PDF), size/type validation, SHA-256 (WebCrypto), text layer via pdf.js for the preview, POST | upload/assistant |
| `RedactionPreview` | `components/upload/RedactionPreview.tsx` | `preview: {text, removed}, onAddTerm` | §7 | shows removed categories, lets the user add terms, confirm | upload/assistant |
| `ExtractionProgress` | `components/upload/ExtractionProgress.tsx` | `status: ExtractionStatus` | §7.3 | staged progress (real stages), cartographic drawing illustration, reduced-motion static | upload/assistant |
| `ReviewTable` | `components/upload/ReviewTable.tsx` | `fields, onDecide, onPublish` | §7.3 | per-field confirm / edit / not-in-document; confidence indicator; quote + page | upload/assistant |
| `ConfidenceIndicator` | `components/upload/ConfidenceIndicator.tsx` | `confidence, evidence` | §7.3 | word + glyph; maps to `EvidenceBadge` | upload/assistant |
| `AskAboutStep` | `components/assistant/AskAboutStep.tsx` | `scope, onOpenStitch, onOpenStep` | §8 | composer, suggestions, answer list, demo label | upload/assistant |
| `AnswerBlocks` | `components/assistant/AnswerBlocks.tsx` | `blocks, estimate, stitches` | §8 | renders sentences with resolved amount refs, chips | upload/assistant |
| `EvidenceBadge`, `StitchChip`, `DepthDial` | `components/Primitives.tsx` | existing | – | unchanged | shared (read-only) |
| `ClauseCard` | `components/ClauseCard.tsx` | existing + `anchorRect?` | – | `thread-pull` origin | foundation |
| `PlanAtlas`, `LandmarkContent`, `DocumentsView`, `CompareView`, `ComparisonGrid`, `PageView`, `LedgerView` | existing | existing | – | `PlanAtlas` gains `ArtPlate` backdrop; `DocumentsView` gains the upload entry point (upload agent edits only the "Your documents" section via a `children` slot) | foundation (`PlanAtlas`, `LandmarkContent`), upload agent (`DocumentsView` slot content) |
| `lib/passage.ts` | – | pure | §3 | `buildPassage(inputs): PassageVM`, `layoutPassage(vm, mode)` | foundation |
| `lib/islands.ts` | – | pure | §3.7 | vocabulary, plates, glyphs | foundation |
| `lib/motion.ts` | – | – | – | tokens, spring, `useReducedMotion` re-export | foundation |
| `lib/copy.ts` | – | – | – | `PASSAGE`, `DRAWER`, `COMPASS` (foundation) and `UPLOAD`, `ASSIST` (upload agent) namespaces, appended at the end of the file in that order | split by namespace |
| `lib/types.ts`, `lib/api.ts` | – | – | – | §13.2 additions, written first by the foundation agent and frozen | foundation |

---

## 7. Plan input modes

### 7.1 Plan reference

A **plan ref** is either a preset code (`"ML26"`) or an uploaded, published plan (`"upload:<document_id>"`). `types.ts` gains
`type PlanRef = string` with helpers `isUpload(ref)`, `uploadId(ref)`. `api.ts` gains `planByRef`, `rulesByRef`, `evidenceByRef` which
route to `/plans/{code}` or `/me/plans/{id}` (§7.3). The engine already resolves `upload:` refs (`api/app/main.py resolve_plan`); the
records router gains the same resolution. Uploaded plans carry `version_label = "UP" + ordinal` (`UP1`, `UP2`, …) per owner so stitches read
`UP1 ⑦`. Nothing transfers between a preset and an upload (benefits are keyed by `plan_ref`).

### 7.2 Mode A: preset

`PlanSelector` renders three cascading `<select>`s built from `GET /plans` summaries: **Carrier** (`insurer`), **Plan** (`plan_name` +
`option`), **Plan year** (`plan_year`; when a carrier/plan has one year the select shows it disabled). Fictional plans appear in the
carrier list under `Fictional demonstration plans` and keep their ribbon. The existing single `<select class="plan-pick">` remains
rendered (visually hidden on desktop, visible on phones) because `tools/screenshots.py` selects by it; both controls write the same
`planRef`. Selecting a preset: `UI.processing` → `chart-draw` on the new estimate. The eligibility banner (`UI.availabilityBanner`)
stays under the selector.

### 7.3 Mode B: upload → extraction → review → publish

**Client flow** (`components/upload/*`): the Upload branch of `PlanSelector` (My plan) and the "Your documents" slot (Documents) open the
same `PlanUpload` dialog (Radix `Dialog`, 560 px, phone full-height sheet).

1. **Choose file**: `<input type="file" accept="application/pdf">`, 44 px label button `Choose a PDF`. Client validation: type
   `application/pdf` and magic bytes `%PDF-`, size ≤ 32 MB, pages ≤ 100 (counted with pdf.js); failure copy: `This file is not a PDF.`,
   `This file is larger than 32 MB.`, `This document has more than 100 pages.` Client computes SHA-256 (WebCrypto) and the text layer of
   the first 100 pages with pdf.js for the redaction preview.
2. **Redaction preview** (`RedactionPreview`): `POST /me/documents/upload` (multipart: `file`, `sha256`, `pages`, `text_preview`)
   returns `redaction_preview {text, removed[]}`; the dialog shows `Removed before any model call: {removed.join(", ") || "nothing
   matched"}` with the first 1,200 characters of the redacted text in a scrollable `<pre>`, and a field `Add a word or number to remove`
   (`PUT /me/documents/{id}/redaction {extra_terms[]}` re-runs the preview). Button: `Continue with these redactions`. Copy under it:
   `The document text is treated as data. Nothing in it is followed as an instruction.`
3. **Extraction** (`ExtractionProgress`): `POST /me/documents/{id}/extract` then poll `GET /me/documents/{id}/extraction` every 1.5 s.
   Stages and their loading copy are **the server's real stages**, rendered as a vertical list with the current stage marked and
   finished stages checked; a slow cartographic line draws beside the list (SVG, 2 px, `--ease-in-out`, one pass per stage; reduced
   motion: static list):

   | `status` | Copy |
   |---|---|
   | `queued` | `Waiting to start…` |
   | `reading_text` | `Reading the document text ({pages_done} of {pages} pages)…` |
   | `redacting` | `Removing personal details…` |
   | `identifying_fields` | `Identifying benefit fields…` |
   | `matching_rules` | `Matching the 16 procedure identifiers to the document's wording…` |
   | `verifying_quotes` | `Verifying each quote against the page text ({quotes_verified} of {quotes_total})…` |
   | `ready` | `Extraction complete. {confirmed} confirmed · {likely} likely · {needs_review} need review · {not_found} not found.` |
   | `failed` | `The document could not be read automatically ({reason}). Fields can be entered by hand below.` |
   | `demo_no_model` | `No extraction model is configured in this environment. Fields from a known fixture document are shown; others can be entered by hand.` |

4. **Review** (`ReviewTable`): one row per extracted field (`fields[]`, §7.5), grouped by landmark (Your plan, Deductible, Coverage,
   Annual maximum, Rules). Columns: **Field** (`label`), **Proposed value** (formatted by `unit`: cents → `money`, bp → `%`, months,
   text), **Confidence** (`ConfidenceIndicator`: `Confirmed ✓` / `Likely ◐` / `Needs review ?` / `Not found ∅`, each also the
   corresponding `EvidenceBadge`), **Quote** (the sentence, page `p.{page}`, and a `Open page` button that renders the page in `PageView`
   with the quote highlighted when `quote_verified`), **Your decision**: three 44 px buttons `Looks right`, `Edit`, `Not in document`.
   `Edit` opens an inline input with a required `Source` text; edited values carry `USER`. Candidates (`AMBIGUOUS`) are listed as radio
   options with their quotes; choosing one keeps `AMBIGUOUS` unless the quote is verified, in which case the server upgrades it to DOC.
   Footer: `{n} fields are waiting for a decision.` and the **Publish** button (`Publish this plan version`), disabled until no row is
   undecided among the **required eight**: `benefit_year_start_month, deductible_individual, annual_max, classes[*].plan_share_bp_in,
   class_of (≥ 1), oon_rule, waiting_months, alternate_benefit`; rows the user marks `Not in document` count as decided (UNKNOWN).
   Note under the button: `Only decided rows enter the plan version. Rows marked "Needs review" stay AMBIGUOUS and are flagged on every
   estimate; rows marked "Not in document" stay UNKNOWN.`
5. **Publish**: `POST /me/documents/{id}/publish` → `{plan_ref: "upload:<id>", version_label: "UP1", published_at, sha256}`; the
   selector switches to the new plan, My journey re-estimates (`chart-draw`), Documents shows the PDF with stitches from the verified
   quotes. Published versions are immutable; re-publishing creates `UP2` and leaves saved estimates pointing at `UP1`.

**Server contract** (`api/app/uploads.py`, new router; all owner-scoped via `repo.get_owned`):

| Endpoint | Request | Response |
|---|---|---|
| `POST /me/documents/upload` | multipart `file` (PDF), `sha256`, `pages:int ≤ 100`, `text_preview` (≤ 400 kB) | `201 {id, sha256, pages, filename, extraction_status: "uploaded", redaction_preview {text, removed[]}, demo_fixture_match: bool}`; `413` over 32 MB; `415` not `%PDF-`; `422` pages > 100 or sha mismatch (server recomputes). The file is stored under the owner prefix (`users/<sub>/docs/<id>.pdf`; local dev: `api/.data/<sub>/`), never under `web/public`. |
| `PUT /me/documents/{id}/redaction` | `{extra_terms: string[] ≤ 20, each ≤ 64 chars}` | `{redaction_preview}` |
| `POST /me/documents/{id}/extract` | – | `202 {status: "queued"}` (runs in a background task; the fixture path completes synchronously) |
| `GET /me/documents/{id}/extraction` | – | `{status, stage_index, stages: [{key, label, done}], pages, pages_done, quotes_total, quotes_verified, fields: ExtractedField[], reason?, mode: "demo"|"live", model?: string}` |
| `PUT /me/documents/{id}/review` | `{decisions: [{field_path, decision: "confirmed"|"edited"|"not_in_document"|"candidate", value?, source?, candidate_index?}]}` | `{fields}` |
| `POST /me/documents/{id}/publish` | – | `201 {plan_ref, version_label, published_at, sha256, summary: UploadedPlanSummary}`; `409 {error: "undecided_fields", fields:[…]}` |
| `GET /me/plans` | – | `{items: UploadedPlanSummary[]}` (same shape as `PlanSummary` + `document_id`, `version_label`, `published_at`) |
| `GET /me/plans/{id}`, `/rules`, `/evidence`, `/documents` | – | same shapes as the preset endpoints; `has_stored_pdf: true`; `stored_path` is a signed, owner-scoped URL `GET /me/documents/{id}/file` (never a public path) |
| `GET /me/documents/{id}/file` | – | the PDF bytes (owner check; `Cache-Control: private, no-store`) |

Processing (`api/app/extraction.py`, extended): `read_text` (PyMuPDF per page; a page with < 20 characters is counted as `scanned`;
if > 50 % of pages are scanned → `failed` with reason `no text layer (scanned document)`) → `redact` (existing `redaction.py` + extra
terms) → `identify_fields`: **demo mode** (no `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`): `FixtureExtractor.extract(sha256)` returns the
fixture model when the SHA matches a stored fixture (`fixtures/documents/*.pdf`: HB26, SM26, NW26, TW26); otherwise every field is
`not_found` and `status = demo_no_model`. **Live mode**: OpenRouter (`ORALCOMPASS_LLM_PROVIDER=openrouter`, model
`ORALCOMPASS_LLM_MODEL`, default `anthropic/claude-haiku-4.5`), the two-call pattern already documented in `extraction.py` (call 1:
sentences per `FIELD_LIST` with page numbers; call 2: tool-use JSON into the PlanModel schema with `page + quote` per field), system
prompt treats document text as data, 60 s timeout, one retry, then `failed` with reason `model unavailable`. → `match_rules`: map
procedure wording to the 16 fixed keys **only via** `fixtures/procedure_codes.json` candidates and the fixture's `procedures_text`;
anything else is `not_found`. → `verify_quotes`: for every field with a quote, normalise whitespace and compare against the cited
page's text; exact → `quote_verified_in_text`; found on another page within ±2 → `needs_review` with `page` corrected and the original
kept in `page_note`; not found → `not_found` (the proposed value is dropped, never kept as DOC). Runtime guard: every model-produced
`note` passes `lint_runtime.guard`.

### 7.4 Confidence mapping (fixed decision 8)

| Verification result | `confidence` | `evidence_status` | `review_status` | Enters the plan version as |
|---|---|---|---|---|
| quote verified on the cited page | `confirmed` | `DOC` | `quote_verified_in_text` | DOC with cite |
| quote verified on a nearby page, or similarity ≥ 0.92 after normalisation | `likely` | `DOC` | `needs_review` | DOC with cite + `page_note` (shown as "page attribution needs review" in Documents, existing string) |
| two or more candidate values/quotes, or wording the schema cannot place | `needs_review` | `AMBIGUOUS` | `null` | AMBIGUOUS with the candidates in `note`; flagged on every estimate line (engine already does this for class/waiting) |
| not stated / model returned "not stated" / quote not found | `not_found` | `UNKNOWN` | `null` | UNKNOWN (`Not stated in this document`) |
| user `Looks right` on `likely` | `confirmed` (user) | `DOC` | `quote_verified_in_text` is **not** granted; `review_status = "user_confirmed"` | DOC with cite; Documents shows "confirmed by you" |
| user `Edit` | – | `USER` | – | USER with the user's `source` text |
| user `Not in document` | `not_found` | `UNKNOWN` | – | UNKNOWN |

### 7.5 `ExtractedField` (shared type)

```ts
export interface ExtractedField {
  field_path: string;            // e.g. "deductible_individual", "classes[1].plan_share_bp_in", "class_of.crown", "frequency[0]"
  label: string;                 // "Deductible (per person)"
  landmark: "harbor" | "bridge" | "cove" | "lookout" | "rules";
  unit: "cents" | "bp" | "months" | "month_index" | "text" | "bool" | "list";
  proposed_value: unknown | null;
  page: number | null; page_note?: string | null; quote: string | null; quote_verified: boolean;
  confidence: "confirmed" | "likely" | "needs_review" | "not_found";
  evidence_status: Evidence; review_status: "quote_verified_in_text" | "needs_review" | "user_confirmed" | null;
  candidates: { value: unknown; quote: string; page: number }[];
  required: boolean;
  decision: null | { kind: "confirmed" | "edited" | "not_in_document" | "candidate"; value?: unknown; source?: string; candidate_index?: number; at: string };
}
export type ExtractionStatus = { status: "queued"|"reading_text"|"redacting"|"identifying_fields"|"matching_rules"|"verifying_quotes"|"ready"|"failed"|"demo_no_model";
  stage_index: number; stages: { key: string; label: string; done: boolean }[]; pages: number; pages_done: number; quotes_total: number; quotes_verified: number;
  fields: ExtractedField[]; reason?: string; mode: "demo" | "live"; model?: string };
```

### 7.6 Demo mode behaviour

With no key set the whole upload path runs: a fixture PDF (e.g. `fixtures/documents/harborview_certificate.pdf`, SHA
`f9307fea…`) uploads, redacts, extracts from the cached fixture, verifies every quote against the real PDF text layer (so the Confirmed
count is real), and publishes as `UP1` whose rules equal `HB26`'s. The review table shows `mode: demo` as a ribbon: `Demo mode: fields
come from a stored fixture that matches this document's checksum.` An unknown PDF shows `demo_no_model` and the hand-entry path. The
same ribbon vocabulary labels the assistant (§8.6).

---

## 8. Grounded assistant

### 8.1 Placement (contextual, not a sidebar)

The assistant exists in exactly two places, both scoped to a selected object:
1. **Ask about this step** (drawer section 13): scope = `{plan_ref, estimate_id, treatment_item_id, line_index, step_key?,
   checkpoint_key?}`; three suggested questions change with the selected checkpoint (e.g. on the Deductible checkpoint: `Why is the
   deductible $0.00 on this line?`, `Where does the remaining deductible figure come from?`, `What does the plan document say about the
   deductible?`). Suggestions are template strings from `ASSIST.suggestions[step_key]` and are linted.
2. **Ask about this clause** (`ClauseCard` footer): scope = `{plan_ref, stitch, estimate_id?}`; suggestions: `What does this sentence
   change in my estimate?`, `Which procedures does this sentence apply to?`.

There is no global chat, no floating button, no history beyond the current scope (answers clear when the scope changes). The composer
is a single-line `<input>` (44 px) with a `Ask` button; `Enter` submits. Answers render as `AnswerBlocks` beneath the composer, each
sentence followed by its stitch chips and step chips.

### 8.2 Request / response contract

```
POST /me/assistant
{ message: string (≤ 400 chars), scope: { plan_ref, estimate_id?, treatment_item_id?, line_index?, step_key?, checkpoint_key?, stitch?, journey_id? } }

200 {
  mode: "demo" | "live", model?: string,
  intent: "explain_step" | "explain_clause" | "where_from" | "what_if_requested" | "advice_request" | "out_of_scope" | "clarify",
  blocks: [ { type: "sentence", text: string, refs: Ref[] } | { type: "clarify", options: [{ label, scope_patch }] } | { type: "template", key: "advice_question" } ],
  suggested: string[],
  guard: { dropped: number, grounding_failures: number },
  tools_used: string[]
}
Ref = { kind: "step", line_index, step_index, label }            // the client renders money(step.cents) from the estimate
    | { kind: "line_total", line_index, which: "patient" | "plan" }
    | { kind: "field", path: "plan.deductible_individual" | "benefits.remaining_deductible_cents" | … }
    | { kind: "clause", stitch: "ML26#p25", rule: "D" }
```

**Amounts are never text.** `text` may contain `{{ref:n}}` placeholders which the client replaces with the formatted value of `refs[n]`
read from the estimate/plan/benefits payloads it already holds. The server rejects (drops) any sentence whose `text` contains a digit
adjacent to `$` or `%` or the words `dollars`/`percent` outside a placeholder (`grounding_failures++`). Every sentence must carry at
least one `clause` or `step` or `field` ref (`lint_runtime.grounded` with the allowed-id set built from the scope's estimate steps,
plan clause stitches and field paths) or it is dropped. Every kept sentence passes `lint_runtime.guard`. If nothing survives, the
response is a single `template` block (§8.4).

### 8.3 Tools (server-side, read-only, owner-scoped)

| Tool | Reads | Returns |
|---|---|---|
| `get_estimate_line(estimate_id, line_index)` | saved estimate (owner) | the `LedgerLine` + `missing_inputs` for the line |
| `explain_step(estimate_id, line_index, step_index)` | line step + `trail` mapping | `{label, cents, owner, rule, stitch, trail_key, explanation}` (explanation = the existing trail string for that key) |
| `get_plan_rules(plan_ref, procedure_key)` | `coverage_rules` | the rule row |
| `get_clause(plan_ref, stitch_label)` | `clauses()` | `{doc, page, quote, field, review_status}` |
| `get_benefits(plan_ref)` | `derived_benefits` | remaining figures + derivation strings |
| `resolve_procedure(text)` | `procedures.json` + `procedure_codes.json` candidates | `{candidates: procedure_key[], clarification_needed}` (never maps free text to one key when ≥ 2 candidates) |

No tool writes. No tool reads another user's records. Live mode exposes exactly these six as tool definitions; demo mode calls them
directly.

### 8.4 Guardrails

1. `lint_runtime.guard` on every sentence (drops banned/imperative/steering sentences; `dropped` count returned and shown as `{n}
   sentence(s) were removed by the information-only check.` when > 0).
2. Grounding check (§8.2): every sentence references a step, clause or field in scope; placeholders only for amounts.
3. **Advice-question template**: intent classifier (demo: keyword list `should`, `worth`, `recommend`, `best`, `better`, `skip`,
   `wait`, `which plan`, `do I need`; live: model-declared intent, re-checked against the same list) → the fixed
   `templates.advice_question_response(facts_by_scenario, differences, not_provided)` built from engine fields only; the UI renders it
   with the label `Information, not a choice`.
4. Scope lock: the server ignores any `plan_ref`/`estimate_id` the caller does not own (constant 404) and strips any instruction-like
   text from clause quotes before they reach the model (quotes are passed as data blocks).
5. Timeouts: live calls 20 s; on failure the response is the demo template for the scope with `mode: "demo"` and the ribbon `The model
   did not answer in time; a template answer is shown.` The map and numbers never depend on the assistant.
6. Rate limit: 30 requests / 10 min / user (`429 {error: "rate_limited"}` → copy `Too many questions in a short time; the composer
   opens again in a moment.`).

### 8.5 Demo mode (deterministic templates over engine fields)

`api/app/assistant_templates.py` (linted) holds one template per `(intent, step_key)` built from the trail explanation strings and
the rule row. Examples (placeholders are refs):

- `explain_step` / `D`: `This line applied {{ref:0}} to your deductible. Your records list {{ref:1}} remaining before this procedure;
  the plan document states a deductible of {{ref:2}}.` refs: step D, `benefits.remaining_deductible_cents`, `plan.deductible_individual`
  (+ clause ref). When `D` is absent: `No deductible was applied to this line: {reason from trail}.`
- `explain_step` / `CO`: `The plan's share for {category} is {{ref:0}} of the amount after the deductible; your share on this line is
  {{ref:1}}.` refs: field `rules.plan_pays_pct` (rendered as `%`), step CO patient (+ clause).
- `explain_step` / `M`: with a `M` step: `{{ref:0}} of the plan's share exceeds the remaining annual maximum and is your share; the
  remaining maximum before this line was {{ref:1}}.`; without: `This line stays within the remaining annual maximum of {{ref:0}}.`
- `explain_clause`: `This sentence sets {topicWords}. In this estimate it changes {{ref:0}} on {line label}.` or `This sentence does
  not change any amount in this estimate.`
- `where_from`: `{{ref:0}} comes from {source words}: {derivation}.`
- `what_if_requested` (only when the user names a value): `A hypothetical is entered on the Harbor Light, not here. Hypotheticals are
  labelled as such on every estimate.` (no computation in the assistant).
- `clarify`: `This question could refer to {k} procedures on the route: {names}. Which one?` with options.
- `out_of_scope`: `This assistant answers about the selected procedure, its checkpoints and the plan clauses behind them. Clinical
  questions are for your dental team.` (The second sentence is a statement of scope, not a directive; it passes the linter.)

The UI shows the ribbon `Demo mode: template answers assembled from the engine's fields, not a live model.` above every answer when
`mode === "demo"`.

### 8.6 Assistant states

| State | Copy |
|---|---|
| idle | suggestions only |
| sending | `Reading the selected step…` (button disabled, spinner 14 px) |
| answered | blocks + chips; `aria-live="polite"` on the answer list |
| nothing survived the guard | the template block + `No sentence about this step passed the information-only check; the clause and step are listed instead.` |
| live unavailable | demo answer + the ribbon from §8.4 (5) |
| rate limited | §8.4 (6) |
| offline | `The assistant needs the API. The map, the pipeline and the clauses do not.` |

---

## 9. Accessibility and the keyboard model

### 9.1 Requirements

- Every control is a real `<button>`, `<a>`, `<select>`, `<input>` or `<textarea>` with a visible 3 px focus ring and an accessible
  name that includes its state (`aria-pressed`, `aria-current`, `aria-expanded`, `aria-selected`).
- Targets ≥ 44 × 44 CSS px on phones (checkpoint glyphs 32 px visual + 6 px padding hit area); ≥ 32 px on desktop with 8 px gaps.
- Contrast ≥ 4.5:1 for all text (§5.1), ≥ 3:1 for markers against the water (markers have an ink stroke of 1.6 px).
- No information by colour alone: every status pairs a glyph and a word; owners are written (`your share`, `plan share`).
- `prefers-reduced-motion: reduce`: every animation in §5.5 off, every end state intact; the fog, selection ring and route are static;
  `MotionConfig reducedMotion="user"`; CSS `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none
  !important } }` as the safety net.
- Live regions: one `aria-live="polite"` status for `Estimate updated`, `Recalculating…`, extraction stage changes and assistant
  answers; `role="alert"` only for errors.
- Phone sheet: Radix `Dialog` (focus trap, Escape, `aria-modal`), focus returns to the opening button; the page behind is `inert`.
- Headings: one `h1` (app name), `h2` per view title and drawer title, `h3` per section; no skipped levels.
- Zoom: layout holds at 200 % browser zoom and 320 CSS px (text wraps; no horizontal scroll).
- Forms: visible labels, `aria-describedby` for errors placed under the field, `type="date"`/`inputmode="decimal"`, required marks.

### 9.2 Keyboard model

| Key | Context | Behaviour |
|---|---|---|
| `Tab` / `Shift+Tab` | everywhere | document order: brand → nav → plan picker → Answers log buttons → view toggle → island strip (7+) → START → islands in route order, each followed by its checkpoints in trail order → Harbor Light → visited → marginal → legend (skipped: `aria-hidden`) → Care rail stages and their checkpoints → drawer (when open) → footer |
| `Enter` / `Space` | any button | activates; `focus-island` does **not** run for keyboard activation (selection ring applies instantly), the drawer still opens and its heading receives focus |
| `←` `→` | focus inside the island group (`role="group" aria-label="Procedure islands"`) | moves focus between island buttons (roving `tabindex`, wraps) |
| `↑` `↓` | focus on an island button | moves focus into / along its checkpoint buttons |
| `Escape` | drawer / sheet / ClauseCard open | closes the top-most surface and returns focus to its opener |
| `Home` / `End` | island group | first / last island |
| `1` `2` `3` | focus inside a DepthDial | selects depth (existing radios also take arrow keys) |

Skip link: `Skip to the route` as the first focusable element, targeting the island group. The map SVG is `aria-hidden="true"`; the
HTML control layer and the Overview list are the accessible surface.

### 9.3 Non-map text equivalent

The **Overview list** (segment 3) is the complete text equivalent and is itself a view, not a fallback:
1. **Route table**: one row per island in route order: Procedure (button), Tooth, Status, Dentist's fee, Allowed amount (badge), You
   pay, Plan pays, Checkpoints (`{k} steps`), Flags (`{n}`), Soundings after (deductible left · maximum left). START and Harbor Light
   rows frame the table. Visited and marginal islands follow in two short tables.
2. **Checkpoint table per island** (expandable `<details>` per row): Term, Amount in, Change, Amount out, Owner, Clause (stitch chip +
   `doc p.page`).
3. **Care stage tables**: unchanged from today (`OverviewList`).
4. The **engine receipt** table stays one click away in every drawer (§4.4, section 11).
Every figure in these tables carries the same badge and stitch as on the map. Screen-reader summary on the route table:
`aria-describedby` → `Route from the dentist's fee to you pay for {n} procedures under {plan title}; estimated you pay {total}.`

---

## 10. Art slots

Fixed filenames under `web/public/art/` (fixed decision 7). The loader (`ArtPlate`) requests `/art/<name>.webp` first (the compressed
siblings already present in the repository), then `/art/<name>.png`, then renders the SVG fallback; a missing file never blocks a
render and never logs an error to the console (`onError` swallowed). `web/public/art/LICENSE.md` is kept current with the table.

| File | Size (px) | Role | Where it is drawn | SVG fallback (mandatory) |
|---|---|---|---|---|
| `journey-backdrop.png` | 2000×1200, opaque, ≥ 16:9 | the sea and sky behind the Passage (and, cropped, the phone header) | `PassageMap` first layer after `<AtlasDefs/>`, `preserveAspectRatio="xMidYMid slice"` | `Scenery` + `oc-water` + ripples (existing) |
| `island-generic.png` | 900×700, transparent | preventive / basic / varies islands, visited islands | `ProcedureIsland` sized 3r × 2.33r centred at `(cx, cy)` | `Island` (existing) |
| `island-major.png` | 900×700, transparent | major and major/excluded islands | same | `Island` with the `--forest` wash deepened and a 2-peak path |
| `island-lighthouse.png` | 900×700, transparent | the Harbor Light | `HarborLight` | the existing lighthouse group + `Island` |
| `emblem.png` + `emblem.svg` | 512×512 (png); vector (svg) | app mark, favicon source, loading indicator, Benefits compass centre, map compass ornament | brand, `BenefitsCompass`, `ExtractionProgress` | `Compass` (existing) |
| `benefits-chest.png` | 600×600, transparent | the START harbor's records chest (benefit statement, documents) | `StartHarbor` at `(x − 40, y − 20)`, 72 px | a small `--wood` chest path |
| `fog-layer-1.png` | 2000×667, transparent | near fog over unresolved islands | `FogLayer`, drifting 120 s | `oc-mist` ellipses |
| `fog-layer-2.png` | 2000×667, transparent | far fog, horizon mist | `FogLayer`, drifting 160 s; `Scenery` horizon | `oc-mist` rect |
| `paper-texture.png` | 1024×1024, seamless | grain over parchment surfaces (drawer, log, compass) at opacity .18 multiply | CSS `background-image` on `.surface-paper` | `Grain` filter (existing) |
| *optional* `island-preventive.png` | 900×700, transparent | preventive islands (Clearwater Shoal) | `ProcedureIsland` when present | `island-generic` |
| *optional* `island-reef.png` | 900×700, transparent | not-covered lines and marginal islands (Outer Reef) | `ProcedureIsland` when present | `island-major` / `island-generic` |

No other plates are referenced. The My plan coast keeps its SVG painting (the `plan-backdrop` plate is retired). Total art weight stays
under 3 MB; each file under 600 KB; `loading="lazy"` for fog and chest plates. `docs/ORALCOMPASS_IMAGE_PROMPTS.md` is updated to this
table (style preamble and integration notes kept).

---

## 11. Demo script (under five minutes; numbers from `CLAUDE.md` rule 8, all engine-generated)

Setup (demo mode, no model call, desktop 1366×900), one of:
- **Single server (what a presenter uses):** `cd web && npm run build && cd ../api && ORALCOMPASS_DEV_AUTH=0 ORALCOMPASS_LLM_PROVIDER=none
  python3 -m uvicorn app.server:app --host 127.0.0.1 --port 8000`, then open http://127.0.0.1:8000. Sessions are cookies; the shell values
  override `api/.env` (which turns on dev auth for the test suite).
- **Dev server:** API with `ORALCOMPASS_DEV_AUTH=1 ORALCOMPASS_LLM_PROVIDER=none` on :8000 and `cd web && npm run dev` (a dev build sends
  the `X-Dev-User` header).
- A production bundle (`npm run build` + `vite preview`) sends no `X-Dev-User` header, so against a dev-auth API it gets 401; build it with
  `VITE_DEV_AUTH=1 npm run build` for that pairing (`tools/screenshots.py` injects the header itself).

| t | Screen | What is said / shown |
|---|---|---|
| 0:00 | Start screen | "Alex Chen is fictional; the plan is real: the 2026 NCFlex Dental Classic Option." Click `Open a labeled sample journey: Alex Chen…`. |
| 0:20 | My journey | The route draws (`chart-draw`): START → Narrow Strait (root canal, tooth 19) → High Cliffs (crown, tooth 19) → Harbor Light. Answers log: `On the route 2 procedures, 4 completed on your statement` · `Estimated you pay $902.00 · plan $1,098.00` · `6 steps cited · 2 rules not stated` · `From ML26 · 2026 NCFlex Dental Plan Details`. Soundings after the root canal: `deductible left $0.00 · maximum left $672.00`; after the crown: `$0.00 · $162.00`. The night guard sits in the margin as Outer Reef, closed. |
| 0:50 | Open the root canal island | Drawer: Procedure (`D3330` as written on your estimate, USER), Allowance (`$1,150.00` fee vs `$980.00` allowed, pre-treatment estimate response 2026-09-30), Coverage share `Type II at 60%` with the stitch `ML26 p.25`, Final cost `You pay $392.00 · plan $588.00`. Pipeline rolls into place. |
| 1:30 | Press the stitch on Plan share | `thread-pull` to the ClauseCard: depth 1 plain words, depth 2 "In this scenario", depth 3 the quote "60% after deductible … Type II" with page 25. `Open in Documents` shows the clause list with the official NC OSHR link (PDF not stored; stated). |
| 2:10 | Waiting period section | `UNKNOWN`: "The pages read do not state a waiting period… the flag below records this." Nothing assumed. Same for Alternate benefit. |
| 2:30 | Crown island | `You pay $510.00 · plan $510.00` (Type III 50%); Annual maximum section: remaining before `$672.00`, consumed `$510.00`, after `$162.00`; the gauge shows before/after marks. |
| 2:55 | Ask about this step (Annual maximum) | Demo-mode ribbon; question `What happens to the annual maximum on this line?` → template sentence with chips resolving to `$510.00` and `$672.00`, clause chip `ML26 ②`. |
| 3:15 | Harbor Light | Totals `$902.00 / $1,098.00`, order note, `could_change` sentence, "After the route": Recovery, Follow-up with `0 of 2 checkpoints completed`. |
| 3:35 | My plan → Upload | Choose `fixtures/documents/harborview_certificate.pdf` (fictional HB26). Redaction preview, extraction stages (all real), review table: eight required fields `Confirmed ✓` with quotes verified on pages 4–11; `Publish this plan version` → `UP1`. |
| 4:20 | Switch to the Sam sample on UP1/HB26 | Harbor Light `you pay $640.00 · plan $560.00`; enter the hypothetical `network: out` on the Harbor Light (ASSUMED badge) → `$940.00`; change the crown's tooth to a premolar (tooth 20) → `$540.00 / $660.00` because the alternate-benefit clause names molars only; remove the deductible figure → fog: `Between $640.00 and $665.00 because remaining deductible was not provided.` (all four figures are asserted in `engine/tests/test_fixture.py`) |
| 4:50 | Phone (360) or reduced motion | Same route as a vertical passage; bottom sheet; every end state present with motion off. Close: "Information from your documents and your inputs. Not advice." |

---

## 12. Acceptance checks (`tools/screenshots.py`, desktop 1366×900 and phone 360×780 with `reduced_motion="reduce"`)

The existing 44 checks stay (with the Care-timeline segment opened first on phones before the stage clicks). New checks, each run on
both devices unless marked:

| Group | Check (name in `checks.json`) | Assertion |
|---|---|---|
| select plan | `plan selector cascades` | carrier → plan → year selects exist; choosing `MetLife` / `NCFlex Dental` / `2026` sets the single `.plan-pick` select to `ML26` |
| select plan | `answers log present` | `dl.log` has 5 `dt`; row 3 text contains `$902.00` for Alex |
| upload plan | `upload dialog validates type` | choosing a `.txt` shows `This file is not a PDF.` |
| upload plan | `fixture pdf extracts in demo mode` | upload `fixtures/documents/harborview_certificate.pdf`; extraction reaches `ready`; review table shows ≥ 8 rows with `Confirmed` |
| upload plan | `publish creates UP1` | after `Publish this plan version`, the plan picker contains `UP1`; Documents shows `UP1` stitches on a rendered page |
| add procedure | `add procedure draws island` | add `Adult cleaning (prophylaxis)` with fee `125.00`, allowed `82.00`, source text; island count increases by one; the new island button's name contains `Adult cleaning` |
| view journey | `route has start and light` | buttons with names starting `Start ·` and `Harbor Light ·` exist |
| view journey | `soundings printed` | text `maximum left $672.00` present (desktop map lozenge / phone soundings line) |
| view journey | `fog on unresolved` | with the FM26H plan selected, `.island-btn.is-fog` count ≥ 1 and the START pennant reads `Waiting for information` |
| view journey | `closed channel on marginal` | the Outer Reef (night guard) button's name contains `not covered` |
| open island | `drawer opens with sections` | click the root canal island; `h3` texts include `Procedure`, `Allowance`, `Deductible`, `Coverage share`, `Annual maximum`, `Final cost`, `How was this calculated?`, `Clause evidence`, `Ask about this step` |
| open island | `you pay per line` | Final cost hero shows `$392.00` (root canal) then `$510.00` after selecting the crown |
| view calculation | `pipeline reconciles` | `.pipeline` present with 6 nodes for the root canal; `Amounts reconcile` text present |
| view calculation | `receipt table one click` | `details.receipt-details > summary` click reveals `table.receipt` |
| view clause evidence | `thread to clause` | press the Plan share stitch; `role=dialog` ClauseCard present; depth 3 quote contains `Type II` or `60%`; page `25` |
| assistant demo | `assistant demo answer grounded` | type `What happens to the annual maximum on this line?` → answer list has ≥ 1 sentence, a `.stitch` chip and the ribbon `Demo mode` |
| assistant demo | `advice question gets template` | type `Should I get the crown?` → text `Information, not a choice` present, no `$` figure outside chips |
| reduced motion (phone) | `no animations under reduced motion` | `getComputedStyle` of `.route`, `.fog`, `.beam` has `animation-name: none`; the drawer opens with every section present |
| keyboard (desktop) | `arrow keys move between islands` | focus the first island, press `ArrowRight`, `document.activeElement` is the second island button; `Escape` closes the drawer and returns focus |
| keyboard | `skip link to route` | first `Tab` lands on `Skip to the route`; `Enter` moves focus into the island group |
| mobile | `no horizontal scroll` | `document.documentElement.scrollWidth === 360` on every screen captured |
| mobile | `sheet is a dialog` | after opening an island, `[role=dialog][aria-modal=true]` exists; `Close details` button ≥ 44×44 |
| trust | `every amount badged in drawer` | within `.drawer`, each `.amt, .num, .total` has a `.badge` or `.stitch` in its closest `li, dd, p, td, .node`; count of violations `== 0` |
| anti-slop | `no forbidden motion keywords` | grep of `styles.css` and `src/**/*.tsx` for `bounce|pulse|confetti|particle|shimmer` returns none (run as a Python check in the same script) |
| lint | `copy lints clean` | `python3 tools/advice_lint.py web/src/lib/copy.ts api/app/templates.py api/app/assistant_templates.py api/app/assistant_glossary.py` exits 0 (run from the script). Note: the linter is for copy files, not this spec; run over this document it reports exactly five non-UI matches (spec prose "saved estimates", the three detector keywords listed in §8.4 item 3, and the test input `Should I get the crown?` in this table), which is the expected result. |

Screenshots added: `{device}-11-passage.png`, `-12-drawer.png`, `-13-pipeline.png`, `-14-thread.png`, `-15-upload-review.png`,
`-16-assistant.png`, `-17-fog.png`, `-18-overview.png`.

---

## 13. Build plan for parallel agents

### 13.1 File ownership

| Agent | Owns (creates/edits) | Must not touch |
|---|---|---|
| **api/** | `api/app/uploads.py` (new), `api/app/assistant.py` (new), `api/app/assistant_templates.py` (new), `api/app/extraction.py` (extend), `api/app/records.py` (plan-ref resolution; `treatment_item_id` + `procedure_key` on ledger lines in saved estimates; `GET /me/plans*`), `api/app/main.py` (router includes, `/health` gains `llm_mode`), `api/app/templates.py` (new strings), `api/requirements.txt` (`pymupdf`, `httpx`, `python-multipart`), `api/tests/test_uploads.py`, `api/tests/test_assistant.py`, `api/tests/test_records.py` (extend), `api/.env.example` | `web/`, `engine/` (the engine is unchanged in this build), `fixtures/plans/*` |
| **web foundation + map** | `web/src/App.tsx`, `web/src/hooks/*`, `web/src/views/JourneyView.tsx`, `web/src/views/PlanView.tsx`, `web/src/lib/{types,api,copy,passage,islands,motion,trail,journey,stitches,upload-types}.ts`, `web/src/components/atlas/*`, `web/src/components/journey/*`, `web/src/components/drawer/ProcedureDrawer.tsx` and `sections/*` except `AskSection.tsx`, `web/src/components/pipeline/*`, `web/src/components/compass/*`, `web/src/components/records/*`, `web/src/components/plan/{PlanSelector,TreatmentPlanImporter}.tsx`, `web/src/components/Primitives/Sheet.tsx`, `web/src/components/{CostTrail,ClauseCard,OverviewList,LandmarkContent,DocumentsView}.tsx` (DocumentsView: only the `uploadSlot` prop), `web/src/styles.css`, `web/package.json` (adds `motion`, `@radix-ui/react-dialog`), `tools/screenshots.py`, `web/public/art/LICENSE.md` | `web/src/components/upload/*`, `web/src/components/assistant/*`, `AskSection.tsx`, the `UPLOAD`/`ASSIST` copy namespaces, `api/` |
| **web upload-review + assistant** | `web/src/components/upload/*`, `web/src/components/assistant/*`, `web/src/components/drawer/sections/AskSection.tsx`, `web/src/lib/upload.ts` (SHA-256, pdf.js text layer, validation), `web/src/lib/assistant.ts` (ref resolution, placeholder rendering), the `UPLOAD` and `ASSIST` namespaces appended to `copy.ts`, `web/src/styles/upload.css` + `assistant.css` (imported by `styles.css` via two `@import` lines the foundation agent adds on day 1), `web/src/__tests__/{upload,assistant}.test.ts` | everything else in `web/src`; `api/` |

Shared read-only: `Primitives.tsx` (`EvidenceBadge`, `StitchChip`, `DepthDial`), `PageView.tsx`, `engine/`.

### 13.2 Shared interfaces, frozen on day 1 by the foundation agent (the other two build against them)

**`types.ts` additions**

```ts
export type PlanRef = string;                                   // "ML26" | "upload:<document_id>"
export const isUpload = (r: PlanRef) => r.startsWith("upload:");
export interface UploadedPlanSummary extends PlanSummary { document_id: string; version_label: string; published_at: string }
export interface LedgerLine { /* existing */ treatment_item_id?: string; procedure_key?: string }     // added by the API; optional on the client
export type ProcedureCategory = "preventive" | "basic" | "varies" | "major" | "major_excluded";
export type IslandKind = "start" | "procedure" | "visited" | "marginal" | "destination";
export type IslandState = "estimate" | "unresolved" | "not_covered" | "pending" | "visited" | "mentioned" | "frame";
export type CheckpointRule = "fee" | "N" | "AB" | "D" | "CO" | "M" | "L" | "total" | "X" | "W" | "F" | "missing";
export interface InsuranceCheckpointVM { key: string; rule: CheckpointRule; term: string; place: string; glyph: string; amountIn: number | null; change: number | null; amountOut: number | null;
  owner: "patient" | "plan" | "nobody" | "basis" | "info"; explanation: string; stitchLabel: string | null; stitch?: Stitch; badge: Evidence; stepIndexes: number[]; flags: string[]; split?: { plan: number; patient: number; planPct: number } }
export interface IslandVM { id: string; kind: IslandKind; state: IslandState; order: number; place: string; title: string; subtitle: string | null; category: ProcedureCategory | null;
  itemId?: string; item?: TreatmentItem; line?: LedgerLine; lineIndex?: number; checkpoints: InsuranceCheckpointVM[]; youPay: number | null; planPays: number | null; upperBound: boolean;
  missing: MissingInput[]; notices: string[]; soundingsAfter: { deductible: number | null; annualMax: number | null; unlimited: boolean } | null; claim?: Claim; stageIds: string[] }
export interface Claim { id: string; date: string; procedure_key: string; tooth?: string | null; dentist_fee_cents?: number | null; allowed_cents?: number | null; plan_paid_cents: number; patient_paid_cents?: number | null; deductible_applied_cents?: number; source: string }
export interface PassageVM { status: "empty" | "pending" | "estimate" | "unresolved"; start: IslandVM; islands: IslandVM[]; visited: IslandVM[]; marginal: IslandVM[]; destination: IslandVM;
  totals: { youPay: number | null; planPays: number | null; upperBound: boolean; range: [number, number] | null }; stepsCited: number; rulesNotStated: number }
export interface MapSelection { islandId: string; checkpointKey?: string }
export interface JourneySelection { stage?: Selection; island?: MapSelection }
export interface AssistScope { plan_ref: PlanRef; estimate_id?: string; treatment_item_id?: string; line_index?: number; step_key?: string; checkpoint_key?: string; stitch?: string; journey_id?: string }
export type AssistRef = { kind: "step"; line_index: number; step_index: number; label: string } | { kind: "line_total"; line_index: number; which: "patient" | "plan" } | { kind: "field"; path: string } | { kind: "clause"; stitch: string; rule?: string };
export interface AssistBlock { type: "sentence"; text: string; refs: AssistRef[] } | { type: "clarify"; options: { label: string; scope_patch: Partial<AssistScope> }[] } | { type: "template"; key: "advice_question"; text: string }
export interface AssistResponse { mode: "demo" | "live"; model?: string; intent: string; blocks: AssistBlock[]; suggested: string[]; guard: { dropped: number; grounding_failures: number }; tools_used: string[] }
export interface UploadResponse { id: string; sha256: string; pages: number; filename: string; extraction_status: string; redaction_preview: { text: string; removed: string[] }; demo_fixture_match: boolean }
export type { ExtractedField, ExtractionStatus } from "./upload-types";    // the §7.5 definitions live in web/src/lib/upload-types.ts (foundation writes the file verbatim from §7.5)
```

**`api.ts` additions** (all return typed promises; multipart helper added):

```ts
planByRef: (ref: PlanRef) => isUpload(ref) ? req(`/me/plans/${uploadId(ref)}`) : req(`/plans/${ref}`),
rulesByRef: (ref: PlanRef, keys?: string[]) => …,  evidenceByRef: (ref: PlanRef) => …,  myPlans: () => req<{ items: UploadedPlanSummary[] }>("/me/plans"),
putBenefits: (ref: PlanRef, body: BenefitsIn) => put(`/me/benefits/${encodeURIComponent(ref)}`, body),
uploadDocument: (file: File, sha256: string, pages: number, textPreview: string) => multipart<UploadResponse>("/me/documents/upload", { file, sha256, pages, text_preview: textPreview }),
redaction: (id: string, extra_terms: string[]) => put(`/me/documents/${id}/redaction`, { extra_terms }),
extract: (id: string) => post(`/me/documents/${id}/extract`, {}),  extraction: (id: string) => req<ExtractionStatus>(`/me/documents/${id}/extraction`),
review: (id: string, decisions: ReviewDecision[]) => put(`/me/documents/${id}/review`, { decisions }),  publish: (id: string) => post(`/me/documents/${id}/publish`, {}),
ask: (body: { message: string; scope: AssistScope }) => post<AssistResponse>("/me/assistant", body),
health: () => req<{ ok: boolean; presets: string[]; real_presets: string[]; fictional_presets: string[]; llm_mode: "demo" | "live"; llm_model?: string }>("/health"),
```

**`copy.ts` namespaces**: `PASSAGE`, `DRAWER`, `COMPASS` (foundation) then `UPLOAD`, `ASSIST` (upload agent), each an exported `const`
object appended at the end of the file; no agent edits another's namespace. All strings lint clean.

**Hook points** the foundation agent exposes for the upload/assistant agent: `PlanSelector` prop `uploadSlot?: ReactNode` (rendered
when mode is Upload), `DocumentsView` prop `uploadSlot?: ReactNode`, `ProcedureDrawer` renders `<AskSection scope={…}/>` imported from
a path that the upload agent fills (a stub exporting `null` is committed on day 1), `ClauseCard` prop `askSlot?: ReactNode`, and the
`useAppData` return value `{ planRef, selectPlan, reestimate, estimate, plan, rules, evidence, stitches, benefits }`.

### 13.3 Order of integration

1. **Day 1 (foundation, 2 h)**: freeze `types.ts`, `api.ts`, `upload-types.ts`, copy namespaces, the two `@import` lines, the
   `AskSection` stub, `Sheet`, `motion.ts`, `ArtPlate`; install `motion` and `@radix-ui/react-dialog`; commit. API agent commits the
   `treatment_item_id`/`procedure_key` ledger-line fields and `GET /me/plans` stubs returning empty lists in the same window so the
   client can call them.
2. **Days 1–3 in parallel**: foundation builds `passage.ts` (+ unit tests against the Alex and Sam fixtures: 2 islands, 4 visited, 1
   marginal; soundings `$0.00/$672.00` then `$0.00/$162.00`), the Passage map, drawer sections, pipeline, compass, forms, Care rail,
   Overview list, styles; API agent builds uploads + extraction + publish + assistant with tests; upload/assistant agent builds against
   the frozen contract with MSW-style mocked responses shaped exactly as §7.3 / §8.2.
3. **Day 3 integration**: upload/assistant agent points at the real API; foundation wires the slots; `npm run build`, both pytest suites,
   `tools/ingest_sources.py --check`, `advice_lint.py` on all copy files, `tools/screenshots.py` (existing 44 + §12).
4. **Day 4**: anti-slop Delivery Gate (`docs/ANTISLOP_GATE.md`), motion audit (`design-motion-principles` audit mode on `PassageMap`,
   `ProcedureDrawer`, `CostPipeline`), accessibility pass (keyboard model §9.2 walked by hand and by script), performance pass (bundle
   < 450 kB gzipped excluding pdf.js, art < 3 MB, no SVG filter on more than 3 moving layers), demo rehearsal (§11) with a stopwatch.

### 13.4 Definition of done (per agent)

- API: all endpoints in §7.3 and §8.2 implemented with owner isolation tests (constant 404), upload validation tests (size, type, pages,
  sha mismatch), quote verification tests (confirmed / likely / not_found on the HB26 fixture PDF), publish immutability test, assistant
  tests (advice prompt → template; every sentence grounded; no `$` digits in text; demo mode without keys; live mode mocked), linter on
  `templates.py` and `assistant_templates.py` clean.
- Web foundation: `passage.ts` tests green; screenshots §12 green on both devices; Delivery Gate PASS; no console errors; reduced motion
  verified; 360 px no horizontal scroll; Alex totals `$902.00 / $1,098.00` and Sam `$640.00 / $560.00` visible exactly where §11 says.
- Web upload/assistant: fixture PDF upload → Confirmed ×8 → publish → `UP1` selectable; assistant demo answers render chips that resolve
  to engine amounts; copy namespaces lint clean; keyboard and focus-return verified inside the dialogs.
