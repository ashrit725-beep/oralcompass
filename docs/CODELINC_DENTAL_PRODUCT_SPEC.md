# FinePrint — Product Concept and Implementation Specification (v2: preset plan database + source-linked comparison)

codeLinc 11 · Path 1 Dental · Sat 2026-10-03, 15:45 EDT · Companion to `CODELINC_DENTAL_RESEARCH.md` (evidence) and `CODELINC_DENTAL_BUILD_BRIEF.md` (schedule, pitch, packet). Where this spec and the brief differ, this spec wins. v2 changes: §1.3, §2 Step 1b, §3.8–3.10, §4.7, §5.3/5.10, §6 (M2b), §7 (demo numbers corrected to one tested fixture), §8 checks 7–12, §9.

**Supplied facts used as source of truth:** the challenge outcomes A–C and bonus features (your transcription of the opening deck); the Devpost rubric and rules as read 2026-10-03 (10 criteria, no weights; core functionality weighted over login; ≤5-minute presentation; "mobile development project" wording); your seven must-haves and the two design briefs; real plan clauses quoted in `notes/1-plans.md` (Delta Dental MSU 2024 EOC re-read today; MetLife NCFlex 2026 guide re-read by the critic today; Lincoln Iredell, Aetna Bates, Guardian, Cigna); your synthetic calculation example; Anthropic/AWS/WebKit documentation read today.
**Assumptions (A1–A7):** A1 responsive phone-first web satisfies "mobile" in practice (prior winners were web stacks; coach question open). A2 team of 3–8 with AWS access and a Bedrock-enabled account. A3 judges see the product on a phone and a projector. A4 public plan documents (an employer's posted EOC, a state benefits guide, OPM brochures) contain no personal data and may be shown; all member data is synthetic. A5 no insurer access, no claims feed, no FAIR Health or CDT catalog (terms forbid). A6 nothing here is a certification or audit claim. A7 preset records are seeded by the team from public documents through the same extraction-and-confirm pipeline; fields the documents do not state remain unknown in the catalog.

---

## 1. The selected concept

**Name:** FinePrint.
**Promise:** *Your plan, as a living document: every dollar in your estimate is stitched to the sentence in your plan that produced it — and every sentence shows the dollars it moves. Put plans side by side and the stitches still hold. You change the situation; nothing tells you what to do.*
**Signature interaction — "Pull the thread":** two surfaces, always in sync. The **Page** is the plan document rendered as it is, everything dimmed except the sentences that apply to the user's situation, each wearing a numbered **stitch**. The **Ledger** is a receipt-shaped breakdown of the money whose lines wear the same stitches. Tap a dollar → its sentence lights on the Page (desktop draws a thread; phone scrolls the other pane). Tap a sentence → its Ledger line glows and the Clause card opens at depth 1 (one plain sentence), with depth 2 (the user's numbers) and depth 3 (exact wording + arithmetic) one tap further *inside the same card*. Change a procedure, date, network status, quoted price, or hypothetical balance → stitches appear, disappear or change in both surfaces at once, each change tagged "changed because ③".
**Judge's one sentence:** "You tap a dollar on the estimate and the exact sentence in your plan that caused it lights up — and it works the other way too, even across three plans."

### 1.1 Three concepts compared (brief)

| Concept | Clarity | Originality | Explains changing costs | Source transparency | Neutrality | Accessibility | Feasibility |
|---|---|---|---|---|---|---|---|
| A. Transparent receipt (waterfall per procedure; rule chips) | High | Medium — EOB-explainer waterfalls exist | High | Medium — chip → quote in a modal | High | High | High |
| B. Annotated plan map (procedure travels through gates: eligibility → waiting → frequency → downgrade → deductible → coinsurance → cap) | Medium — abstract; a path reads as a recommended order | High | Medium — gates show why, not how much | Medium | **Medium** | Medium | Medium |
| C. Document that transforms (Page + Ledger joined by stitches) | High — the source is the interface | **High** | High (Ledger) | **Highest** — every number anchored to a sentence on the real page | High | High with table equivalent | Medium — pdf.js text-match; fallback sentence cards |

**Choice: C, improved with A's receipt-shaped Ledger.** Not B: its left-to-right path reads as "the order you should do things," which fights the information-only rule, and gates do not show dollars. Not A alone: generic, and the source stays a modal away. C turns the fine print itself into the product; its weakness (reading a PDF on a phone) is handled by dimming everything irrelevant and by the Rule Table equivalent (§4.6).

### 1.2 One visual language

- **Two surfaces:** Page (paper: pdf.js pages at page width) and Ledger (receipt: fixed-width digits, ruled lines, a total). They never trade roles.
- **Stitches:** a two-part chip — a square **scope tag** (plan code + document version, e.g. `HB26`, `DD24`, `ML26`, `ML20c`) and a circled number assigned in page order within that document. The same chip appears on the Page, the Ledger line, the Clause card header, the Comparison grid cell, the Differences sentence and in screen-reader text ("Stitch 3, Delta Dental MSU High, 2024 certificate"). Numbers are stable for the session; a removed rule leaves a gap. With one plan loaded, the scope tag is shown in a muted style; with two or more, it is always prominent, so `DD24 ③` can never be mistaken for `ML26 ③`.
- **Threads:** one line drawn from stitch to stitch only while something is selected (desktop). On phone the thread is the shared chip plus a 200 ms scroll of the other pane. Reduced motion: no line, no animated scroll; the counterpart receives a 3 px outline and the live region announces it.
- **Depth dial:** every card renders three depths in one element (`1 · 2 · 3`): one sentence (≤ 20 words) · the user's numbers (two-column mini-table) · exact wording (blockquote, page, line range) + arithmetic with every operand badged. No modal, no new route.
- **Evidence badges** (icon + word; never color alone): `📄 Plan p.12` document-supported · `✎ You entered` · `~ Assumed` (hypothetical, entered by the user) · `? Ambiguous` · `∅ Not provided` · `⇄ Sources disagree`. Three visual families (document / you / unresolved) carry the six labels.
- **Scenario rails and plan rails:** equal-width cards in the order the user created or selected them; a ruled **Differences** row states facts with both percentages; no ranking, no emphasis on lower totals, no default selection.
- **Animation that teaches:** the first-load **collapse** (page text dims to 35% over 300 ms; stitched sentences stay at 100%) and the **re-stitch** on a scenario change. Both are cosmetic; with `prefers-reduced-motion` the end states appear instantly and the Rule Table is one tap away.

### 1.3 How presets and comparison extend the thread (v2)

A preset plan is a Page the user did not have to upload: the catalog stores the public document and a confirmed, cited `PlanModel`, so selecting a preset gives the user a Page with stitches in seconds. Comparison is three Pages and three Ledgers read through one **Comparison grid**: each cell is a value with its badge and its scoped stitch; tapping a cell pulls three threads at once — the Page of each plan scrolls to its sentence, and a **paired Clause card** shows the plans' excerpts side by side at the same depth. Nothing new is invented: the grid is a view over the same `PlanModel`s, the same engine, the same badges. The user picks the plans and their order; the app never says which is better and never implies the user can enroll in one.

---

## 2. First-use experience (document → first understandable estimate)

**Step 0 — Sign in and disclosure (≤ 20 s).** Cognito hosted sign-in (email + one-time code; optional authenticator-app MFA). One plain-words screen: "FinePrint reads documents you add. They are stored encrypted in your private space, read by our servers only to build this page, and sent for reading to Anthropic Claude on Amazon Bedrock in one AWS region with zero data retention configured. We never sell or share them. You can delete everything in one tap." Link to the Privacy Panel.

**Step 1 — Add your plan.** Three tiles. *Upload my plan document* (PDF ≤ 100 pages, ≤ 32 MB). *Choose a preset plan* (search the catalog, §3.8). *Compare plans* (select up to three: your upload and/or presets). Copy under all three: "A plan document describes rules. It does not say how much of your benefits you have used this year — you can add that next, for each plan separately."
**Step 1b — Catalog (when a preset is chosen).** Search by carrier, plan name, state, plan year; filters "Plan year" and "Where it is offered". Each result card shows: carrier · exact plan name and option · plan year · where offered · who is eligible (quoted) · source document title and date · verification date · a `Fictional demonstration plan` ribbon where applicable. A fixed banner: "Listed here means the document is public — not that you are eligible to enroll. Eligibility is set by the plan sponsor; the plan's own words about eligibility are shown on each card."

**Step 2 — Add what you have (optional, per plan).** *Treatment estimate* (photo or typed lines: procedure as written, tooth if given, quoted charge, listed fees) — one estimate is shared across plans because it describes the dentist's proposal, not any plan. *Benefit statement / EOB numbers* (remaining deductible, remaining annual maximum, recent service dates) — **entered per plan**; a statement from one plan is never applied to another. *Network status* — **per plan** ("Your dentist's network status can differ by plan"). *Enrollment date* — per plan, needed only when a plan has waiting periods. Skipping leaves `∅ Not provided` in that plan's column.

**Step 3 — What the AI will read.** Side-by-side: extracted text vs. the redacted version that leaves the device (names, member IDs, dates of birth, addresses struck; estimate photo cropped to line items). *Continue* / *Edit redaction*. Presets skip this step (no personal content).

**Step 4 — The Page appears first.** Pages render immediately with a progress bar "Reading page 12 of 62"; stitches appear as rules are found; the Ledger builds beneath when an estimate exists. Presets load their confirmed `PlanModel` instantly.

**Step 5 — Confirm what was found (uploads only).** Checklist with sentence and page for each field; ✓ / ✎ / "Not found in document". Preset fields show their catalog status instead (`📄 verified 2026-10-03` or `∅ not stated in this document`).

**Step 6 — First Ledger.** Per-procedure receipt (§3.2); total as a figure or a labeled range with the cause named; *Try a hypothetical* opens an empty field with the document's figure shown as a reference, never pre-filled.

**Missing-data states on first use:** no estimate → single-procedure mode with class matching only from the document's class list (else `? Ambiguous` and a per-class range); no usage → `∅` slots and ranges; network unknown → two columns, both `~ Assumed` unless the plan states a basis; field absent → the card exists and says so; unreadable scan → OCR then manual entry (`✎`); preset with unknown fields → the same `∅` cards, labeled "not stated in the public document".

**Acceptance (first use):** on the fixture, a new user reaches a Ledger with a figure or a labeled range within 90 s of sign-in with zero silently assumed fields; selecting a preset shows its stitched Page within 5 s.

---

## 3. Feature specification

### 3.1 Priority 1 — Understanding the plan (Page, stitches, Plan Card)

Unchanged from v1 in behavior: Plan Card with six stitched boxes (Benefit year · Deductible · Annual maximum · Classes & coinsurance · Waiting periods · Frequency limits) and a separate **Your usage** box ("Not from the plan document"). Concept cards for premium, deductible, copayment vs coinsurance, insurer annual maximum ("the most the plan pays in a benefit year — **it limits what the plan pays, not what you can owe**", mandatory and tested), individual vs family limits, in/out-of-network, waiting periods, frequency limits with clock type, exclusions and limitations, benefit-year reset, procedure-specific conditions. Each card: depth 1 authored sentence; depth 2 the user's numbers; depth 3 exact wording.
**Acceptance:** 5/5 hallway testers can explain the deductible, what the annual maximum limits (the plan's payment), and one stitched reason the estimate differs from the quote.

### 3.2 Priority 2 — Projected costs (the Ledger)

Per-procedure receipt lines (only those with a basis): Provider's quoted charge ✎ · Allowed amount (`📄` if the document contains a schedule; `✎` from a predetermination; `~` if the user assumes it equals the charge) · Network adjustment — not owed by you (in-network) *or* Amount above the allowed amount — may be billed to you (out-of-network) · Alternate benefit: plan pays on lower allowance · Applied to deductible · Your share (x% of the amount after deductible) · Plan pays y% before annual maximum · Beyond the plan's remaining maximum — your share · Difference between allowed amount and alternate basis — your share · Not covered under supplied rules (exclusion / waiting / frequency) · Other fees listed on your estimate ✎ · **Estimated patient payment** · **Estimated plan payment**. The two percentages are always printed together ("Plan pays 50% · you pay 50%").
Below the total: *This total includes* · *Inputs and dates* · *Assumptions* (`~`) · *Not provided* (`∅`) · *Could change this* ("Claims already submitted but not yet processed, services since your statement date, and the plan's own determination can change these amounts. This is an estimate, not the plan's decision.").
**Multi-procedure:** processing order as listed on the estimate unless dates are given; the order is printed; the engine recomputes in reverse order and, when any line's attribution differs, prints "Order affects how the deductible and maximum are attributed between lines (totals: $X either way / differ by $Y)". Each line shows remaining deductible and maximum after it.
**Scenarios:** up to 3 rails per plan; Differences row of factual sentences, each stitched.
**Ranges** only from enumerated unknowns (deductible met or not; remaining maximum in the document's increments; ambiguous class options; disagreeing sources). **Unsupported rule** → `Limitation` line with the quote and an "at least / unresolved" total.
**Acceptance (synthetic engine checks, passed today):** your example → $100 deductible, $400 coinsurance, $100 beyond the remaining maximum, patient $600, plan $300; out-of-network with the same allowed amount → $900; ordering check (filling $300/$250 at 80% + crown $1,200/$900 at 50%, deductible $100, maximum $300) → attribution $130/$720 vs $600/$250, totals $850 either way; the app prints the order and the equality.

### 3.3 Priority 3 — Translating dense policy language (Clause cards, both directions, conflicts)

Five fixed sections per stitched sentence: **In plain English** (≤ 25 words) · **When it applies** · **Exceptions** (qualifications quoted) · **In this scenario** (the dollar line it moves, or "does not change your numbers in this scenario") · **Original wording** (excerpt, page, line range; "Open on page"). Both directions. Named hard cases: replacement intervals, frequency clocks (calendar-count vs interval vs rolling-12), waiting periods (incl. late-entrant-only), alternate benefit / least-expensive alternative, missing-tooth, exclusions with credits. Conflicts between two documents of the same plan show both excerpts with dates and `⇄`; the Ledger computes a range "because sources disagree"; only the user resolves it (`✎`). Document text is data: schema-only outputs; an injected-instruction fixture is in the test suite and the demo.
**Acceptance:** a tester opens the alternate-benefit card from the Ledger, reads depth 3, returns with one tap to the same scroll position, and states the exception ("molars only") unprompted.

### 3.4 Priority 4 — Connectedness

The scoped stitch is the only identifier the user needs; one keyboard model (`Tab` between stitches in page order, `Enter` pulls the thread, `1/2/3` sets depth, `Esc` returns); one copy model (every number has a badge, every badge a sentence, every sentence a page). In comparison, `Tab` moves across a grid row before moving down, so the user hears the three plans' values for one topic in sequence.

### 3.5 Priority 5 — Optional expiration notifications (last)

Unchanged from v1: distinct event types (benefit-year reset · documented promotional offers · coverage/eligibility changes · waiting-period completion · other explicit plan deadlines), opt-in per event, lead time, quiet hours, one-tap disable, Web Push (iOS/iPadOS 16.4+ Home Screen web apps) with fixed lock-screen text "A date you chose to follow is approaching. Open the app for details.", fact-only detail copy; the annual maximum is never described as money the user has. In comparison mode, notification events are plan-scoped and labeled with the plan code.

### 3.6 Cross-cutting — Strictly informative behavior

(1) copy lint in CI (banned list: should, recommend, best, optimal, smart(est), consider, make sure, don't forget, use your benefits, save/savings, before it's too late, book, schedule now, act, hurry, deal, win, **winner, better plan, right plan for you, you qualify, you can enroll, available to you**; imperative-sentence and second-person-modal detectors); (2) runtime lint on model output (flagged sentence replaced by the quoted clause); (3) grounding check (every generated sentence carries a clause or field id); (4) neutral structure (user order, equal width, no default, no emphasis on lower totals, factual Differences sentences); (5) advice-seeking template ("FinePrint provides information, not a choice. Here is what the supplied documents and inputs show: …"); (6) footer: "Information from your documents and your inputs. Not advice. Not the plan's determination." Comparison adds: no sorting by total, no "cheapest" filter, premiums never summed across plans, eligibility text always quoted beside availability.

### 3.7 Cross-cutting — Accessibility

WCAG 2.2 AA targets: contrast ≥ 4.5:1; meaning never by color alone; full keyboard model; screen-reader labels on stitches with scope; `aria-live="polite"` on recalculation; reduced motion; **Rule Table** (Rule · Plain English · Applies when · Effect in this scenario · Source · Evidence) from every screen; 44 px targets; selectable text layer on the Page. Comparison: the grid has proper `<th>` row/column headers; a linearized "one topic at a time" reading order on phone.

### 3.8 v2 — Preset plan database

**Behavior.** A read-only, searchable catalog of plans the team has loaded from public documents (or authored as clearly fictional demos). Selecting a preset opens its Page and Plan Card exactly like an upload; the user can add their estimate and per-plan usage. The catalog never contains personal data.
**Each record identifies:** carrier (legal issuer as printed) · exact plan name and option · plan year (and benefit-year type) · where offered (states / employer or group / "nationwide" as the document states; or "demonstration only") · eligibility restrictions (quoted from the document; `∅` if the document is silent) · enrollment categories and premiums when the document states them · source document (title, publisher, URL, retrieval date, SHA-256, page count, version label) · verification (date; method: `fields re-read against the PDF` or `extraction only`; which fields were verified, which remain unknown) · `is_fictional` with a `demo_label`.
**Separation.** Different plan years and options are separate records (e.g., Delta MSU High 2024 and Low 2024 would be two records; NCFlex Classic 2026 and High 2026 two records). Two documents for one plan (a summary and a certificate) are two `source_documents` under one record with distinct version labels; stitches carry the version (`ML26` guide vs `ML20c` certificate), and disagreements between them appear as `⇄`.
**Source handling.** Every field in a preset's `PlanModel` carries a citation (page, excerpt) into its stored document; fields the document does not state are `∅` with the note "not stated in this document". No field is filled from carrier websites, marketing pages or memory.
**Seed for the hackathon (exactly three):**
1. `HB26` — **Harborview Dental PPO 2026 — fictional demonstration plan.** Team-authored 14-page certificate with a fee-schedule appendix (so allowed amounts are `📄`), an alternate-benefit clause, no waiting periods, an out-of-network rule, a rate sheet, and one deliberately injected instruction sentence for the security test. Where offered: "demonstration only". Eligibility: "none — fictional".
2. `DD24` — **Delta Dental PPO — High Plan, Mississippi State University (Group 01125), EOC form PPO-ENT-MS-E-R23, effective 1/1/2024** (public, hrm.msstate.edu). Where offered: group plan for MSU benefits-eligible employees and dependents (Mississippi). Verified 2026-10-03 by re-reading seven passages: deductible "$50 per Enrollee each Calendar Year … waived for Diagnostic & Preventive"; coinsurance 100/80/50; Endodontics and Periodontics listed under Major Services; "Restorative, Endodontics, Periodontics, and Prosthodontics are limited to Enrollees who have been enrolled in the Contract for 12 consecutive months"; exams/cleanings "no more than twice in a Calendar Year"; Optional Services clause incl. "porcelain, resin or similar materials for crowns placed on a maxillary second or third molar, or on any mandibular molar"; "Annual Maximum $1,500 per Enrollee per Calendar Year"; crown incurred "at the time the tooth or teeth are prepared" under Continuation of Benefits. Unknown in this document: contracted/allowed amounts; the alternate allowance amount; premiums; missing-tooth clause (not found).
3. `ML26` — **MetLife NCFlex Dental — Classic Option, plan year 2026** (public, oshr.nc.gov 2026 Plan Details pp.24–26; Classic certificate dated 1/1/2020 as second document `ML20c`). Where offered: North Carolina state employees, university and participating-agency employees (as the guide states). Verified 2026-10-03 (guide re-read): deductible $25/$75; Type I 100%, Type II 60% after deductible, Type III 50% after deductible; annual maximum $1,500; orthodontia 50%, dependent children to 19, $1,500 lifetime; R&C at the 70th percentile (certificate p.50). **Unknown or ambiguous:** class definitions (from a 2025 summary whose table extraction was flagged — `? Ambiguous` until confirmed in the certificate), frequency wording, alternate-benefit and missing-tooth paragraphs, waiting periods (not found ≠ none), Classic employee-only premium (the 2026 guide contains a premium table; extract and cite at the venue — until then `∅`).
Catalog candidates, not seeded: OPM FEDVIP 2026 brochures (Delta Dental 62 pp, MetLife 71 pp, Aetna 45 pp — opened today; nationwide; federal employees/annuitants/uniformed services; premiums in brochure), Lincoln DentalConnect Iredell County High/Low (employer summaries, 2022), Delta MSU Low 2024.
**Neutral copy.** "Listed here means the document is public — not that you are eligible to enroll." Never "plans available to you".
**Acceptance.** Search "Delta" returns `DD24` with carrier, option, plan year, where offered, eligibility quote, source title/date, verification date; the fictional ribbon appears on `HB26` everywhere it is shown; `PUT`/`DELETE` on any preset returns 405; preset versions are immutable and a user's comparison stores the version id it used.

### 3.9 v2 — Side-by-side benefits comparison (up to three plans)

**Behavior.** The user selects 2–3 plans (uploads and/or presets) and their order. The **Comparison grid** has fixed topic rows and one column per plan; every cell shows value · badge · scoped stitch; a **Differences** sentence under each row states the facts with both percentages. Tapping a cell opens the **paired Clause card** (§4.7) with the plans' excerpts side by side and the same depth dial: depth 1 plain English per plan; depth 2 "In this scenario" per plan (its Ledger line, if an estimate exists); depth 3 exact wording per plan.
**Rows (fixed order, never sorted by plan):** Premium (enrollment-category selector: employee only / +spouse / +child(ren) / family; pay period as stated) · Deductible — individual / family · Deductible waived for · Annual maximum · What counts toward the maximum · Preventive — plan pays / you pay · Basic — plan pays / you pay, and which of *your* procedures fall here · Major — plan pays / you pay · Orthodontics (coverage, lifetime maximum, age limit) · Waiting periods · Frequency limits (exams, cleanings, x-rays, with clock type) · Replacement intervals (crowns, prosthetics) · Exclusions touching your estimate · Alternate-benefit clause · Missing-tooth provision · In-network payment rule · Out-of-network payment rule (basis; balance billing) · Date-of-service rule (if stated).
**Differences copy (templates):** "Harborview pays 80% of the allowed amount for Class II services (you pay 20%); Delta pays 80% (you pay 20%); MetLife pays 60% after the deductible (you pay 40%)." · "Delta requires 12 months of enrollment before restorative, endodontic, periodontic and prosthodontic services are covered `DD24 ⑤`; Harborview states no waiting periods `HB26 ③`; MetLife: not stated in the pages read `∅`." · "The three plans' individual deductibles are $50, $50 and $25; Harborview and Delta waive it for preventive care; MetLife waives it for Type I." Never "lower is better".
**Uncertainty.** A cell whose document is silent shows `∅ Not stated in this document`; a flagged extraction shows `? Ambiguous` with both readings; two documents of one plan disagreeing show `⇄` with both excerpts and dates. The Differences sentence names unknowns explicitly rather than omitting the plan.
**Neutral structure.** Columns in the user's order; equal width; no totals row sorted; no stars, no "winner"; eligibility quote under each column header with the availability banner.
**Acceptance.** For every cell, an automated test asserts the citation's document SHA-256 equals the column's preset/upload document and the excerpt is found on the cited page; the Differences sentence for coinsurance rows always prints both percentages; a tester can state, after 30 s, one way two plans differ and where that is written.

### 3.10 v2 — What the differences mean in dollars

**Behavior.** "Same estimate, each plan": the user's single treatment estimate runs through the Ledger engine once per plan, producing three equal-weight Ledgers (desktop columns; phone swipe cards with dots). Each Ledger has its **own inputs panel** — network status, allowed amounts, enrollment date, benefit usage — each starting `∅ Not provided`. There is **no copy or transfer function**: a dentist's network status, negotiated prices, remaining benefits and enrollment date belong to one plan; the app never carries them to another, and the inputs panel says so ("Entered for this plan only").
**Outputs per plan:** estimated patient payment · estimated plan payment · the stitched rules responsible for differences (listed under a "Why these differ" heading: "`DD24 ⑨` alternate benefit applies to this crown; the alternate allowance is not stated, so the plan payment shown is an upper bound") · assumptions · not provided · could change this.
**Premiums** are shown in a separate row per plan for the selected enrollment category and pay period as the document states; a combined figure is offered only per plan and only when both parts exist: "12 months of employee-only premiums ($372) + this estimate ($665) = $1,037 — period: 12 months; estimate uses your entered usage." Plans without a stated premium show "cannot be combined: premium `∅`".
**Uncertainty.** A plan whose inputs are missing shows "Unresolved — not provided: allowed amounts, network status, enrollment date, usage" with the list, not a number; hypotheticals are entered per plan and labeled `~`; an unknown alternate allowance makes the plan payment an upper bound and the patient figure "at least"; an unknown waiting period or alternate-benefit clause adds a flag "could be higher if … applies — not found in the pages read".
**Acceptance (fixture, §7):** Harborview with Sam's inputs $665 / $535; Delta with nothing entered → unresolved; Delta with user-entered hypotheticals (allowed = charge, no benefits used, in-network, enrolled 24 months) → patient at least $685, plan at most $815 with the alternate-allowance flag; Delta with enrollment 6 months → not covered, patient $1,500, plan $0; MetLife with hypotheticals → patient $732.50, plan $767.50 with waiting-period and alternate-benefit unknown flags and the composite's class `? Ambiguous`.

---

## 4. Interface design

### 4.1 Phone (primary; 360–430 px)

```
┌──────────────────────────────┐
│ ◄ Harborview PPO 2026 (demo) ⋮│  app bar: document title + evidence legend (i); fictional ribbon
│ [Scenario 1] [Scenario 2] [+]│  equal tabs, creation order
├──────────────────────────────┤
│ Estimated patient payment    │  LEDGER (upper pane, default 58%)
│ $665  📄6 ✎3 ∅0              │  hero total + badge summary
│ ─────────────────────────── │
│ Crown, tooth 30              │
│ Quoted charge      $1,200 ✎  │
│ Allowed amount     $1,000 ⑫  │
│ Network adj. (not owed) −$200 ⑫│
│ Alternate basis      $800 ⑨  │
│ Applied to deductible  $50 ② │
│ Your share (50%)     $375 ①  │
│ Plan pays 50% → max  $375 ③  │
│ Allowed − alt basis  $200 ⑨  │
│ Line: you $625 · plan $375   │
│ ───────────── ≡ drag ────── │  draggable divider (keyboard Alt+↑/↓)
│  …"the benefit will be based │  PAGE (lower pane): dimmed text, stitched sentences full opacity
│   on the allowance for a full│
│   cast metal crown"  HB26 ⑨  │
├──────────────────────────────┤
│ Ledger · Page · Compare · Rules · Me │
└──────────────────────────────┘
```
Tap a Ledger line → outline; the Page scrolls to the sentence and pulses once (no pulse under reduced motion); the Clause card rises from the divider at depth 1; Esc/swipe down restores both scroll positions. Tap a Page stitch → the same card with "Show in Ledger".

### 4.2 Desktop (≥ 1024 px)

Page left (55%), Ledger + scenario rails right (45%); one thread drawn at a time; Clause card docks under the line; Rule Table as a third tab.

### 4.3 Depth dial and Clause card anatomy

Header: scoped stitch · term · governing badge. Dial `1 · 2 · 3`. Depth 1 one sentence; depth 2 mini-table; depth 3 blockquote (excerpt, page, line range) + "Arithmetic" (badged operands) + the five translation sections. Footer: Open on page · Show in Ledger · Report a reading mistake.

### 4.4 Evidence legend · 4.5 Empty/error/offline states · 4.6 Rule Table — unchanged from v1 (legend adds the scope tag explanation: "`DD24 ③` = stitch 3 in the Delta Dental 2024 certificate").

### 4.7 v2 — Comparison grid and paired Clause card

**Phone (topic-first):** a vertical list of topic rows; each row header shows the topic and a one-line Differences sentence; tapping expands the row into three stacked plan cards (plan name · value · badge · scoped stitch) in the user's order; a plan switcher above the Page pane selects which plan's Page is shown below; tapping a plan card scrolls that plan's Page to the stitch. Only one topic row is expanded at a time; `Tab` moves across the three cards before the next topic.
**Desktop:** a true table — `<th>` column headers (plan name, option, plan year, where offered, eligibility quote, fictional ribbon) and `<th>` row headers (topics); cells as above; the Differences sentence spans the row beneath it. Column widths equal; no column is visually emphasized. The Page pane shows the plan of the last-touched cell, with the other plans' Pages one click away (tabs under the Page).
**Paired Clause card:** one card, one depth dial, N excerpt panes in the user's order (plan name as pane header, scoped stitch, badge). Depth 1: one plain sentence per plan. Depth 2: each plan's "In this scenario" line (or "no estimate entered" / "unresolved for this plan"). Depth 3: exact wording per plan with page and line range; "Open on page" per pane. A plan whose document is silent shows "Not stated in this document" in its pane rather than being dropped.
**Same estimate, each plan (dollars):** desktop — three Ledger columns under the grid with per-plan inputs panels above each; phone — swipe cards with dots, each card having its inputs panel at the top. The premium row and combined figure sit in a separate ruled section per plan ("Premiums are not part of the procedure estimate").
**Interaction behavior:** the thread from a grid cell runs to the Page of that plan; changing an input in one plan's panel re-stitches only that plan's Ledger and the grid cells that depend on usage (Your usage row) — rule rows never change with inputs, which the UI states ("Plan rules come from the documents; your entries change only the dollars").
**Accessibility:** grid headers announced; `aria-live` reports "Delta Dental column: unresolved — four inputs not provided"; the Rule Table gains a "Plan" column in comparison mode.

---

## 5. System design

### 5.1 Components (one AWS region; A2)

Client PWA (React + TypeScript + Vite; pdf.js; service worker) → API Gateway (HTTP API, Cognito JWT authorizer) → Lambda (Python 3.12, FastAPI/Mangum): `documents`, `extraction`, `estimates`, `scenarios`, `presets` (read-only), `comparisons`, `account`, `notifications` → S3 (private; SSE-KMS; per-user prefixes; a separate read-only public-content prefix for preset documents) · DynamoDB (single table: `USER#<sub>` partitions for private data; `PRESET#<id>#v<n>` partition for catalog records; CMK) · KMS (one CMK; encryption context `{tenant: sub}` for user data; preset documents use the service context) · Bedrock (Anthropic Claude; document block + citations; zero-data-retention configuration; invocation logging off) · EventBridge Scheduler + `web-push` Lambda (last) · CloudWatch Logs (structured, redacted) + CloudTrail.

### 5.2 Document pipeline

1. Upload grant after owner check → 60-second presigned PUT to `users/<sub>/docs/<id>.pdf`.
2. `extraction`: text layer (PyMuPDF) → redaction pass (member IDs, DOB, addresses, cover-page name block, user-struck words) → **call 1** Bedrock with the document block + citations and a fixed field list → cited sentences; **call 2** tool-use JSON → `PlanModel` with `citation {page_start, page_end, quote}` per field; invalid/missing → `status: unknown`. Instruction-like text is kept only as a quote. Cached by `(sub, sha256)`.
3. Positional highlights: pdf.js text-layer match of `cited_text` on the cited page → boxes → stitch; no match → margin stitch + sentence card.
4. **Presets** go through the same pipeline once, by the team, then a confirm step against the gold quotes in `notes/1-plans.md`; the resulting `PlanModel` and the document are written to the preset partition with `verification {date, method, fields_verified[], fields_unknown[]}` and are immutable thereafter (new facts → new version).

### 5.3 Data model (abbreviated; integer cents; ISO dates; evidence status on every field)

```
Citation { doc_sha256, doc_version_label, page_start, page_end, quote, bbox[]|null }
StitchId { plan_code, doc_version_label, n }           # rendered "DD24 ③"; resolver key = (plan_code, doc_version_label, n)
PlanModel { plan_ref {kind: upload|preset, id, version}, title, carrier_text, effective_date|∅, pages,
  benefit_year {type, start_month, cite, status}, deductible {individual_cents, family_cents, applies_to[], waived[], cite, status},
  annual_max {amount_cents, counts_toward[] | ∅, cite, status},
  classes [{name, plan_share_bp_in, plan_share_bp_out, procedures_text[], cite, status}],   # UI prints plan % and patient % = 10000 − plan %
  orthodontics {plan_share_bp, lifetime_max_cents, age_limit, cite, status},
  waiting [{class, months, late_entrant_only, cite, status}],
  frequency [{procedure_text, clock, n, cite, status}], replacement [{procedure_text, months, per_tooth, cite, status}],
  alternate_benefit {quote, conditions[{procedure_text, condition, substitute_text|allowance_cents|∅}], cite, status},
  missing_tooth {present, quote, cite, status}, exclusions [{procedure_text, credit_text|null, cite}],
  network_rules {in {basis_text, cite}, out {basis_text, balance_billing, percentile|∅, cite}}, dos_rule {type, cite},
  allowed_amounts [{procedure_text, cents, cite}] | ∅,            # only if the document contains a schedule
  premiums [{category, amount_cents, period, plan_year, cite}] | ∅, unsupported_rules [{quote, cite, reason}] }
PresetPlan { preset_id, version, carrier, plan_name, option, plan_year, benefit_year_type, where_offered {text, cite}, eligibility {text, cite|∅},
  source_documents [{title, publisher, url, retrieved_at, sha256, pages, version_label}], verification {date, method, fields_verified[], fields_unknown[]},
  is_fictional, demo_label|null, model: PlanModel, read_only: true }
MemberStatePerPlan { plan_ref, remaining_deductible_cents {year: int|∅}, remaining_max_cents {year: int|∅}, history[], enrollment_date|∅, network: in|out|∅, allowed_overrides [{procedure_text, cents, status: ✎|~}] }
Estimate { lines [{procedure_text, tooth|null, charge_cents, listed_fees[], date|null}], estimate_date, source }   # one per comparison; plan-independent
ComparisonSet { owner: sub, plan_refs[≤3] in user order, estimate_ref, states {plan_ref: MemberStatePerPlan}, grid_rows[] (derived), ledgers {plan_ref: Ledger} }
Ledger { status: estimate|unresolved, per_line[{steps[{label, cents, owner, stitch}], patient{min,max}, plan{min,max}, remaining_after}], totals, bounds_note|null,
  includes[], assumptions[], not_provided[], ambiguous[], conflicts[], could_change[], order_note, premium {category, cents, period}|∅, combined {cents, period_text}|null }
```

### 5.4 Deterministic calculation

`ledger.py` (stdlib; property-tested): eligibility (exclusion; waiting with enrollment date — unknown date → unresolved with two branches shown; frequency with history) → basis (allowed amount; alternate-benefit substitute when the condition matches tooth/material; unknown substitute allowance → plan payment reported as an upper bound) → deductible (scope, waiver) → coinsurance → cap by remaining maximum → attribution of the remainder → balance billing out-of-network. Ranges only by enumerating finite unknowns. Comparison runs the same function once per plan with that plan's `MemberStatePerPlan`; no state is shared between runs. Tests: 19 research cases; the user's acceptance example; ordering; unsupported rule; conflicts; the v2 fixture (`experiments/comparison_fixture.py`, 7 checks).

### 5.5 Explanation generation

Authored templates for the ~20 rule types and for every Differences sentence (parameterized by extracted values; both percentages always printed); the model only extracts and quotes, writes a plain-English sentence for an uncovered clause type, or answers factual questions over the user's own documents — all outputs pass the runtime lint and grounding check. No free-form chat by default.

### 5.6 User isolation and authorization

Every handler: verify JWT → `sub` → load by `(USER#sub, RESOURCE#id)` → 404 with a constant body on mismatch → audit event without content. No cross-user list endpoints; no shared search index over user documents (retrieval is the owner's own `PlanModel`); presigned links 60 s after the owner check; bucket policy denies non-KMS puts and public access; KMS encryption context must match the tenant claim.
**Presets are the only shared data:** read-only, public-document content; the `presets` API is `GET`-only; writes happen through a deploy-time seeding job with a signed manifest; the catalog search index contains preset fields only and nothing from user uploads. A `ComparisonSet` is private to its owner even when it references presets.

### 5.7 Deletion and export

`DELETE /me` removes `USER#sub` items (including comparison sets), `users/<sub>/` objects, the extraction cache, scheduled notifications and the user's wrapped data keys (crypto-shred), then the Cognito user; returns counts. `GET /me/export` returns JSON (documents via 60-second links; models; scenarios; comparison sets with the preset version ids they referenced). Presets are untouched by user deletion.

### 5.8 Where information leaves the application

| Flow | What is transmitted | Protection |
|---|---|---|
| Browser → API | redacted document text, page images, estimate lines, per-plan usage, scenario and comparison inputs, JWT | TLS 1.2+, HSTS, CSP; JWT authorizer |
| Lambda → S3 / DynamoDB | encrypted documents and records; preset records | SSE-KMS tenant context (user data); service context (presets) |
| Lambda → Amazon Bedrock (Anthropic Claude) | redacted document content and the field list; no account identifiers; presets seeded once by the team | TLS; in-region; **zero data retention configured** ("No request or response data is written to durable storage by AWS or shared with the model provider"); invocation logging off. AWS documents that models in `aws_review` mode (currently Claude Fable 5/5.1) retain prompts up to 30 days for AWS review — **a zero-retention-mode model is selected and named on the Privacy Panel.** No training claim is made: the AWS pages read today do not state one. |
| Lambda → push services | the fixed generic lock-screen text only | Web Push encryption; no content |
| Lambda → CloudWatch | structured events without document text, names or amounts | redaction middleware; 14-day retention |
| Nothing else | no analytics, no third-party scripts/fonts, no error-reporting SaaS | CSP |

### 5.9 Security evidence plan

Implemented (prototype): TLS; Cognito with optional TOTP; JWT authorizer; owner checks; 404-not-403; per-user prefixes + KMS tenant context; CMK on DynamoDB; 60-second presigned links; redaction before model calls with preview; schema-only extraction outputs; copy and runtime lint; audit log without content; delete/export; CSP; read-only preset API. Demonstrated with synthetic data: cross-account denial; deletion counts; redaction preview; injected-instruction fixture ignored (it lives in the Harborview document); lint blocking a sentence; a write to `/presets` rejected. Production requirements not completed: WAF/rate limiting; penetration test; SOC 2 / HIPAA assessments (AWS states a business associate agreement is required for PHI; none is in place); key rotation policy; retention policy review; accessibility audit; legal review of disclosures and of displaying public plan documents.
**Cross-account demonstration:** account B issues `GET /documents/{A_doc_id}`, `GET /estimates/{A_est_id}` and `GET /comparisons/{A_cmp_id}` with B's token → three 404s with the constant body; CloudWatch shows `outcome: denied` events with ids only; A's own requests succeed; a 61-second-old presigned link fails.

### 5.10 v2 — Preset storage, versioning, isolation

Preset records live in `PRESET#<id>#v<n>` partitions and `presets/<id>/v<n>/` S3 prefixes; a `latest` pointer per preset; records and documents are immutable (new version on any change) and carry `verification`. Seeding is a deploy-time job that validates every field's citation against the stored PDF (SHA-256 match; quote found on page) before publishing — the same check the comparison acceptance test runs. User comparisons store `(preset_id, version)`; if a newer version exists, the UI shows "A newer version of this plan record exists (verified <date>)" and lets the user switch; it never switches silently. No user credential can write to preset partitions (IAM denies; API is GET-only).

---

## 6. Build sequence (end-to-end demo first; notifications last)

| Milestone | Scope | Working vs simulated | Exit check |
|---|---|---|---|
| M0 Validation (first 30 min) | Bedrock extraction with citations on `DD24` vs gold clauses; pdf.js text match | working | ≥ 90% of class/frequency/deductible/max fields correct with page; else manual entry primary |
| M1 Thread demo (by Sat 23:00) | sign-in; Harborview preset; typed estimate; Page with stitches; Ledger; Clause card; both directions; Rule Table | working (presets cached) | 90-second demo runs on phone and laptop with the fixture totals |
| M2 Scenarios and states | ≤3 scenario rails; Differences row; order note; ranges; conflict view; unsupported-rule line | working | acceptance checks 1–5 |
| **M2b Presets and comparison (v2)** | preset partition + GET-only API + search; seed `HB26`, `DD24`, `ML26` via pipeline + confirm against gold quotes; scoped stitches everywhere; Comparison grid (phone topic-first, desktop table); paired Clause card; per-plan inputs panels; three Ledgers; premium row; eligibility banner | working; catalog content is manual seeding | checks 7–12; grid cells trace to the right document in CI |
| M3 Privacy and isolation (by Sun 03:00) | owner checks; 404 policy; audit; presigned expiry; redaction preview; delete/export; Privacy Panel; injected fixture; lint; preset write rejection | working | cross-account demo live |
| M4 Live upload | upload → extraction → confirm → compare against presets | working if M0 passed | optional live demo |
| M5 Accessibility | keyboard model; live region; contrast; Rule Table parity (incl. Plan column); reduced motion | working | keyboard-only demo |
| M6 Notifications (last) | opt-in toggles; quiet hours; simulated clock; generic lock-screen text; plan-scoped detail | **simulated scheduler** | one reminder fires with linted text |
| Packet | description, architecture, storyboard, security write-up, licensing-cost note, video | — | submitted by 09:30 EDT |

Not built: insurer eligibility/claims connections, FAIR Health pricing, CDT catalog, free-form chat, any premium or rule not printed in a stored document.

---

## 7. Demonstration (synthetic member; one tested fixture)

**Fixture (`experiments/comparison_fixture.py`, 7/7 checks passed 2026-10-03):** member Sam Rivera (fictional); estimate from Northside Dental Group (fictional), dated 2026-10-03: porcelain/ceramic crown tooth #30, quoted $1,200; two-surface posterior composite tooth #19, quoted $300. Harborview Dental PPO 2026 (fictional): deductible $50 individual waived for Class I (§4.1 p.6); Class I 100% / Class II 80% / Class III 50% (schedule p.5); annual maximum $1,500 (§4.3 p.6); alternate benefit — porcelain crown on a molar paid on the full-cast-metal allowance (§6.2 p.9); fee schedule appendix — porcelain crown $1,000, cast crown $800, two-surface posterior composite $200 (Appendix A p.13); no waiting periods (§3 p.4); out-of-network paid on the same allowed amount, dentist may bill the difference (§7 p.10); employee-only premium $31.00/month (rate sheet p.2). Sam's statement 2026-09-15 (entered): remaining deductible $50; remaining annual maximum $800; in-network.

**Core demo (90 s).**
- **0–15 s — the collapse.** "Sam's plan: fourteen pages." Add the estimate → the pages dim; seven stitches stay lit. "Seven sentences apply to these two procedures."
- **15–35 s — one confusing clause.** Tap the Ledger line *Alternate basis $800 `HB26 ⑨`* → the Page scrolls to §6.2; depth 1: "When a porcelain crown is placed on a molar, the plan pays on the price of a metal crown." Depth 3: exact wording, page 9, and the arithmetic: $800 − $50 deductible = $750; plan pays 50% = $375; you pay $375 + $50 + the $200 difference between the $1,000 allowed amount and the $800 basis = **$625** for the crown; the $200 network adjustment is not owed. "Nothing is paraphrased away — the exception is right there: molars."
- **35–55 s — a user-controlled change.** Duplicate the scenario → *Network: Out*. Rails: in-network **$665** / out-of-network **$965**. Differences row: "Scenario 2 patient estimate is $300 higher: amounts above the allowed amounts ($200 + $100) may be billed out-of-network `HB26 ⑫`." No color favors either.
- **55–75 s — honest missing data.** Clear the deductible entry → the slot reads `∅ Not provided`; the total becomes "between **$640 and $665** — because remaining deductible was not provided." Toggle *Try a hypothetical* → an empty field appears with "$50 — plan deductible" shown as a reference; enter 0 → `~ Assumed`, total $640.
- **75–90 s — source and safety.** Tap Plan Card *Annual maximum `HB26 ③`*: "The most the plan pays in a benefit year — it limits what the plan pays, not what you can owe." Privacy Panel: the redacted text the model received; the delete button. "Every number is stitched to a sentence. The user makes every decision."

**Comparison beat (40 s, inside the 5-minute pitch).** *Compare* → add `DD24` and `ML26` (Harborview stays first; the user's order). Grid row "Waiting periods": Harborview "none `HB26 ③`" · Delta "12 consecutive months for restorative, endodontic, periodontic and prosthodontic services `DD24 ⑤`" · MetLife "`∅` not stated in the pages read". Tap the Delta cell → paired card, depth 3 shows the three excerpts side by side. Scroll to "Same estimate, each plan": Harborview **$665 / $535**; Delta "**Unresolved** — not provided for this plan: allowed amounts, network status, enrollment date, usage"; MetLife likewise. Enter hypotheticals for Delta (allowed = charge, no benefits used, in-network, enrolled 24 months) → "patient at least **$685**, plan at most **$815** — the alternate allowance for a molar crown is not stated in this document `DD24 ⑨`"; change enrollment to 6 months → "not covered: waiting period `DD24 ⑤` — patient $1,500". Premium row: Harborview $31.00/month (fictional); Delta `∅` (not in EOC); MetLife `∅` (table in the 2026 guide, not yet extracted). Closing line: "Three plans, same estimate, every difference traceable — and the app never says which to choose."

**Scenario S3 (reserve):** crown on tooth #4 (premolar) → alternate benefit does not apply → patient **$565**, plan **$635**; Differences: "$100 lower patient estimate: the alternate-benefit clause `HB26 ⑨` applies to molars only."

---

## 8. Acceptance checks (synthetic)

1. **Missing benefit usage.** No usage → `∅` slots; labeled range with the cause; hypothetical field empty with a reference value; no default to the full maximum.
2. **Conflicting documents.** `ML26` guide vs `ML20c` certificate disagreeing on a field → both excerpts with dates and `⇄`; range "because sources disagree"; the user picks (`✎`); no silent choice.
3. **Unsupported policy rule.** An out-of-network percentile basis with no schedule → `Limitation` line with the quote; total "at least $X (in-network basis)".
4. **Multi-procedure estimate.** Ordering check as in §3.2; order printed; equality or difference stated.
5. **Advice-seeking question.** "What should I do?" → template; 0 lint hits; no scenario or plan emphasized.
6. **Cross-account access.** Three 404s (document, estimate, comparison set) with constant bodies; audit events with ids only; expired link fails.
7. **Comparison traces to the correct source (v2).** CI iterates every grid cell and Ledger step across `HB26`, `DD24`, `ML26`: `citation.doc_sha256` equals the column's stored document; the excerpt is found on the cited page; 0 failures. Manual: tapping `DD24 ③` never opens an `ML26` or `HB26` sentence.
8. **Missing inputs stay visible per plan (v2).** With Sam's Harborview inputs entered, Delta's and MetLife's input panels remain `∅` and their Ledgers read "Unresolved — not provided: …"; no value from Harborview appears in another column; no copy control exists.
9. **One consistent fixture (v2).** The totals in §7 ($665/$535; $965; $640–$665; $565/$635; Delta ≥ $685 / ≤ $815; Delta 6-month $1,500/$0; MetLife $732.50/$767.50) equal `comparison_fixture.py` output in CI; the pitch deck is generated from the same JSON.
10. **Presets read-only (v2).** `PUT`/`PATCH`/`DELETE /presets/*` → 405; a user token cannot write preset partitions (IAM test); preset versions immutable; a comparison stores the version id and shows the "newer version exists" notice without switching.
11. **Scoped stitches (v2).** Resolver key is `(plan_code, doc_version_label, n)`; with three plans loaded every chip shows its scope tag; screen reader announces the plan and document version.
12. **Availability is not eligibility (v2).** Catalog cards and comparison column headers show the quoted eligibility text and the banner; lint has 0 hits for "available to you / you qualify / you can enroll"; `HB26` shows the fictional ribbon in catalog, grid, Ledger and Rule Table.
Also: injected-instruction fixture ignored; keyboard-only completion of the core demo and the comparison beat; Rule Table parity including the Plan column.

---

## 9. Critical review and revisions

**Generic elements.** Upload-and-explain and a benefits comparison table are both familiar. *Revision:* the demo never opens with chat or a table; it opens with the collapse and the thread, and the comparison is shown as three threads pulled at once from one cell — the grid is a doorway to sentences, not a brochure.
**Unsupported claims to avoid.** Extraction accuracy (measure in M0; print it); any compliance status (none; a BAA is required for PHI); model training policy (not stated on pages read); "mobile app" (A1); "zero knowledge" (false — servers and Bedrock read redacted documents transiently); **"these plans are available to you"** (never; availability ≠ eligibility); **MetLife class definitions and premiums** (ambiguous/unknown until confirmed in the certificate and the 2026 guide's table — the catalog says so).
**Possible advice leaks.** Impact-sorted unknowns → table sorted by stitch with an impact column. Pre-filled hypotheticals → empty field with a reference value. Differences rows → templates with both percentages and no adjectives. **Comparison-specific:** a totals row sorted or color-coded would be a ranking → no sorting, no color on totals; "cheapest premium" filters are banned; combined premium + estimate figures only per plan with the period stated; eligibility text beside every availability statement so a listing never reads as "you can get this".
**Confusing interactions.** Six badges → three families with six labels. Two panes on a phone → divider snaps to 100% either way. Depth dial → one-time coach mark. **Comparison-specific:** three Pages at once would overwhelm a phone → one Page at a time with a plan switcher; identical stitch numbers across plans → scope tag always prominent with two or more plans; a long grid → topic-first rows with one expanded at a time.
**Implementation risks.** pdf.js text match on multi-column documents (margin stitch fallback); citations spanning pages; Bedrock latency (presets cached; never live on the critical path); KMS encryption-context plumbing (fallback single key, stated honestly); **seeding time** — `DD24` has gold quotes for 8 fields today, `ML26` has verified numbers but ambiguous class definitions and no premium figure: the seed must record unknowns rather than fill them, and the comparison must look honest with `∅` cells; **fixture drift** — the pitch numbers must be generated from the fixture JSON, not typed into slides (check 9).
**Strongest issue and the concept change it forces.** Comparison is where every other team's product will quietly become a recommender (sorted totals, green checkmarks, "best value"). FinePrint's rule is structural: the grid has no sort, no color on totals and no winner row, each column carries its eligibility quote, and every dollar difference is explained by a stitched sentence — so a judge can see that the comparison informs without steering, which is the thing the brief says must be true of the whole product.
