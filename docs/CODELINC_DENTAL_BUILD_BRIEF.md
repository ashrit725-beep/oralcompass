# CODELINC 11 — DENTAL BUILD BRIEF (standalone, v2 with the seven must-haves)

Working title: **FinePrint** (v1 called it ClauseCheck in `CODELINC_DENTAL_RESEARCH.md`).
One line: *"Your plan's fine print, reduced to the sentences that apply to your dentist's treatment plan — each one translated into dollars on your own numbers. Information only; nothing leaves your phone un-redacted."*
Prepared Sat 2026-10-03 15:00 EDT. Readiness target Sun 10:00 EDT; treat 10:30 EDT as the hard cutoff (Devpost header says 11:00). Presentation ≤5 minutes.

---

## 0. The seven must-haves and how each is met

| # | Must-have | How FinePrint meets it | Priority |
|---|---|---|---|
| 2 | Make the user understand their plan intuitively, uniquely, simply | **Dollar Pipeline** — the plan drawn as the path one dollar of each procedure takes: *Dentist's fee → plan allowance (downgrade) → deductible → plan share → annual-max cap → you*, with the user's own numbers in each box and the quoted clause behind each box | Core |
| 3 | Translate dense legal text in a super simple, unique way | **Fine Print view** — the actual certificate pages, everything dimmed except the sentences that apply to *this* treatment plan (typically 5–10 of 45–76 pages), each paired with a plain-words line and a dollar consequence on the user's own procedures. Translation grounded in their numbers, not generic glossary text | Core |
| 4 | Give ALL projected costs | **Complete Projection**: per procedure and total; plan pays / you pay; in-network and out-of-network columns (labeled basis); per benefit year; per carrier date-of-service scenario; remaining deductible and remaining maximum after each line; **Cost Calendar** (projected cost of each procedure by month across the plan-year boundary); alternative-option costs (option fit); orthodontic lifetime max where present; ranges wherever an input is unknown | Core |
| 6 | Strictly informative — never tell the user what to do | **Information-only policy** (§5): no recommendations, rankings-as-advice, nudges or "should"; a deterministic **advice guard** scans every UI string and every model output; the sequencer becomes a calendar of costs the user explores; unknowns are shown as "what moves these numbers" and "where this figure lives" | Core (cross-cutting) |
| 5 | Confidentiality and per-user protection at an impressive level | **Privacy architecture** (§7): Cognito identity + optional MFA; redaction of names/IDs **before** any model call with a visible "what the AI saw" preview; client-side AES-GCM encryption before upload; per-user KMS envelope keys (encryption context = user id); per-user S3 prefixes with IAM conditions; ephemeral processing and crypto-shred delete; TLS/HSTS/CSP; no third-party scripts; a **Privacy Panel** screen showing the live data map | Core |
| 7 | Be unmistakably different — top 1 | Everyone will show a chatbot that explains benefits. We show a 62-page certificate collapsing to seven highlighted sentences, each turning into dollars on the user's own plan; a receipt before the receipt; a cost calendar instead of advice; and a privacy panel that proves what the AI never saw. §2 has the "them vs us" table | Core |
| 1 | Push notifications before a benefit/offer expires | **Informational reminders** from plan dates: benefit-year end, next-eligible dates from frequency clocks, waiting-period end, deductible-carryover window, rollover facts — phrased as facts, never as "use it". Web Push via service worker (iOS/iPadOS 16.4+ home-screen web apps confirmed) | **Last; first to cut** |

---

## 1. Product promise, target user, and the insight

**Promise.** Photograph or type the treatment plan your dentist handed you; pick or upload your plan document. In under a minute, see the few sentences of your plan that apply to those procedures, what each one means in plain words, and what it does to your dollars — as honest ranges where your document can't know a number — with every figure traceable to a page and nothing that tells you what to do.

**User.** An insured employee (PPO/indemnity dental) holding a multi-procedure treatment plan. Not for DHMO/copay plans (detect and explain), people without a treatment plan, or people whose barrier is affordability.

**Insight (from the research).** Surprise bills come from the plan's exception layer — alternate-benefit downgrades, frequency limits with different clocks, waiting periods, missing-tooth clauses, class assignment (a root canal is *Major 50%* under Delta MS State and Lincoln Iredell, *Basic* under MetLife NCFlex and Guardian), deductible scope — rules that live in the certificate, that office estimate math largely skips (Dentrix desktop: deductible → payment table → coverage %), and that carrier estimators disclaim. Three numbers the document cannot contain (remaining maximum, deductible met, service history) drive the rest of the uncertainty. No patient-facing tool found reads the certificate and applies those rules per procedure with the clause shown. (`CODELINC_DENTAL_RESEARCH.md` §§2–4, 8.)

## 2. Why this is different (them vs us)

| What most teams will build | What FinePrint does instead |
|---|---|
| Chat with your benefits PDF; generic plain-English answers | The certificate itself, dimmed to the sentences that apply to *your* procedures, each tied to a dollar line on *your* treatment plan |
| A single out-of-pocket number from 100/80/50 | A per-procedure Dollar Pipeline using the plan's actual classes, downgrade allowance, deductible scope and cap — with ranges where the document can't know |
| "You should schedule the crown in January" | A Cost Calendar showing what each date would cost under each carrier dating rule; the user chooses; the app never recommends |
| "Ask your insurer" | "What moves these numbers": the dollar impact of each unknown and where that figure lives (EOB, member portal) — no instruction |
| "We take privacy seriously" slide | A Privacy Panel showing the redacted text the model received, which key encrypts the user's data, where it lives, and a one-tap delete that works on stage |
| Year-end "use it or lose it" nudges | Dated facts from the plan (benefit-year end, next-eligible dates) delivered as information, with no call to action |

Label honestly on stage: a **combination** (cited extraction + deterministic engine + uncertainty + information-only design + privacy-by-construction), not a new algorithm.

## 3. Central interaction and user journey

1. **Capture**: photo of the treatment plan or typed lines (plain names; D-codes only if printed on the user's document). Per line: tooth, fee, and the dentist's stated urgency/window (recorded as *information from the dentist*, displayed as such).
2. **Pick plan**: fixture (Delta FEDVIP 2026, MetLife FEDVIP 2026, Aetna FEDVIP 2026, Lincoln DentalConnect Iredell High/Low, NCFlex Classic) or upload (≤100 pages).
3. **Redaction preview**: shows exactly what text/image regions will be sent to the model (names, IDs, DOB struck out); user proceeds.
4. **Fine Print view**: pages render; applicable sentences highlighted and numbered; tap → Clause / Plain words / Your dollars.
5. **Confirm fields**: each extracted field shows its sentence; ✓ or edit; unknowns stay unknown.
6. **Your numbers** (optional): remaining max, deductible met, last cleaning date, enrollment date, network status — each with "I don't know."
7. **Projection**: Dollar Pipeline per procedure; totals; in/out-of-network; per benefit year; ranges; remaining deductible/max after each line.
8. **What moves these numbers**: unknowns with dollar impact; where each figure lives; $0-impact items shown as "does not change your numbers this year."
9. **Cost Calendar**: procedure × month grid of projected your-cost; dentist windows shown; carrier dating-rule toggle; tap to build any sequence and see its totals; lines unaffected by timing labeled.
10. **Privacy Panel** and (last) **Reminders** settings.

## 4. Must-work capabilities and cut list

Must work end-to-end on Fixture A (Delta FEDVIP 2026) with the scripted treatment plan:
1. Typed treatment-plan input (photo path if OCR is stable by Checkpoint 1).
2. Cited rule model for Fixture A (live extraction *or* shipped cache) and the **Fine Print view** (positional highlight if pdf.js text-match works; otherwise page thumbnail + sentence card).
3. Deterministic engine: classes, deductible scope, per-year caps, alternate benefit per tooth, frequency clocks (3 types), waiting periods, exclusions; integer cents; ranges.
4. Complete Projection + What-moves-these-numbers + Dollar Pipeline.
5. Privacy Panel with redaction preview, encryption status, delete-all.

Then, in order: Cost Calendar → option-fit → mock 271 "remaining" pull → OON column → Reminders (push).
**Cut order (reverse):** Reminders → OON column → mock 271 → option-fit → Cost Calendar what-if (keep read-only grid) → photo OCR (keep typed) → positional highlight (keep sentence cards) → live extraction (keep cache).

## 5. Information-only policy (requirement 6) — a spec, not a vibe

**Allowed:** statements of fact about the plan document (quoted and cited); computed figures and ranges; conditions ("if X, then the plan pays Y"); where a figure lives ("shown on your Explanation of Benefits"); what the dentist's document says (urgency, windows) attributed to the dentist.
**Not allowed anywhere in UI or model output:** "should", "recommend", "best", "optimal", "we suggest", "consider", "make sure to", "don't forget to", "use your benefits", "save money by", "ask your dentist/insurer to…", any ranking presented as a choice to make, any default selection in the Cost Calendar, any nudge copy in notifications.
**Guards:** (a) a deterministic **advice linter** (regex list above + imperative-sentence detector) runs in CI over all UI strings and at runtime over every model output; a flagged sentence is replaced by the cited clause alone; (b) a **grounding check**: every generated sentence must reference a cited clause id or a computed field id, or it is dropped; (c) the LLM system prompt restricts output to translation of a given clause into plain words with no suggestions; (d) footer on every screen: "Information from your documents and your numbers. Not advice, not a guarantee of payment."
**Copy examples:** ✗ "Confirm your remaining maximum first." → ✓ "Remaining annual maximum changes these figures by up to $1,160; it is not in your plan document (it appears on your EOB or member portal)." ✗ "Schedule the crown in January to save $410." → ✓ "If this crown's completion date falls in 2027, the plan's share under these rules is $525 instead of $115.50; under carriers that use the preparation date, both dates fall in 2026." ✗ "Don't lose your benefits!" → ✓ "Your plan document states the benefit year ends December 31. As of your last entry, $700 of the $1,500 annual maximum had not been used."

## 6. Requirement → feature → demo mapping (challenge outcomes + must-haves)

| Requirement | Feature | Demo moment |
|---|---|---|
| A. Describe procedures + plan | Capture; plan picker; redaction preview | Photo → redaction preview → plan picked |
| B. Explain insurance language as coverage and cost | Fine Print view + Clause/Plain/Dollars cards + Dollar Pipeline | 62 pages dim to 7 sentences; tap the crown clause → "paid on a $1,100 allowance: $177 of the fee is outside the plan's share" |
| C. Sequence care across the plan year | Cost Calendar (user-driven) with dating-rule toggle | Grid shows the crown at $1,338.50 in Dec vs $929 in Jan under completion dating, identical under preparation dating; root canal row marked "urgent per your dentist"; nothing pre-selected |
| Bonus: track annual maximum | Your numbers + remaining-after-each-line + mock 271 | Enter $700 → ranges collapse; "deductible does not change your numbers this year" |
| Bonus: in/out-of-network | OON column with labeled basis | Same crown, two columns |
| Bonus: expiring benefits | Informational reminders | Simulated date → push: "Benefit year ends in 30 days; $700 of your maximum unused per your last entry" |
| Must-have 5 | Privacy Panel | Show what the AI saw; show per-user key; tap delete; data gone |
| Must-have 6 | Advice linter | Show the CI check and a blocked sentence in logs |

## 7. Privacy and security architecture (requirement 5) — buildable in the window

- **Identity:** Amazon Cognito user pool, hosted UI, optional TOTP MFA; no custom auth code (criterion 7 says describe, don't build). Demo account for the packet.
- **Per-user isolation:** S3 keys `users/{sub}/…`; IAM policies conditioned on `${cognito-identity.amazonaws.com:sub}`; DynamoDB items partitioned by `sub`.
- **Encryption:** client-side AES-GCM (WebCrypto) of documents before upload, with the content key wrapped by **AWS KMS GenerateDataKey using EncryptionContext {user: sub}** (envelope encryption; per-user key material; KMS access via Identity Pool credentials). Server-side SSE-KMS as a second layer. TLS 1.2+, HSTS, strict CSP; no third-party scripts or analytics.
- **Redaction before any model call:** regex + layout rules strip names, member IDs, DOB, addresses from OCR text; photo crops exclude the header block; the user sees the exact redacted payload (Privacy Panel). Plan documents are generic contracts — the cover-page name block is stripped anyway.
- **Ephemeral processing:** decrypt only inside the Lambda for the duration of the call; no document text in logs; Bedrock invocation logging off; Bedrock does not train on inputs (cite AWS docs in the packet); S3 lifecycle 24 h.
- **Crypto-shred delete:** "Delete my data" deletes objects and items and schedules the user's wrapped keys for destruction → ciphertext unrecoverable; show it live.
- **Audit:** CloudTrail on; app audit log of access events (no content).
- **Compliance posture (honest wording):** "Built on AWS services; AWS states that HIPAA-covered use requires a business associate agreement — we confirm each service's HIPAA eligibility against AWS's reference list and note that a BAA would be required for production; as a consumer app it falls under the FTC Health Breach Notification Rule." Do not claim certifications you don't hold.

## 8. Screens

S1 Welcome (promise + information-only footer) · S2 Capture · S3 Plan picker/upload · S4 Redaction preview · S5 Fine Print view (pages, highlights, numbered) · S6 Clause card (Clause / Plain words / Your dollars) · S7 Confirm fields · S8 Your numbers · S9 Projection (Dollar Pipeline per procedure; totals; in/out columns; per-year) · S10 What moves these numbers · S11 Cost Calendar · S12 Option fit (bonus) · S13 Privacy Panel · S14 Reminders (bonus) · S15 About/architecture (judges; licensing-cost note).

## 9. Verified platform assumptions

- Claude on Amazon Bedrock: PDF documents + **citations** via Invoke/Converse (AWS What's New 2025-06-30); citations return `page_location` with 1-indexed `start_page_number`/`end_page_number` and `cited_text`; **citations and structured outputs cannot be combined in one request (400)** → two-call pattern (cite, then structure). PDF limits 32 MB; 600 pages (100 when context < 1M tokens); on Bedrock Converse, visual PDF analysis requires citations enabled. (Anthropic docs, verified 2026-10-03.)
- Fine Print highlighting: pdf.js text layer + string match of `cited_text` on the cited page → bounding boxes (fallback: thumbnail + card).
- Fixtures: OPM FEDVIP 2026 brochures (MetLife 71 pp, Delta 62 pp, Aetna 45 pp; alternate-benefit clauses present); Lincoln DentalConnect Iredell High/Low; NCFlex 2026 details.
- Fees: NC Medicaid Feb-2022 rows (D1110 $39.83, D2392 $110.92, D3330 $428.62, D7210 $114.21) as a labeled public floor; list prices as labeled retail stand-ins; the office's quoted fee is the primary input. **FAIR Health consumer data: personal use only, no scraping/commercial — not used. CDT codes: ADA commercial license required — no catalog shipped; D-codes shown only from the user's own document with the ADA © notice.**
- Stedi test mode: free dental mocks incl. a CDT-code mock; `benefitAmount` with `timeQualifierCode` 29 = Remaining; fixed test values; labeled MOCK.
- Web Push: Push API + Service Workers; iOS/iPadOS 16.4+ for Home Screen web apps (WebKit blog, 2023-02-16, verified). Scheduler: EventBridge Scheduler → Lambda → `web-push`. Demo via "simulate date".
- Judging: core functionality weighted far above login; 5-minute presentation; "mobile development project" wording → phone-first PWA with a real phone capture moment (coach question pending).

## 10. Stack, architecture, data flow

Client: React + Vite + Tailwind PWA (camera capture; service worker for push; pdf.js). API: Python FastAPI on Lambda (API Gateway). Engine: stdlib Python (the research experiment generalized), unit-tested. Extraction: Bedrock Converse → Claude with the PDF as a document block and citations → cited sentences per field → second call (tool-use JSON) → `PlanModel` with quotes/pages; cache by SHA-256; three fixtures pre-cached. Redaction: Lambda pre-processor. Storage: S3 (client-encrypted + SSE-KMS, per-user prefixes, 24 h lifecycle), DynamoDB sessions by `sub`. Identity: Cognito user pool + identity pool. Push: EventBridge Scheduler + Lambda. Guards: advice linter + grounding check in the API layer and CI.
Flow: Capture → redaction → `TreatmentPlan` → `PlanModel` (cache/extract) → confirm → `MemberState` → Engine → `Projection` (pipelines, ranges, movers, calendar) → screens; every displayed figure carries `{rule_ids, citation_ids}`.

## 11. Data schema (integer cents; ISO dates; uncertainty explicit; provenance on every field)

```
PlanModel { plan_id, source_doc {title, carrier, effective_date, sha256, page_count, provenance: fixture|user_upload},
  benefit_year {type: calendar|policy|rolling, start_month, citation, status},
  deductible {amount_cents, scope, applies_to_classes[], waived_classes[], carryover_months|null, citation, status},
  annual_max {amount_cents, preventive_counts: true|false|unknown, rollover{threshold_cents, amount_cents, cap_cents}|null, citation, status},
  classes [{name, coinsurance_in_bp, coinsurance_out_bp, procedures[{code|plain_name}], citation, status}],
  waiting_periods [{class, months, late_entrant_only, citation, status}],
  frequency_rules [{procedure, clock: calendar_count|interval_months|rolling12_count|lifetime|per_tooth_months, n, citation, status}],
  alternate_benefit {clause_quote, citation, rules[{procedure, condition, substitute{code|allowance_cents}}], status},
  missing_tooth_clause {present, quote, citation, status},
  oon_basis {type: program_allowance|rc_percentile|fair_health_percentile|ucr|mac|unknown, percentile, balance_billing_allowed, citation, status},
  dos_rule {default: completion, carrier_specific: unknown|prep|completion, citation}, exclusions[{procedure, credit_rule|null, citation}] }
  // status ∈ extracted|confirmed|corrected|unknown ; citation {page_start, page_end, quote, bbox[]|null}
MemberState { remaining_max_cents {year: int|unknown}, deductible_met {year: bool|unknown}, history[{procedure, tooth, date, source: user|eob|x12_271_mock}], enrollment_date|unknown, network_status: in|out|unknown }
TreatmentPlan { procedures[{code|plain_name, tooth, fee_cents, fee_source: typed|photo|fixture, dentist_window{earliest, latest}|null, dentist_priority_text|null, depends_on[]}], redaction_report {fields_removed[]} }
Projection { per_procedure[{procedure, year, pipeline[{step, amount_cents_range, rule_id, citation_id}], insurer_cents{min,max}, patient_cents{min,max}, in_network, out_of_network|null}],
  totals{min,max} by year, remaining_after_each_line[], movers[{unknown, dollar_impact_cents, where_it_lives, zero_impact}],
  cost_calendar{procedure: {month: patient_cents_range by dos_scenario}}, option_fit[]|null, assumptions[], disclaimer }
```

## 12. Engine pseudocode and checks

```
estimate(plan, procs, state, dos_rule="completion"):
  for p in procs sorted by date_of_service(p, dos_rule):
    year = benefit_year(plan, dos)                              # calendar / policy-year start / rolling
    if excluded → insurer 0 (+credit rule); waiting period unmet → insurer 0; frequency clock violated → insurer 0 (record next-eligible date)
    allowed = substitute allowance if alternate-benefit condition matches tooth else fee
    base = allowed − deductible_left[year] (unless class waived)      # deductible, then coinsurance
    insurer = min(base × coinsurance, remaining[year]); remaining[year] −= insurer; patient = fee − insurer
movers(unknowns): scenario grid → [min,max]; one-at-a-time spread per unknown = dollar impact (sorted; 0 flagged)
cost_calendar(procs): for each procedure and each month in its dentist window (or all months if none) → patient cost under completion and prep dating; totals for any user-chosen assignment; flag lines where month does not change cost
```
**Checks:** the 19 research cases pass to the cent; invariants (insurer ≤ min(allowed×coins, remaining); patient ≤ fee; Σ per-year insurer ≤ max; point ∈ range; movers ≥ 0; both dating scenarios shown when a multi-visit procedure straddles a boundary; policy-year plans show no Dec/Jan boundary); **advice linter passes on all strings**; every displayed figure has rule and citation ids.

## 13. Real vs synthetic (say it on stage)

Real: plan rules quoted from real documents; Medicaid fee floor; API behaviors per official docs; Web Push behavior. Synthetic/labeled: dentist fees (list-price stand-ins), member state (typed or Stedi MOCK), the sample patient. Not measured: real-world claim accuracy; savings of any kind (none claimed — the app states costs, never savings).

## 14. Schedule (EDT), workstreams, checkpoints, failure fallbacks

| Time | Work |
|---|---|
| 15:00–15:30 | Kickoff; roles; repo; fixtures; **first validation action** (Bedrock extraction with citations on Delta FEDVIP vs gold clauses); decide posture |
| 15:30–19:00 | Sprint 1 — A: engine + 19 tests + movers + calendar; B: extraction two-call + cache + redaction; C: PWA skeleton S2–S9, pdf.js render; D: Cognito/KMS/S3/API/deploy; E: gold rule sets, copy under the information-only policy, advice-linter word list |
| 19:00–19:30 | Dinner |
| 19:30–23:00 | Sprint 2 — Fine Print highlights; clause cards; Dollar Pipeline; What-moves-these-numbers; Privacy Panel; end-to-end on Fixture A |
| **23:00** | **Checkpoint 1** — end-to-end path on Fixture A with cached extraction, linter green? Decide F1 vs F1-lite; cut per §4 |
| 23:00–01:00 | Sprint 3 — Cost Calendar; second fixture (Lincoln Iredell); option fit if free |
| 01:00–03:00 | Sprint 4 — error states, DHMO detect, delete-all demo, mock 271 if free, Reminders only if everything else is green; **record backup video** |
| **03:00** | **Checkpoint 2** — feature freeze; cut anything not demo-ready; sleep rotation |
| 06:30–08:00 | Devpost packet (description, architecture + storyboard, security write-up, licensing-cost note, screenshots, repo, demo credential, video); rehearse ×3 |
| 08:00–09:00 | Projector rehearsal; freeze |
| **09:30** | **Submit** (buffer to 10:30) · 10:30 demos |

Workstreams for 5–8 people: A engine; B extraction/redaction; C UI; D security/infra; E content/policy/pitch; F QA + video; G packet. For 3 people: A engine + infra, B extraction + fixtures + security, C UI + pitch; cut Reminders, OON, mock 271, option fit up front.
Failure fallbacks: cached extraction JSON shipped; engine offline; local API on the demo laptop; MOCK 271 fixture; recorded video; sentence cards without positional highlight.

## 15. Five-minute presentation — timed script

- **0:00–0:30 Problem.** "Priya's dentist hands her this plan: root canal and crown on a molar, a filling, a cleaning. Her card says 100/80/50; the office quote is $971. Her certificate is 62 pages. Somewhere in it are the sentences that decide what she really owes." (Slide: the same root canal is Major at Delta and Lincoln, Basic at MetLife and Guardian.)
- **0:30–1:30 The hero (live, phone).** Photo of the plan → redaction preview ("this is all the AI sees") → the certificate appears and dims to **seven highlighted sentences**. Tap the crown: "Clause · Plain words · Your dollars: the plan computes its share from a $1,100 cast-crown allowance; $177 of the $1,454 fee is outside it."
- **1:30–2:30 All the costs.** Dollar Pipeline per procedure; total range $1,514–$2,673; "What moves these numbers": remaining maximum ±$1,160, where it lives. Enter $700 → $1,973; "your deductible does not change these numbers this year."
- **2:30–3:30 The calendar, not a recommendation.** Cost Calendar: the crown at $1,338.50 in December vs $929 in January under completion dating, identical under preparation dating; root canal row marked "urgent per your dentist." "We show what each date costs. We never pick one. That is a design rule enforced by code" — show the advice linter blocking a sentence.
- **3:30–4:15 Privacy that you can see.** Privacy Panel: redacted payload, per-user KMS key, where data lives, tap **Delete** — gone. Architecture slide (PWA → API → engine; Bedrock citations two-call; Cognito/KMS/S3; EventBridge push).
- **4:15–5:00 Evidence, limits, next.** Six carriers' documents differ in kind; fewer than 5% of members reach the maximum — which is why we inform rather than optimize; limits: fees are fixtures, extraction accuracy measured on three brochures (state the number), DHMO unsupported; next: a carrier-connected version where ranges become points. "Information only. Not advice. Not a guarantee of payment."

**30-second pitch.** "Dental surprise bills come from sentences nobody reads until the claim is paid. FinePrint takes your dentist's treatment plan and your plan document, finds the sentences that apply, and translates each one into dollars on your own procedures — as honest ranges, with every figure traceable to a page, and with nothing that tells you what to do. Your data is redacted before any AI sees it and encrypted with a key that is yours alone."

## 16. Ten likely judge questions — answers

1. **Isn't this advice?** "No. It states what the documents say and what the arithmetic yields under conditions you can toggle. A deterministic linter blocks recommendations and nudges in every string, including model output; nothing is pre-selected."
2. **How accurate is the extraction?** "Measured tonight on three public brochures against hand-built gold clauses — [state %]. Every field shows its quoted sentence; the user confirms; the math is deterministic and unit-tested on 19 cases."
3. **Everyone has a benefits chatbot — what's different?** "A chatbot answers questions. We dim a 62-page certificate to the sentences that apply to your procedures and turn each into a dollar line on your own plan, show ranges where the document can't know, and never recommend."
4. **Where do fees come from?** "The office's quoted fee is the input; fixtures are labeled list prices and the state Medicaid floor. Contracted fees live with the carrier and office."
5. **Security — concretely?** "Redaction before any model call, visible to the user; client-side encryption; per-user KMS envelope keys; per-user S3 prefixes enforced by IAM; ephemeral processing; crypto-shred delete; no third-party scripts. HIPAA-covered use would need a BAA; as a consumer app we fall under the FTC Health Breach Notification Rule."
6. **CDT and FAIR Health licensing?** "No CDT catalog shipped; codes appear only from the user's own document with the ADA notice. FAIR Health is not used — its terms forbid it."
7. **What if the user has no certificate?** "Carrier public brochures and employer summaries are fixtures; unknown fields stay unknown and the ranges say so. Remaining maximum is typed or, in production, pulled from eligibility — shown with a mock 271."
8. **Why not optimize timing for them?** "Fewer than 5% of members reach the maximum, most carriers date crowns by completion, and clinical urgency is the dentist's call. We show every date's cost; the user decides."
9. **Lincoln relevance?** "A carrier holds exactly the numbers that make our ranges wide; connected to one, the range becomes a point and the member still sees the clause behind every line. No endorsement implied."
10. **Mobile?** "Phone-first PWA — the capture moment is a phone photo at the front desk; Web Push works on iOS 16.4+ Home Screen apps; wrappable in Expo if native is required."

## 17. Submission checklist

- [ ] One entry; team 3–8; all on-site.
- [ ] Working app URL + repo + demo credential (Cognito demo user).
- [ ] Written description: outcomes A–C mapping; the seven must-haves; architecture + storyboard (criterion 9); security write-up (criterion 7); information-only policy; **licensing-cost note** (Bedrock pricing; open-source libraries; no CDT catalog; FAIR Health not used).
- [ ] 2–3 minute recorded demo (also the fallback).
- [ ] Submit by **10:30 EDT** (target 09:30); confirm channel with the coach.
- [ ] Demo kit: laptop with local API fallback, phone with PWA installed, HDMI adapter, cached fixtures, printed clause-variation sheet.
- [ ] Label everywhere: working software · MOCK data (member state, 271) · labeled assumptions (fees, OON) · future (carrier connection).

## 18. Evaluation measures

**Collected:** engine 19/19 hand-derived cases; sensitivity: waiting changes the crown's cost only when 2026 remaining < $1,110; dating rule flips the difference to $0; policy-year plans show no boundary.
**Targets tonight:** extraction field accuracy ≥90% and correct page ≥95% on three brochures; 0 linter violations in UI and model output; photo→Fine Print view ≤60 s; redaction catches 100% of names/IDs in the fixture photo; delete-all completes <5 s on stage.

## 19. Fallback and first validation action

**Fallback (F1-lite):** form-entered plan parameters prefilled from fixtures → same engine, pipelines, movers, calendar, privacy panel; the model only translates a selected clause into plain words (linter still applies). **Trigger:** by Sat 23:00 the extraction-confirm loop is not stable on at least two of three fixtures. **First validation action (now, before any UI):** one Bedrock call with citations on the Delta FEDVIP 2026 brochure for class list, cleaning frequency, waiting period, deductible scope and the alternate-benefit paragraph; compare with the gold quotes in `reports/.../notes/1-plans.md`; put the score on the trust slide.
