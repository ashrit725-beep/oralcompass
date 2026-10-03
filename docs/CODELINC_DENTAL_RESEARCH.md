# codeLinc 11 — Path 1 Dental: Research, Differentiation, and Idea Selection

Run: Saturday 2026-10-03, 13:33–14:50 EDT (research + decision 77 min, inside the 60–90 min budget even with the skills workflow added mid-run; build window ≈ 19 h to the Sun 10:00 EDT readiness target). Method: research-mode constraints throughout; multi-agent orchestration (6 Wave-1 workstreams + 1 Wave-2 gap-fill + critic + citation checker, ~500 tool calls); evidence ledger kept in `reports/2026-10-03-codelinc11-dental-idea/` (plan.md, notes/0–6, audit.md, citation_audit.md, sources.md, experiments/). Everything below cites a note file and source tag `[n:S#]`; the notes hold the verbatim quotes, URLs and accessed times.

---

## 0. The recommendation

**Build a rule-aware pre-estimate for the dentist's treatment plan — working title "ClauseCheck" (renamed "FinePrint" in the v2 build brief after the user's seven must-haves; see Addendum).** The employee photographs or types the dentist's treatment plan and selects/uploads their own dental plan document. The AI's only job is to *find and quote* the plan's rules (classes per procedure, coinsurance, deductible scope, annual maximum, benefit-year type, waiting periods, frequency limits **with clock type**, alternate-benefit clause, missing-tooth clause, out-of-network basis) with page-cited passages the employee confirms or corrects. A **deterministic engine** then prices each procedure as a **range over the things the document cannot know** (remaining maximum, deductible met, service history, enrollment date, carrier date-of-service rule), **ranks those unknowns by dollar impact** so the employee knows the one or two things to confirm, and lays the plan on a **benefit-year timeline** that moves dates only within dentist-stated windows and says "timing changes nothing" when it doesn't.

**Distinctive mechanism:** document → cited rule model → per-procedure exception application → interval cost with value-of-information ranking → conditional, clinically-bounded sequencing. Each piece exists somewhere (Open Dental computes downgrades and frequency clocks for office staff; generic PDF-Q&A apps cite pages; carrier estimators price one procedure at a time behind a login), but no patient-facing dental tool found in 27 products plus a targeted Wave-2 search combines them `[3:gaps a–e][6:TL;DR]`.

**Strongest evidence:** (1) the surprise-bill mechanism is the plan's exception layer, and the office's own estimate math does not apply it — Dentrix desktop computes "deductible → payment table → coverage table" only; frequency, waiting and downgrades are notes or manual overrides `[2:S14,S15][6:F2]`; (2) real plans differ structurally, not cosmetically — endodontics/periodontics are **Major** under Delta MS State and Lincoln Iredell but **Basic** under MetLife NCFlex and Guardian; "twice in a Calendar Year" vs "every six months" are different clocks; Delta MS State imposes a 12-month wait on restorative/endo/perio/prostho `[1:variation table]`; (3) a deterministic prototype of the engine reproduced 19/19 hand-derived expected values, including a case where the "two annual maximums" advice is wrong by $25 and a case where the top unknown is enrollment date, not the maximum (§8).

**Main unresolved risk:** extraction accuracy of the cited rule model on real certificates was *not measured* in this run (no API access from the sandbox). Published LLM policy-reading accuracy is 0.82 vs 0.87 for rule-based pipelines `[5:S17]`. The design mitigates this (quote-and-confirm loop, deterministic math, "not a guarantee" framing), and the first validation action at the venue is a 15-minute extraction test on the three open FEDVIP brochures against the gold rule sets in `notes/1-plans.md`.

Fallback (if extraction-confirmation is not stable by Sat 23:00 EDT): **F1-lite** — typed plan parameters via a form, same engine, same ranges and ranking, same timeline. The research shows the value survives without the conversational/LLM layer (§7.3).

---

## 1. Verified challenge brief and material source conflicts

The dental prompt itself ("Build an AI Tool to Simplify the Dental Benefits Selection Process"; outcomes A–C; three bonus features) appears only in the on-site opening deck, which was **not attached to this run** and is not on Devpost `[0:C7]`. The brief in the master prompt is treated as the authoritative transcription. `tinyurl.com/codelinc11dental` resolves to Lincoln's public member education site (Fluent content) — no problem statement `[0:B9]`; `tinyurl.com/codelinc11dentalvideo` resolves to a Lincoln "Engagement Viewer" page that returned a server-error message on two attempts `[0:A]`.

| Item | Status | Content (verbatim where quoted) | Source |
|---|---|---|---|
| Core outcomes A, B, C; bonus features | **Explicit (deck, as transcribed by user)** | Describe planned procedures + plan; explain language as likely coverage/cost; sequence care across the plan year; track max; in/out-of-network; expiring-benefit reminders | master prompt |
| Judging criteria | **Explicit** | 10 criteria, no weights: UI & Intuitiveness; Functional Requirements & Impact ("Does it solve a real problem?"); Solution Design & Innovation; Demonstration and Presentation; Does it Work? ("significantly more weight is placed on the core functionality than on supporting / tangental items such as login/registration/password reset"); Technology Platform(s); Security Accommodations ("no need to or much value in developing a login / password authentication capabilities from scratch"); Technical Creativity; Architecture & Methodology ("storyboarding or other roadmapping"); Complexity ("not be more complex than necessary") | `[0:S0a]` |
| Presentation length | **Explicit** | "Teams will have no more than 5 minutes to present their projects" | `[0:S0a]` |
| Demo start | **Explicit** | "Participants must be available to demonstrate their application starting at 10:30 a.m. EST on October 4, 2026" | `[0:S0a]` |
| Submission cutoff | **Conflict** | Body: "By 10:30 a.m. EST October 4, 2026"; Devpost header/schedule: "Oct 4, 2026 @ 11:00am EDT"; literal EST→EDT = 11:30. **Interpretation: treat 10:30 EDT as the hard cutoff; 10:00 EDT readiness target stands.** | `[0:C1]` |
| Entry contents | **Explicit** | "the mobile application, a link to the working source code, the application login credential, a written description and a brief demonstration" | `[0:S0a]` |
| "Mobile development project" | **Conflict / interpretation** | Required by text since 2019; codeLinc 10's 1st–3rd were web stacks (React/Vite, TypeScript/Lambda, React/Spring Boot); the Flutter app took the Technical Innovation Award. **Interpretation: responsive, phone-first web app satisfies practice; a phone-capture moment should be real.** Coach question #4. | `[0:C6,D]` |
| Team size | **Explicit** | "all teams will include 3-8 people" | `[0:S0b]` |
| Challenge window | **Conflict** | Rules: "from 10:30 p.m. Eastern Standard Time ("EST") on October 3, 2026 until 2:00 p.m. EST on October 4" (10:30 p.m. is almost certainly a typo); Devpost: submissions open 11:30am, winners 12:00pm | `[0:C2]` |
| Nonprofit wording | **Unknown** | Rules: "A non-profit entity will present the Participants with a current challenge"; Entry "becomes the sole property of their corresponding non-profit organization"; the dental resource is a Lincoln commercial property. Who "the organization" is for criterion 5 is unstated. | `[0:C7]` |
| Third-party code / licensing | **Explicit** | "should not contain any third-party proprietary code"; "components or plugins incurring future licensing costs ... must be prominently documented" → document Bedrock/Claude API usage costs; do not ship a CDT catalog (ADA license) | `[0:S0a][4:S6]` |
| Login credential | **Conflict** | Required in packet vs criteria 5/7 de-emphasizing auth → ship a demo account on a hosted auth (e.g., Cognito) or a passcode; spend no time on auth UI | `[0:C9]` |
| Prizes / judges | **Explicit** | $5,000 / $2,500 / $1,500 / $1,000 TIA; judges include AWS Principal SA and two Lincoln divisional CIOs | `[0:B5,B6]` |

**Remaining time (EDT):** research/decision closed 14:50 Sat. Build window Sat 15:00 → Sun 09:00 (18 h) with 1 h buffer to the 10:00 readiness target and 30 min to the conservative 10:30 cutoff; includes ~5 h sleep/breaks for a student team. Schedule in the build brief.

**Essential questions for an on-site coach (do not block on them):** exact cutoff and channel (Devpost form vs email); whether "mobile" is enforced literally; whether "brief demonstration" means a recorded video; who "the organization" is for the dental path and whether "selection" means enrollment-time plan choice or using the plan; whether a copy of the dental video exists; demo-account expectation; any restriction on third-party AI APIs `[0:E]`.

---

## 2. Research coverage matrix and source ledger

**Workflow actually run (user-requested skills):** research-mode (standing constraint) → multi-agent-research orchestration (plan.md; 6 researcher dispatches with the dr-subagent-researcher role; critic; citation checker) → research-bible's five differentiated strategies mapped onto the workstreams (primary/grey-literature = plans; practitioner/community = users; real-time/industry = competitors; documentation/official = tech; contrarian = devil's advocate) → docs-first tagging ([official]/[secondary]) → matrix-research items × fields for the competitor matrix (`matrix/outline.yaml`, `fields.yaml`) → advanced-research reflection loop (gap analysis → Wave 2 → contradictions → confidence grades) → comprehensive-research Chain-of-Verification critic → evidence-ledger by hand (`sources.md`, claims in `decision_draft.md`, audit). Not run as designed: academic-search (Semantic Scholar/PubMed APIs blocked by the sandbox proxy, 403; Crossref fallback via WebFetch rate-limited, 429 — an outage, not a result); interactive Co-STORM (unattended run; its perspective-discovery step was used non-interactively in §3/§5).

**Counts (from `citation_audit.md`, paper audit of the seven notes):** ≈155 unique URLs listed, the large majority read in full or in part by the agents; 83 tagged T1 primary/official; ≥40 distinct publishing organizations (carriers, ADA, NADP, CareQuest, KFF, CMS, FTC, OPM, two state Medicaid programs, NC OSHR, three employers, Open Dental, Henry Schein, four RCM vendors, FAIR Health, Stedi, Anthropic, AWS, Devpost, arXiv authors, Health Affairs). Every note lists its failed fetches explicitly (Reddit site-blocked; Guardian FAQ and MetLife-hosted PDF robots-blocked; JADA 403; NADP utilization report paywalled; Lincoln's logged-in estimator unreadable; Isaac/Dental AI:Assist app pages 429).

**Access limits disclosed:** the sandbox blocked `curl` to PDF hosts, so every certificate was read through WebFetch's extraction layer — two extraction errors were caught (NCFlex 2025 summary table columns scrambled; Aetna "Recognized Charge" formula garbled) and are excluded from any claim `[1:Conflicts 1,5]`. Logged-in carrier estimators (Delta, MetLife, Cigna, Guardian, Lincoln) could not be observed; statements about them rest on the carriers' own flyers/FAQs. No Lincoln *certificate* was found — Lincoln evidence is two employer at-a-glance summaries (Iredell County NC), the June-2020 product flier (dated; verified still marketed via an April-2025 member-tools flyer and Oct-2026 press materials naming "group protection" as a core business) `[1:C]`.

### Coverage matrix

| Area | Target | Achieved | Effect on confidence |
|---|---|---|---|
| A. Challenge evidence | brief, rules, rubric, updates, contradictions | Devpost overview/rules/updates/schedule read (8 passes); 11 contradictions logged; deck and video unavailable | Medium: outcomes A–C taken from user's transcription |
| B. Plan evidence | ≥3 documents, materially different, one certificate, Lincoln preferred | 7 primary documents, 6 carriers; one full EOC (Delta MS State 2024), two MetLife certificates (truncated), Lincoln summaries + fliers, Aetna booklet, Guardian summary + rollover flyer, Cigna guidelines; 3 FEDVIP 2026 brochures opened as fixtures | High for variation claims; Medium for MetLife clause text |
| C. User-problem evidence | ≥5 distinct accounts + primary prevalence | 13 accounts (7 practitioner-authored, 6 patient posts), CareQuest/NADP/ADA HPI/KFF primary data; laundering traced for "$880 unused" and "<3% hit max" | High that the pain exists; prevalence contested (12% self-report vs 2.9–3.4% claims) |
| D. Competition evidence | ≥8 products; 3 closest reconstructed | 27 products + Wave-2 (Open Dental downgrades/frequency, Dentrix Ascend, UHC provider calculator, dentalcostestimate.com, PDF-citation apps); 3 reconstructions | Medium: absence claims bounded by unobserved logins |
| E. Technical evidence | verify central dependencies, read official docs, run experiment | FAIR Health ToU, ADA CDT licensing, Stedi docs/pricing/changelog, Anthropic PDF+Citations, AWS Bedrock, OPM brochures, NC Medicaid fee rows verified; engine experiment 19/19 | High for data posture; extraction accuracy **unmeasured** |
| F. Counterevidence | ≥1 serious counterargument per finalist, disconfirming searches | Contrarian note (M1–M6, 8 disconfirming searches listed) + critic audit (6 material objections, all addressed in §6) | High |

### Decisive-claims ledger (the claims the recommendation stands on)

| # | Claim (scope) | Source & location | Publisher / origin | Date (pub → accessed) | Status | Limitation / conflict | Consequence |
|---|---|---|---|---|---|---|---|
| 1 | Dentrix desktop estimates = deductible on first procedure + payment table + coverage %; frequency/waiting/downgrades not in the method; downgrades handled by manual "Paid" column or override | Dentrix Help "Calculating insurance estimates" `[2:S14]`; Novonee `[6:F2]` | Henry Schein One (official help); Dentrix trainer | n.d. → 2026-10-03 (re-fetched by critic: MATCH) | Verified | Dentrix Ascend computes frequency/downgrade/age exceptions but waiting periods "for reference purposes only" `[6:F2]`; Open Dental computes all three | Office baseline is uneven; patient never sees the rule text |
| 2 | Carrier member estimators price one procedure against plan design; Delta's deltadentalins tool shows "the amount Delta Dental pays for the procedure (not including maximums, deductibles or out-of-pocket limits)" and gives an out-of-pocket estimate for some affiliates (NJ/CT/ID); MetLife: "This tool does not provide the payment information used by MetLife when processing your claims" | `[3:S1,S5,S15][6:F3][5:S5]` | Delta Dental, MetLife (official) | 2022–2026 → 2026-10-03 | Verified (phrasing corrected after critic) | Logged-in behavior unobserved; remaining-max use UNKNOWN | Our difference is cross-carrier, multi-procedure, cited rules, ranges — not "carriers ignore deductibles" |
| 3 | No dental cost tool found that (a) sequences across benefit years for the patient, (d) accepts the dentist's written plan as a document, (e) cites the plan passage; (b)/(c) exist office-side | `[3:gaps][6:F1,F4,F5]` | 27 first-party product pages | → 2026-10-03 | Verified as absence-in-materials-reviewed (not proof) | Generic PDF-citation apps exist (medical, no math) `[6:F5]`; logged-in tools unobserved | Distinction gate = PROVISIONAL |
| 4 | Plan rules vary structurally: endo/perio Major (Delta MS, Lincoln Iredell) vs Basic (MetLife NCFlex, Guardian); frequency clocks differ in kind; Delta MS 12-month wait; NCFlex Low "100% after deductible" on preventive; OON basis differs (Program Allowance / R&C 70th–90th / FAIR Health 95th / UCR) | `[1:per-document + variation table]`; re-fetched Delta EOC and NCFlex 2026 guide today (MATCH) | Carriers/plan sponsors (official) | 2017–2026 → 2026-10-03 | Verified | Read through PDF extraction layer; MetLife clause bodies truncated | Tool must read *this* plan; hard-coded 100/80/50 is wrong |
| 5 | Date of service for multi-visit work: payment practice uses completion/cementation (Delta NJ; Delta AZ claim tips; LA Medicaid; Cigna); certificates' "incurred at preparation" clauses sit under Continuation of Benefits (termination liability); ADA CDBP only "encourages" prep date | `[1:§DOS][4:S35,S37]`; Delta EOC re-fetched: sentence is under "Continuation of Benefits" | Delta Dental, ADA, state Medicaid (official) | 2018–2023 → 2026-10-03 | Verified (scope corrected after critic) | No national rule | Engine default = completion date; prep-date is a labeled scenario; Dec-prep/Jan-seat lever shrinks |
| 6 | Patients experience surprise bills from exception rules (inlay paid as amalgam; deductible on a "100%" cleaning; "accepts insurance" ≠ in-network; implants paid at bridge/partial allowance); predeterminations take 2–4 weeks and are "not a guarantee" | `[2:accounts 1–13; S9–S11, S21]` | Forums (T3), consumer sites (T3), named practitioners (T2) | 2010–2026 → 2026-10-03 | Verified as observed pain (not prevalence) | 6/13 are T3; 3 are 2010–2013 | Problem is real; size it with #7 |
| 7 | Prevalence: 12% of insured adults say they reached/exceeded the max and 46% of those stopped treatment (CareQuest, n=9,450); carrier claims data: 2.9% (NADP 2024) / "less than 5%" / 3.4% + 3.3% within $100 (ADA HPI via ADA News); cost is the top barrier (11.4% "could not afford" vs 3.0% "insurance did not cover"); 53.1% of privately insured adults visited a dentist in 2022 | `[2:S12,S13,S17,S18][5:S12,S13,S15]` | CareQuest/NORC; NADP; ADA HPI | 2019–2026 → 2026-10-03 | Verified; **contested** across methods | Self-report vs paid-claims; "$880 unused" is vendor arithmetic — not used | Sequencing is a minority lever; affordability dominates; honest "who this doesn't help" |
| 8 | Claude PDF support 32 MB / 600 pp (100 pp below 1M context); citations return `page_location` with 1-indexed start/end pages and `cited_text`; "Citations cannot be used together with structured outputs"; available on Amazon Bedrock (Invoke/Converse, since 2025-06-30) | `[4:S22–S25]`; citations page re-fetched today (MATCH) | Anthropic, AWS (official) | 2025–2026 → 2026-10-03 | Verified | Two-call pattern needed (cite, then structure) | Architecture decision |
| 9 | Not usable in the prototype: FAIR Health consumer data ("solely for personal, consumer use"; no scraping; no commercial use; license via info@fairhealth.org); CDT codes ("requires a valid commercial user license"; 2–4 weeks); no carrier member APIs; CMS Patient Access API excludes employer dental | `[4:S3,S6,S7,S20]` | FAIR Health, ADA, CMS (official) | → 2026-10-03 | Verified | CDT fees unpublished | Fees = labeled fixtures/Medicaid floor; D-codes only from the user's own document |
| 10 | Stedi offers a free test-mode eligibility API with dental mock payers (Ameritas, Anthem BCBSCA, Cigna, MetLife, UHC) incl. a CDT-code mock; responses carry `benefitAmount` with `timeQualifierCode` 29 = Remaining; "Mock requests are free ... won't incur any charges"; "No monthly minimum" | `[4:S11–S15]` | Stedi (official) | 2026-05-14 changelog → 2026-10-03 | Verified (docs; not exercised live) | No custom mock data — fixed values must drive the scenario | Honest "remaining max" integration demo |
| 11 | LLM policy reading is error-prone (0.82 accuracy vs 0.87 rule-based; best insurance-exam LLM 78.68%); liability/regulatory exposure (Moffatt v. Air Canada; NAIC AI bulletin in 24 states; FTC HBNR for non-HIPAA health apps) | `[5:S17–S20,S29]` | arXiv preprints; ABA; Quarles; FTC | 2024–2026 → 2026-10-03 | Verified (indirect: no study on US dental certificates) | Mixed benchmarks | Quote-and-confirm loop; deterministic math; disclaimers |
| 12 | Every codeLinc 10 winner (2025) was an AI benefits chooser/explainer; identical rubric since 2019 | `[0:D]` | Devpost (official) | 2025 → 2026-10-03 | Verified | — | Generic "AI benefits chatbot" is table stakes |

---

## 3. Employee problems and the insights that changed the decision

### 3.1 Journey breakdowns (treatment recommendation → interpretation → estimate → feasible choices → timing → claim outcome)

| # | Where | User & trigger | Decision | Has / lacks | Current workaround | Consequence | Evidence | Software can help in 20 h? |
|---|---|---|---|---|---|---|---|---|
| 1 | Interpretation | Employee reads "100/80/50" card after a root canal is recommended | Is a root canal 80% or 50%? | Has summary; lacks class list (endo is Major at Delta MS/Lincoln, Basic at MetLife/Guardian) | Ask front desk | Estimate off by 30% of fee ($366 on a $1,219 RCT) | `[1:A,B,C,E]` | Yes — class extraction with citation |
| 2 | Estimate | Office quotes porcelain crown/inlay; plan pays "customary" alternative | Accept estimate? | Lacks alternate-benefit clause | None; learn from EOB | $800 surprise (inlay vs amalgam) `[2:#2]`; crown paid on cast-metal allowance `[1:A]` | `[2:S2][1:Att.B Lim.1]` | Yes — downgrade rule per tooth |
| 3 | Estimate | Cleaning billed with deductible on a "100%" service | Pay or grieve? | Lacks deductible-scope rule (NCFlex Low applies it to preventive) | Grievance | $153 bill, refund after dispute `[2:#4]` | `[2:S5][1:B]` | Yes — deductible scope per class |
| 4 | Estimate → claim | Treatment exceeds remaining maximum mid-plan | Proceed, pause, pay cash? | Lacks remaining max (used + pending) | Call insurer; office breakdown | 46% of max-hitters stopped treatment `[2:S12]` | `[2:S12,S13]` | Yes — range + "confirm remaining max" |
| 5 | Timing | Crown in December or January | Which year pays? | Lacks carrier DOS rule (completion vs prep) and benefit-year type | Office folklore | Claim "lands in next year's benefits anyway" `[5:S1]` | `[1:§DOS][4:S35,S37]` | Yes — scenario toggle; completion default |
| 6 | Timing | Second cleaning planned 4.5 months after the first | Covered? | Lacks clock type ("twice in a Calendar Year" vs "every six months") | Office checks | $107 denial or needless wait | `[6:F6][1:variation]` | Yes — next-eligible date |
| 7 | Feasible choices | New enrollee needs crown; plan has 12-month wait on restorative/endo/perio/prostho | Treat now at full fee or wait? | Lacks waiting-period rule and own enrollment date | Office verification call (5–30 min) | Full fee or delayed care | `[1:A Att.A p.2][2:S16]` | Yes — enrollment-date unknown ranked |
| 8 | Network | Dentist "accepts" insurance but is out of network; plan pays Program Allowance/R&C percentile | Stay or switch? | Lacks OON basis and balance-billing rule | None | Paid ~30% of a $5,000 bill `[2:#1]` | `[2:S1][1:A,B]` | Partial — needs OON fee assumption (labeled) |
| 9 | Feasible choices | Missing tooth before enrollment; implant proposed | Implant vs bridge? | Lacks missing-tooth clause and implant exclusion/credit | Biller verifies from provision doc | Implant paid at bridge/partial allowance `[2:S21]` | `[1:A Excl.34, D p.10, E]` | Yes — exclusion/credit rules |
| 10 | Claim outcome | Predetermination 2–4 weeks, "not a guarantee" | Wait or proceed? | Lacks any instant rule-aware preview | Wait | Postponed/cancelled care `[2:S10]` | `[2:S9–S11][3:S14]` | Yes — instant preview positioned between office math and carrier predetermination |

**Benefits logic verified (never assume):** deductible applies to Basic/Major, waived for preventive in 4 of 5 plans but not NCFlex Low; coinsurance 100/80/50 is only a center of gravity (25%–100% Basic/Major observed); annual max $1,000–$5,000 and preventive counts toward it under MetLife NCFlex (optional SmileRewards exempts it at Lincoln); benefit year is calendar in all read documents but policy-year and rolling-year plans exist `[5:S10]`; frequency clocks differ in kind; waiting periods exist (Delta MS) or are late-entrant only (Lincoln Iredell); deductible carryover (last 3 months) and max rollover (Guardian $700/$350/$1,250; Lincoln MaxRewards) are optional; **no adult plan read has an out-of-pocket maximum** — the annual maximum is the insurer's payout cap, not the patient's `[1:variation table]`. Personalized estimates additionally need: remaining max (used + pending claims), deductible met, service history per code/tooth, enrollment date, network status and contracted fee, and the carrier's DOS rule — none are in the brochure `[3:B1][2:C]`.

### 3.2 Insights (observed fact → evidence → why it matters → current limitation → opportunity → uncertainty → falsification test)

1. **The surprise bill lives in the exception layer, and the office's math skips it.** Dentrix desktop computes deductible/payment table/coverage %; frequency, waiting, downgrades are notes/overrides `[2:S14][6:F2]`; patients meet the gap at the EOB `[2:#2,#4,#5]`. → Opportunity: apply exceptions per procedure before treatment, with the clause shown. Uncertainty: how often exceptions bite (no prevalence data). Falsification: if Open Dental/Dentrix Ascend output routinely reaches patients with the rules explained, the gap is smaller than the accounts suggest.
2. **Plans differ in kind, so the tool must read *this* plan.** Endo/perio class flips; clock types; waiting periods; deductible scope `[1]`. → Opportunity: cited extraction instead of assumptions; it also makes "which option fits this treatment plan" computable (C7 in §8: the same plan costs $1,592.70 under Delta MS High vs $1,515.00 under NCFlex Classic because endo is Basic at MetLife). Falsification: extraction accuracy < ~90% on class/frequency fields on the three brochures.
3. **The brochure cannot know three numbers, and the carriers' disclaimers are about exactly that.** Remaining max, deductible met, history `[3:A1,A2][6:F3]`. → Opportunity: compute ranges and rank unknowns by dollar impact; show the range collapsing after ≤2 confirmations (C8: [1,513–2,673] → [1,973–2,673] → $1,973). Uncertainty: users may still not obtain the numbers. Falsification: a carrier member tool observed showing history-aware per-procedure warnings.
4. **Two date-of-service rules coexist and the honest default is completion.** Certificates' "incurred at preparation" clauses govern termination liability; payment practice uses cementation/completion `[1:§DOS][4:S37]`. → Opportunity: a scenario toggle rather than a claim; it also means "prep in December to use this year's max" is usually wrong — a trust-building correction to common folklore `[2:#3]`. Falsification: a carrier EOB/claim rule that pays crowns on prep date (ADA encourages it; none found).
5. **Sequencing across benefit years is a minority lever and must be conditional.** <5% reach the max `[5:S15]`; Aflac already publishes the advice `[5:S32]`; deductible renews; frequency clocks and waiting periods are commoner timing drivers `[audit]`. → Opportunity: the sequencer triggers only when insurer-share > remaining max, moves dates only inside dentist windows, and otherwise says "timing changes nothing" (C6). Experiment: waiting helps only if 2026 remaining < $1,110 in the demo plan; with ample max it is $25 *worse* (C3b/C3c). Falsification: none needed — this insight narrows our own claim.
6. **Affordability, not confusion, is the dominant barrier; 47% of insured adults don't visit.** `[5:S12,S13]` → Consequence: the product helps the employee *holding a treatment plan*; it does not fix affordability, and the "unused benefits" bonus must never read as a year-end upsell. Falsification: n/a (positioning).

Insights 1–3 changed the choice (away from a timing-first "DentalPilot"); insight 4 changed the core interaction (scenario toggle, completion default); insight 5 eliminated a misleading calculation; insights 2–3 create the visible demo (naive card vs rule-aware range).

---

## 4. Competitor matrix and closest-alternative analysis

Condensed from 27 products `[3]` plus Wave 2 `[6]`; full matrix with quotes in `notes/3-competitors.md`.

| Product | Target user | Verified workflow | Inputs / access | Useful capabilities | Documented limitations | Unknowns | Evidence |
|---|---|---|---|---|---|---|---|
| Delta Dental Cost Estimator + member portal | Member/public | Procedure + ZIP + network → fee range; logged-in (NJ/CT/ID) → out-of-pocket per procedure; "Benefits usage" | Login for plan-aware output | Network comparison; usage view; dentist-submitted pre-treatment estimate (2–3 wk) | "estimates only ... not a guarantee"; aggregated data; displayed amount excludes maximums/deductibles | Remaining-max use | `[3:S1,S14–S16][6:F3]` |
| MetLife MyBenefits estimator | Group member | Procedure + network → "what's covered and the amount ... out-of-pocket"; shows deductibles, frequency limits, maximums | MyBenefits login | Plan-design aware | "does not provide the payment information used by MetLife when processing your claims" | History use | `[3:S5]` |
| Cigna myCigna estimator | Member | 400 procedures; "specific to your plan"; footnote: "national average of a standard Cigna Dental 1500 plan" | Login | Network comparison | Internal contradiction on plan-specificity | — | `[6:F3]` |
| Lincoln DentalConnect tools (go2dental) | Lincoln member | Login → plan details, claims, "estimate the cost of a procedure", ask a dentist | Login; not DHMO | Same vendor as Humana's fee-range tool (inferred) | — | Plan-specificity | `[3:S8–S10]` |
| Humana / FAIR Health consumer | Public | ZIP + procedure → geographic range | None | Uninsured/OON vs in-network price | "not exact coverage amounts"; FAIR Health: personal use only | Results page | `[3:S11,S26–S28][4:S3]` |
| Open Dental | Office staff | Codes + benefits + history → Fee/Ins/Pat; "Remaining = Max − (Used + Pending)"; flags annual max/waiting/frequency; substitution-code downgrades; clock types Calendar Year / NumberInLast12Months / Months | Practice license; staff-entered benefits | The complete rule engine, office-side | No citation to plan text; no range; printout only | Patient-facing explanation | `[3:S2–S4][6:F1]` |
| Dentrix / Ascend / Eligibility Pro | Office staff | Coverage/payment tables → estimate; Ascend exceptions (frequency, downgrade, age); Eligibility Pro returns "frequency limitations ... remaining benefits" | License + subscription | Caps at annual max (global setting) | Waiting period "for reference purposes only"; desktop needs manual overrides | — | `[3:S17–S19][6:F2]` |
| UHC Dental treatment-plan calculator | Providers | "factors in your fee schedule, current patient history, benefit plan limits" | Provider login | Closest functional analog | Provider-only, single carrier | — | `[6:F3]` |
| Zuub / Vyne Trellis / pVerify / Dental Intelligence / Weave | Practices, vendors | Eligibility + benefit breakdowns via API/RPA | B2B contract | Remaining benefits, frequencies | No patient output | Fields | `[3:S20–S24][4:S16–S18]` |
| Stedi (infrastructure) | Developers | 270/271 with dental mocks; `timeQualifierCode` 29 Remaining | Free test key | Honest "remaining max" integration | Fixed mock values | — | `[4:S11–S15]` |
| dentalcostestimate.com | Consumer | Typed code, fee, allowed, deductible remaining, max remaining, network, limitation → point or national range | None | Nearest consumer calculator | Reads no documents; user decides which limitation applies; range = price, not plan state | Publisher | `[6:F4]` |
| ALEX / Nayya / Healthee / HealthJoy / Sofia / Collective Health | Employees | Enrollment decision support; medical cost/claims help | Employer | Benefits Q&A | No dental procedure-level estimate found | Dental depth | `[3:S33–S38]` |
| PDF-citation Q&A (deeps45 demo; PolicyZen) | Consumer | Upload policy → Q&A with page citations / extract limits | None | Citations exist in generic form | No cost math; medical | — | `[6:F5]` |
| Prior hackathons | — | No dental-insurance explainer/estimator on Devpost; codeLinc 10: 11 AI benefits choosers | — | — | — | — | `[3:S39–S42][0:D]` |

**Closest alternatives reconstructed** (trigger → inputs → returns → decision → remaining work → private data): (1) Delta estimator → pre-treatment estimate: single procedure, 2–3 weeks for the binding number, member still reconciles against remaining max and timing `[3:§1]`; (2) Open Dental treatment plan: staff enter codes/benefits/history → per-procedure Fee/Ins/Pat with limitation flags → printout; cross-year view needs the "Estimates as of" date changed manually; no plan-language explanation `[3:§2]`; (3) MetLife estimator: single procedure, plan design only, "does not provide the payment information used ... when processing your claims" `[3:§3]`.

**Benchmarks:** a human with the certificate and a spreadsheet can reproduce everything our engine does *if* they find the right clauses (the 76-page NCFlex certificate truncated even our fetcher) — our value is finding, citing and never forgetting an exception; a document-Q&A assistant with a correct calculator answers questions but does not apply rules per procedure, propagate unknowns, or sequence; the closest verified product (Open Dental) does the rule math office-side without citations, ranges, or a patient surface. Label: **a useful combination plus a clearer decision workflow, not a new algorithm.**

---

## 5. Twelve concepts, three finalists, one challenger

Lenses: scheduling, policy interpretation, clarification of unknowns, network, affordability/selection, reconciliation. A/B/C = outcomes covered natively (●) or only via another concept's engine (○).

| # | Concept (user) | Mechanism | Closest alternative → supported difference | A/B/C | AI vs deterministic | Data route | 60–90 s demo | Min scope / dependency | Kill condition |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Certificate chat with citations (any member) | Policy interpretation | PolicyZen/deeps45, ALEX chat → dental, cited | ●●○ | AI answers; no math | Upload PDF | Ask "is a root canal basic or major?" → quoted clause | Claude citations | Judges see codeLinc-10 chatbot redux (12 claims) |
| 2 | **Rule-aware pre-estimate with ranges + ranked unknowns** (employee holding a treatment plan) | Clarification of unknowns + interpretation | Open Dental / dentalcostestimate.com → patient-facing, document-grounded, cited, interval + VOI | ●●● | AI finds/quotes rules; engine computes | Fixtures + manual state + Stedi mock | Card estimate $971 vs rule-aware $1,514–$2,673 → confirm max → $1,973 | Extraction loop + engine | Extraction < 90% on class/frequency fields |
| 3 | Two-year treatment sequencer (max-hitters) | Scheduling | Aflac advice; Open Dental as-of date → optimizer with DOS toggle | ○○● | Engine | Needs remaining max + DOS rule | Drag crown to January → save $410 | Same engine | <5% reach max; completion-date carriers `[5:M3]` |
| 4 | Downgrade/limitation detector (anyone with a quote) | Interpretation | Pre-treatment estimate (2–3 wk) → instant, cited | ○●○ | AI + rules | Fixtures | Porcelain crown on #30 → "paid as cast crown" clause | Rule table | Carriers show per-procedure warnings to members (none found) |
| 5 | Network & balance-billing comparator | Network | Delta compares in/out and 5 dentists `[5:S5]` → cross-carrier | ○●○ | Engine | OON fee assumption (labeled) | Same crown in/out | OON basis extraction | Delta already does it with real fees |
| 6 | Office-estimate reconciler (patient with a quote) | Reconciliation | Carrier predetermination → instant diff with reasons | ●●○ | AI reads quote; engine | Photo of quote | Line-by-line "why $800 higher" | OCR + engine | Carrier estimate is authoritative; ours weaker |
| 7 | EOB → state reconstructor | Unknowns | None found → infers used max/deductible from EOBs | ○○○ | AI extraction | User EOB PDFs | Upload 2 EOBs → remaining max | OCR | Privacy (FTC HBNR); PHI in demo |
| 8 | Option fit — which employer option for this treatment plan | Selection | ALEX/Nayya (enrollment) → procedure-grounded | ●●○ | Engine | Fixtures (NCFlex High/Classic/Low; Lincoln High/Low) | Same plan: $1,593 vs $1,515 | Multi-plan engine | Challenge means utilization, not enrollment |
| 9 | Live remaining-benefits tracker (271) | Tracking (bonus) | Office RCM tools → member-facing | ○○○ | Deterministic | Stedi mock | "Remaining $700" pulled live (mock) | Stedi key | Mock-only honesty |
| 10 | Treatment-option comparator (implant vs bridge; crown vs onlay) | Affordability | Dentist conversation → plan-rule priced | ○●○ | Engine | Dentist-provided options | Implant excluded; bridge 50% | Alternatives in input | Depends on dentist offering options |
| 11 | Question-pack generator ranked by $ | Unknowns | Practice verification checklists → patient, dollar-ranked | ○●○ | Engine | Same as #2 | "Ask your insurer these 2 things; skip the other 4" | VOI | Degenerates to "ask your max" if not shown collapsing |
| 12 | Year planner with frequency clocks + reminders | Scheduling (bonus) | Office recall systems → clock-aware, cited | ○○● | Engine | History dates | "Next covered cleaning: Dec 20 (6-month clock)" | Clock semantics | Users don't know history |

**Provisional finalists:** F1 = #2 absorbing #4 and #11 (one engine, one surface); F2 = #3 absorbing #12 (timing-first, "DentalPilot"-type); F3 = #10 absorbing #5 (feasible-choices lens).

**Targeted research on weakest assumptions (Wave 2 + contrarian):** F1's weakest assumption was novelty — Wave 2 found every rule mechanized office-side (Open Dental downgrades + three clock types; Dentrix Ascend exceptions) and generic PDF-citation apps, but no patient-facing combination `[6]`; improvement: adopt completion-date default and show the range collapsing (critic). F2's weakest assumption was lever size — contrarian found <5% reach the max, Aflac advice, cementation dating, resets, rollover `[5:M3]`; improvement: make sequencing conditional and clock/waiting-driven — which turns F2 into a sub-feature of F1. F3's weakest assumption was that network comparison is unmet — Delta already compares in/out-of-network and up to five dentists with claims-based fees `[5:S5]`; improvement: keep alternate-benefit pricing of dentist-offered options inside F1; drop the network optimizer to a labeled column.

**Challenger (built to beat F1 on demo clarity/innovation):** an interactive plan-year timeline where the employee drags procedures across months and watches remaining max, deductible, frequency clocks and DOS-rule effects update live, with dentist windows as hard rails. Result: it scores higher on demo (5 vs 4) but its value rests on the narrow sequencing lever and it is UI, not mechanism; adopted as **F1's outcome-C screen** (read-only timeline with "what if I move this?" on tap), not as the core.

---

## 6. Gates, scores, sensitivity, and the critic's objections

### Gates (PASS / PROVISIONAL / FAIL)

| Gate | F1 ClauseCheck | F2 Sequencer-first | F3 Option/network comparator | Challenger timeline |
|---|---|---|---|---|
| Covers A, B, C | PASS | PASS (A/B thin) | PROVISIONAL (C weak) | PASS |
| Demonstrable central mechanism | **PROVISIONAL** — engine verified 19/19 on fixtures (§8); cited extraction verified by docs, not run | PROVISIONAL (same engine; DOS rule unknown to user) | PROVISIONAL | PROVISIONAL (UI untested) |
| Obtainable inputs / honest substitute | PROVISIONAL — FEDVIP + Iredell fixtures, typed state, Stedi mock labeled; certificate-in-hand unverified | PROVISIONAL (needs remaining max + DOS rule) | PROVISIONAL (OON fees unavailable) | PROVISIONAL |
| Fits window | PROVISIONAL — cut list and 23:00 checkpoint (build brief) | PASS | PASS | PROVISIONAL (UI heavy) |
| No unsupported clinical/insurance claims | PASS by design (dentist windows; completion default; "not a guarantee") | PROVISIONAL (headline implies delay saves money) | PASS | PROVISIONAL |
| Supported distinction | **PROVISIONAL** — combination not found in 27 products + Wave 2; logged-in tools unobserved | **FAIL** — advice already published (Aflac); Open Dental as-of date; lever <5% | **FAIL** — Delta compares networks/dentists with real fees | PROVISIONAL (interaction only) |

F2 and F3 fail the distinction gate as headlines and are rejected; their defensible parts live inside F1.

### Scores (1–5; proposed weights; evidence/confidence in parentheses)

| Criterion (weight) | F1 | F2 | F3 | Challenger |
|---|---|---|---|---|
| Challenge fit & user benefit (25%) | 5 (A/B/C native; pain evidenced; med-high) | 4 (C strong; med) | 3 (C weak; med) | 4 (med) |
| Working functionality & reliability (20%) | 4 (engine 19/19; extraction unmeasured; med) | 4 (med) | 4 (med) | 3 (UI risk; med) |
| Supported differentiation & creativity (15%) | 4 (combination; VOI; clock semantics; med) | 2 (high) | 2 (high) | 3 (med) |
| Usability (10%) | 4 (confirm loop adds friction; med) | 3 | 4 | 4 |
| Demo clarity (10%) | 4 (card vs range; collapse; med-high) | 4 | 3 | 5 |
| Data access & delivery feasibility (10%) | 4 (fixtures/mock; FAIR/CDT excluded; high) | 3 | 3 | 3 |
| Architecture, tool fit, security, complexity (10%) | 4 (Bedrock citations + engine + phone-first web; med) | 4 | 4 | 3 |
| **Weighted (÷100)** | **4.25** | 3.50 | 3.25 | 3.55 |
| Functionality-heavy (fit 20, func 35, diff 10, use 10, demo 10, data 10, arch 5) | **4.20** | 3.60 | 3.40 | 3.50 |
| Innovation-heavy (fit 20, func 15, diff 30, use 5, demo 15, data 5, arch 10) | **4.20** | 3.30 | 3.00 | 3.55 |

The winner does not change under either scenario; the challenger closes the gap under innovation weighting, which is why its timeline is folded into F1. Scores are structured judgment, not win probability.

### Independent critic (dr-critic, Chain-of-Verification, 3 live spot-checks) — verdict REVISE → addressed

| Objection | Response / change made |
|---|---|
| "Demonstrable mechanism PASS rests on an unrun experiment" | Experiment run (§8, 19/19); gate marked PROVISIONAL because extraction is unmeasured; first validation action defined |
| Claim 2 overstated Delta ("excludes maximums/deductibles") | Corrected: exclusion qualifies the displayed insurer amount; NJ/CT/ID members get out-of-pocket estimates; our difference restated as cross-carrier, multi-procedure, cited, ranged |
| Claim 3(e) "no product cites passages" contradicted by generic PDF-citation apps | Restated as "no dental cost tool found that…"; distinction gate PROVISIONAL |
| Claim 5 conflated "incurred" (termination) with payment dating | Engine default = completion date; prep-date is a labeled scenario; Dec/Jan lever shrinks — reflected in C3 and the pitch |
| Framing omitted affordability dominance | §3.2 insight 6 and "who this does not help" added; no "unused $880" statistics anywhere |
| Range-width degeneration | C8 shows collapse after two confirmations; C4 shows a top unknown that is not the max; UI shows ranked unknowns with dollar impact and greys out $0-impact ones |
| Coverage gaps: literal "selection", Lincoln relevance, input realism, DHMO, non-visitors, mobile moment | Option-fit screen (#8) as bonus; Lincoln Iredell High/Low fixture; phone-capture of the treatment plan as the mobile entry; DHMO detect-and-explain; judge answers written (build brief) |

**Critic questions, answered briefly:** ordinary functionality renamed? — the parts are ordinary; the chain is not found anywhere patient-facing, so we label it a combination. Existing product does the important part? — for members of plan-aware carrier tools and anyone who waits 2–3 weeks for a predetermination, the carrier does it with real state; ours is the instant, cross-carrier pre-screen and question generator. Misleading estimates? — ranges are honest only if they collapse; the demo shows that. Essential data unavailable? — carrier state is unavailable; fixtures, typed values and a labeled mock are the honest substitutes. AI adding value? — yes for cited extraction from an arbitrary certificate; downstream is a form + rules (F1-lite is the proof). Demo reliable? — with cached fixtures, yes; never put live extraction or a live Stedi call on the critical path. Too large? — at the edge; cut list enforces. Who doesn't benefit? — DHMO members, the ~47% who don't visit, anyone blocked by affordability, anyone without a treatment plan in hand. Overturning evidence? — a carrier member tool observed giving history-aware per-procedure limitation warnings; extraction below ~90% on class/frequency fields; the coach confirming "selection" means enrollment choice.

---

## 7. Why this stands out

**Differentiation statement.** For an insured employee who has just been handed a multi-procedure treatment plan (root canal and crown on a molar, a filling, a cleaning) and holds — or can pick — their plan document, our project enables a trustworthy pre-estimate and a safe timing decision through a cited rule model plus a deterministic engine that prices each procedure as a range over unknown plan state and ranks the unknowns by dollar impact. Its supported difference from the closest alternatives — the carrier estimator (single procedure, plan design, "not the payment information used when processing your claims") and the office's Dentrix estimate (coverage % and deductible only) — is per-procedure exception application with the clause shown, explicit uncertainty with a confirm-first list, and sequencing that is conditional and clinically bounded. We demonstrate the mechanism with a reproducible fixture in which the summary-card estimate is $970.80, the rule-aware range is $1,513.50–$2,673.00 (remaining maximum and deductible unknown, enrollment date known), confirming the remaining maximum ($700) collapses it to $1,973.00 and shows the deductible no longer matters, and moving only the crown's seat date to January is worth $409.50 under completion-date carriers but $0 under prep-date carriers and −$25 if the maximum were ample.

**Relevance to Lincoln (no endorsement implied):** Lincoln sells DentalConnect PPO with alternate-benefit, late-entrant waiting, optional MaxRewards/deductible carryover provisions `[1:C]`; its member site offers a glossary, articles and a login-gated cost estimator `[0:B9][3:A8]`. A carrier holds exactly the state our ranges are uncertain about, so the natural next step is a carrier-connected version where the range collapses to a point (the 271 "Remaining" field is the demo of that) — a story the AWS/CIO judges can follow.

**7.1 Central feature and the technical work behind it:** the rule model schema + extraction prompt with citations (two-call pattern: cite, then structure) + the deterministic engine (classes, deductible scope, caps, exceptions, clock semantics, DOS scenario) + interval/VOI computation + windowed sequencer. **7.2 Supporting features needed:** phone capture/typing of the treatment plan; plan picker with fixtures and upload; confirm/correct UI per extracted field; results screen; timeline screen; glossary tooltips from the same quotes. **7.3 Optional/cut:** Stedi mock pull, option-fit screen, reminders, OON column, EOB upload.

**Form-instead-of-chat test:** replace the LLM with a form that asks for class per procedure, coinsurance, deductible scope, max, year type, clocks, waiting period, downgrade rule — the engine, ranges, VOI ranking, frequency clocks and conditional sequencer all still work (that is F1-lite, the fallback). What the AI adds is finding and quoting those fields from a 45–76-page document in seconds and letting the user verify by reading one highlighted sentence instead of the whole certificate. Conversational interaction is **not** central; a guided flow is.

---

## 8. Prototype experiment and results (deterministic engine; no AI)

Reproducible: `reports/2026-10-03-codelinc11-dental-idea/experiments/engine_experiment.py` (Python 3 stdlib). Plan rules are the Delta Dental PPO EOC (MSU High, eff. 1/1/2024) as quoted in `notes/1-plans.md` and re-verified today; MetLife NCFlex Classic and Guardian summaries for cross-plan cases. **Fees are labeled fixtures** (Coast Dental 2025 list prices as allowed-amount stand-ins; cast-crown allowance $1,100 assumed; D4910 assumed). Expected values were derived by hand before running; none are measured customer savings.

| Case | Inputs / assumptions | Expected (hand) | Actual | Baseline(s) | Interpretation |
|---|---|---|---|---|---|
| C1 Normal covered | Composite D2392 $271, Basic 80%, deductible met, max ample, enrolled 2023 | $54.20 | $54.20 | Card $54.20; office $54.20 | **No advantage when everything is known and no exception triggers** |
| C1b Deductible unknown | same | range $54.20–$94.20; VOI(ded) $40 | $54.20–$94.20; $40 | point estimate | Honest range |
| C2 Exhausted max | RCT D3330 $1,219 (Major 50%) + porcelain crown D2740 $1,454 on #30 (downgrade to $1,100 allowance); remaining $300 | $2,373.00 | $2,373.00 | Card (endo as Basic, no cap) $970.80; office with max unknown $1,336.50 | $1,402 surprise vs card; engine notes show cap and downgrade |
| C2b Unknowns | remaining ∈ {0,300,700,1500}; ded ∈ {met, not} | range $1,513.50–$2,673.00; VOI max $1,159.50 > ded $25 | match | — | "Confirm your remaining maximum first" |
| C3 Benefit-year straddle | remaining 2026 $700; deductible not met either year; crown seats Jan 8 vs Dec 10 | all-2026 $1,973.00; Jan (completion rule) $1,563.50; Jan (prep rule) $1,973.00; saving $409.50 | match | Card: no view | Renewed $50 deductible costs $25; saving exists only under completion-date carriers |
| C3b Sensitivity | remaining 2026 $1,500 | all-2026 $1,538.50 vs Jan $1,563.50 | match | — | **Advantage disappears; waiting is $25 worse** → claim narrowed |
| C3c Threshold | scan remaining 0–1,500 | waiting helps only if remaining < $1,110 | $1,110 | — | Engine reports the threshold instead of "wait to save" |
| C3d Policy year (July start) | same plan, year starts July | both $1,973.00 | match | — | Dec/Jan straddle irrelevant on policy-year plans |
| C4 Missing info | enrollment date unknown (12-month wait); max known | VOI(enrolled) $1,159.50 > ded $25; range $1,513.50–$2,673.00 | match | — | **Top unknown is not the maximum** → qualified result + question |
| C5 Post-design: frequency clocks | last cleaning Jun 20; planned Nov 1 | Delta (2/calendar yr) $0; Guardian (every 6 mo) $107; Guardian Dec 21 $0 | match; note "next eligible 2026-12-20" | Card: $0 both (wrong for Guardian) | Timing value beyond the maximum |
| C6 No-advantage sequencing | composite + cleaning; insurer share $323.80 ≪ $1,500 | "timing changes nothing" | match | — | Honest null result |
| C7 Option fit (selection reading) | RCT + crown + composite; deductible not met | Delta MS High $1,592.70; NCFlex Classic $1,515.00 | match | — | Class assignment flips the answer; premiums excluded |
| C8 Range collapse | 3 unknowns → confirm max $700 → confirm enrollment | [1,513.50–2,673] → [1,973–2,673] → $1,973 | match; after max confirmed, VOI(ded)=**$0** | — | ≤2 confirmations; engine tells user deductible no longer matters |

**19/19 checks passed.** Sensitivity checks that changed a claim: remaining-max level (C3b/C3c), DOS rule (C3), benefit-year type (C3d). **Verification limits:** fees are fixtures; one carrier's clause set drives most cases; extraction from PDF to rule model was *not* executed (no model API in the sandbox) — the rule models were hand-built from quoted clauses, which is the gold set for the venue extraction test.

---

## 9. Build brief

See `CODELINC_DENTAL_BUILD_BRIEF.md` (standalone): promise, journey, five must-work capabilities, cut list, requirement→feature→demo map, screens, stack (phone-first React/Next PWA + FastAPI/Lambda engine + Bedrock Claude with citations + DynamoDB/S3; no custom auth), schema, pseudocode, real/synthetic boundary, security posture, hour-by-hour schedule with 23:00 and 03:00 checkpoints, 5-minute script, 30-second pitch, 10 judge Q&A, submission checklist.

---

## 10. Fallback trigger and first validation action

**Trigger → fallback:** if by **Sat 23:00 EDT** the extraction step cannot populate ≥90% of class/coinsurance/deductible/max/frequency fields with correct citations on at least two of the three FEDVIP brochures (checked against `notes/1-plans.md` and `experiments/` gold rules), ship **F1-lite**: a two-screen form for plan parameters (prefilled from fixtures) feeding the same engine, ranges, ranking and timeline; the LLM is reduced to explaining a selected clause in plain language. Secondary triggers: Bedrock/API outage → cached extraction JSON for the three fixtures (always ship); Stedi sandbox failure → hard-coded 271 fixture, labeled.

**First validation action (now):** run one Bedrock/Claude call with the Delta FEDVIP brochure (62 pp) asking for the class list, frequency sentence, waiting period, deductible scope and alternate-benefit paragraph **with citations**, and compare against the gold quotes — 15 minutes, decides the build posture before anyone writes UI.

---

## 11. Audit of the three most decision-critical claims (sources reopened today)

1. **"Dentrix desktop's estimate method is deductible + payment table + coverage %; frequency/waiting/downgrades not computed."** Reopened by the critic (hsps.pro help page): verbatim deductible → "first listed procedure"; payment table; coverage table; frequency/waiting/downgrades/annual max "not mentioned." **Supported as phrased.** Scope note added: Dentrix Ascend computes frequency/downgrade/age exceptions (waiting "for reference purposes only"); Open Dental computes all — so the claim is about the desktop method and about what reaches the patient, not "offices can't."
2. **"Under the Delta Dental MSU 2024 EOC, Endodontics and Periodontics are Major Services; restorative/endo/perio/prostho carry a 12-consecutive-month wait; exams/cleanings are limited to twice in a Calendar Year; porcelain crowns on any mandibular molar fall under Optional Services; the crown-incurred-at-preparation sentence is under Continuation of Benefits."** Reopened (hrm.msstate.edu PDF): all seven passages returned verbatim with their attachment/section. **Supported as phrased**; the "incurred" scope correction (termination liability, not payment dating) stands.
3. **"Claude citations return `page_location` with 1-indexed start/end pages and `cited_text`; citations cannot be combined with structured outputs; available on Amazon Bedrock."** Reopened (platform.claude.com citations page): `page_location` fields confirmed; "Citations cannot be used together with structured outputs ... the API returns a 400 error"; platforms list includes Amazon Bedrock; `cited_text` not counted toward output tokens. **Supported as phrased.** The earlier draft's statement that Bedrock supports this since 2025-06-30 comes from the AWS What's New post `[4:S24]` and was not re-fetched.

Overstatements corrected during the run: Delta estimator exclusion scope; "no product cites passages" → "no dental cost tool found"; "incurred at prep" scope.

---

## 12. Completion check

- Research occurred; access limits disclosed (deck/video unavailable; Reddit, Guardian FAQ, MetLife PDF, JADA, NADP report, logged-in tools, academic APIs blocked) — yes.
- Official dental requirements covered — A/B/C mapped to features and demo; bonus features scoped — yes.
- Central pain point evidenced — 13 accounts + Dentrix method + plan variation; prevalence contested and stated — yes.
- Closest alternatives investigated — 27 products, 3 reconstructions, Wave-2 disconfirmation — yes.
- Difference concrete and scoped — combination + decision workflow; carrier-held state acknowledged — yes.
- Critical inputs obtainable — fixtures, typed state, labeled mock; FAIR Health/CDT excluded by terms — yes.
- Central mechanism checked — engine 19/19; extraction verification limit explicit — yes.
- Demo fits rules, build fits clock — 5-minute script; schedule with checkpoints and cut list — yes (PROVISIONAL on window).
- Uncertainty affects the recommendation — two gates PROVISIONAL; fallback defined; claims narrowed by sensitivity — yes.
- One concept chosen with reasons for rejecting others — yes (§5–6).

**Build this because** the one thing every surprise-bill story has in common — an exception rule nobody applied before the drill started — is computable from the plan document, and no patient-facing tool does it with the clause shown and the unknowns ranked.
**It would be a mistake if** the team leads with "spread treatment across two years to save money": the lever is small, already-published advice, and often wrong under completion-date carriers; sequencing must stay conditional and clinically bounded.
**The first thing to validate is** extraction with citations on the Delta FEDVIP brochure against the gold clauses — before any UI work.

---

## Appendix A — Raw research log and where the evidence lives

- `reports/2026-10-03-codelinc11-dental-idea/plan.md` — decomposition, skills composition, disqualifying conditions, time box.
- `notes/0-event-rules.md` — Devpost/Lincoln/tinyurl access log, verbatim rubric and rules, 11 conflicts, prior winners, coach questions.
- `notes/1-plans.md` — 7 plan documents: access log, per-document provisions with page refs, variation table, DOS/rollover/carryover findings, fee rows, extraction-layer conflicts.
- `notes/2-users.md` — 13 accounts, primary-evidence table with laundering flags, practitioner evidence (Dentrix method, breakdown-form fields, verification/predetermination latency).
- `notes/3-competitors.md` — 27-product matrix, three reconstructions, gaps (a)–(e), prior hackathon entries, failed pages.
- `notes/4-tech.md` — dependency table, verbatim terms (FAIR Health, ADA CDT, Stedi, Anthropic, AWS, CMS), NC Medicaid rows, rules findings.
- `notes/5-contrarian.md` — disconfirming evidence per mechanism, eight disconfirming searches, framing counterevidence.
- `notes/6-wave2-prior-art.md` — Open Dental downgrades/clock types, Dentrix Ascend, carrier member estimators, dentalcostestimate.com, PDF-citation apps, clock fact-check.
- `audit.md` (critic, CoVe) and `citation_audit.md` + `sources.md` (ledger).
- `experiments/engine_experiment.py` and `results.json.txt`.
- Research log with decision questions and timestamps: scratchpad `research_log.md` (decision questions 1–15 written at 13:35 before broad browsing).

## Addendum (15:05 EDT) — the user's seven must-haves and what they change

The user added seven constraints after the recommendation: (1) informational push reminders before benefits expire (lowest priority); (2) make the plan understandable in an intuitive, unique, simple way; (3) translate dense legal text uniquely and simply; (4) give *all* projected costs; (5) confidentiality and per-user protection at an impressive level; (6) **strictly informative — the AI must never tell the user what to do**; (7) be unmistakably different.

What changes versus §0: the concept and engine stand; the *presentation and language* change. Constraint 6 converts the sequencer into a user-explored **Cost Calendar** (projected cost of each procedure by month under each carrier dating rule; nothing pre-selected) and converts "ranked unknowns / what to confirm" into "**what moves these numbers** / where the figure lives" — information, enforced by a deterministic advice linter over UI strings and model output. Constraint 3 produces the hero: the **Fine Print view** — the real certificate pages dimmed to the handful of sentences that apply to this treatment plan, each paired with plain words *and* its dollar consequence on the user's own procedures (this is where the research evidence of structural plan variation becomes visible). Constraint 2 adds the **Dollar Pipeline** (fee → allowance → deductible → plan share → cap → you). Constraint 5 is met by redaction before any model call with a visible "what the AI saw" preview, client-side encryption, per-user KMS envelope keys, per-user IAM-scoped storage, ephemeral processing and crypto-shred deletion shown live; AWS's HIPAA page states a business associate agreement is required for PHI use (verified 2026-10-03) — the brief words compliance posture honestly and claims no certification. Constraint 1 uses Web Push (iOS/iPadOS 16.4+ Home Screen web apps, WebKit 2023-02-16, verified) with fact-only copy and is first to cut. Constraint 7 is addressed by a "them vs us" table in the brief; the honest label remains *combination*, not new algorithm. Gates and scores in §6 are unchanged; the information-only design strengthens the "no unsupported clinical/insurance claims" gate and removes the only content risk the contrarian flagged for sequencing (nudging delay or spending).

Appendix B — Statistics deliberately *not* used: "$880 unused per patient" (billing-vendor arithmetic `[2:S19]`); "15% of dental claims denied" (unsourced vendor blog `[2:S16]`); "$1,000 max unchanged since the 1970s" (no primary document; ADA says "some 40 years ago" `[2:S17]`).
