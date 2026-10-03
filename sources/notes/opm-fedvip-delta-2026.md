# Notes — opm-fedvip-delta-2026 (Delta Dental's Federal Employees Dental Program, FEDVIP 2026, brochure 02AP-05)

Retrieved 2026-10-03 with WebFetch only (protocol §2). Primary: OPM PDF
https://www.opm.gov/healthcare-insurance/healthcare/plan-information/plans/pdf/2026/brochures/02AP-05.pdf (62 pp.).

## What was opened and how far it reached
- OPM PDF: readable through about **page 29** (Introduction, 2026 changes, Program Highlights, Sections 1–4, Section 5 Class A, Class B, Class C through Prosthodontic Services). The fetch tool's PDF→text conversion stops there ("Content truncated due to length"). 11 focused prompts were run against it.
- BENEFEDS copy of the same PDF (cdn.benefeds.gov/.../Delta2026.pdf): same cutoff, ~page 30 (gave one extra sentence set on partial dentures).
- OPM BrochureJson rendering (same brochure as HTML): cuts off at page 18 — worse.
- OPM dental plan index page, OPM Plan Premiums page, OPM FAQ "What is a FEDVIP dental rating area?", carrier plan-compare page: opened; none lists states by region.

## What could not be opened (see `access_limits` in the JSON)
- Brochure **pages ~30–62**: rest of Class C (Implant Services incl. D6010), Class D Orthodontic, adjunctive codes (occlusal guards D9944–D9946), Section 6 International, **Section 7 General Exclusions**, Section 8 Claims, **Section 9 Definitions**, Summary of Benefits, **Rate Information / regions by state**.
- Carrier "2026 Plan Highlights" PDF: `ROBOTS_DISALLOWED`.
- OPM 2026 premium and 2026 rating-region spreadsheets (.xlsx): binary; WebFetch cannot read them and other download tools are prohibited.
- One fetch declined a bulk verbatim request on copyright grounds; re-asking for short (≤25-word) quotes worked, which is what the protocol prefers anyway.

## Judgment calls
1. **Table cells.** The deductible, coinsurance and annual-maximum tables (pp. 15–16) came back as `label: value` renderings (e.g., "Out-of-Network Standard Option: $75"). Labels and values are as printed, but a contiguous passage cannot be verified, so every table-derived fact is `review_status: needs_review` while `confidence: high` (values identical across two independent fetches; in-network Standard class percentages reconcile with the carrier page's plan-pays 100/55/35%).
2. **Coinsurance basis is YOU PAY**: "Coinsurance is the percentage of our allowance that you must pay for your care." (p. 15). All 16 class percentages are stored as `percent_you_pay`. Class D (orthodontics) captured but orthodontia is unsupported in the app.
3. **Deductible structure is per class and per network**: $0 everywhere in-network and for Class A/D; $50 (High) / $75 (Standard) out-of-network on the Class B and Class C rows. Whether that is one combined amount for B+C or one per class is **not stated** in readable text — flagged in notes/gaps, not assumed. "There is no family deductible limit." + "Each enrolled covered person must satisfy his/her own deductible".
4. **Annual maximum**: Standard $1,500 in / $1000 out (printed without comma); High "Unlimited" in / $3,000 out; combined between networks within an option. Implants: $2,500 per person per calendar year under High (combined networks, counts toward the annual max); "A separate implant maximum does not apply under the Standard Option."
5. **Root canals are Class C (Major)** in this brochure (D3330, p. 28) — differs from plans that treat endodontics as basic. Recorded as printed.
6. **Waiting period / missing tooth**: full-text search of pp. 1–29 found no occurrence; because Sections 7/9 and the Summary of Benefits are unreadable, both are `UNKNOWN` rather than "none".
7. **Premiums and NC region**: `UNKNOWN`. A federal court HR office PDF (pamd.uscourts.gov, "2026-Dental-Insurance-Premium-Rates.pdf") reproduces 2026 rates per region number (e.g., Delta High region 1 biweekly $18.31 Self Only … region 5 $27.30) but is a third-party summary without a state map and without an OPM citation — **not recorded as evidence**; lead only. The authoritative file is OPM's "2026 Dental Rating Regions 100525" .xlsx.
8. **Implant / night guard**: no CDT code could be quoted (lines fall after the cutoff). Mappings carry `external_code: null`, `review: true`, with the only readable related sentences (implant max p. 16; "D9936 Cleaning and inspection of occlusal guard – per appliance" p. 4).
9. Minor text variance between fetches on the implant sentence ("out of network" vs "out-of-network") → flagged `needs_review`; amounts and page identical in all three fetches.

## Open questions for a follow-up with a different reader
- Read pp. 30–62 (needs a PDF reader that is not length-capped, or a per-section HTML source) for: D6010 class/percentage, D9944–D9946, Class D, Section 7 exclusions (missing tooth, age limits for fluoride), Section 9 "plan allowance" definition, Summary of Benefits (waiting-period statement), and the Rate Information pages with the five regions listed by state.
- Confirm whether the out-of-network deductible is combined across Class B and C and that it resets per calendar year.
- Confirm per-person wording on the annual maximum.
