# NCFlex Dental Plan (MetLife), plan year 2026 — research notes (2026-10-03)

Scope: State of North Carolina NCFlex Dental Plan, High / Classic / Low options, emphasis Classic (app preset ML26).
Tools: WebFetch/WebSearch only (per protocol). WebFetch's answering model caps each quote at ~125 characters, so long
cells were captured once as a full transcription and then re-verified in targeted passes.

## Documents opened (one JSON each in `sources/extracted/`)
| JSON | Document | Date as printed | Pages reached |
|---|---|---|---|
| `ncflex-2026-plan-details.json` | 2026 NCFlex Dental Plan Details from Benefits Guide (pp. 24–26 of "Benefits Guide 2026", cover "August 2025"; OSHR page: first published / last updated September 2, 2025) | 2025-08 (guide cover) | all 3 pages (24, 25, 26) — full verbatim transcription + 3 verification passes. Parent 56-page guide also fetched for plan-year/eligibility sentences (pp. 2, 4, 6). |
| `ncflex-metlife-classic-certificate-2020.json` | MetLife Classic Option certificate, Policy 165756-1-G, "Certificate Date: January 1, 2020"; plus the two Certificate Riders CR2000 "Effective Date: January 1, 2024"; plus the UNC Chapel Hill Classic edition (same date/policy) | 2020-01-01; riders 2024-01-01 | face page, TOC, Schedule (sch 47), Definitions (def 48–50), eligibility to e/ee 51. **Text ends at p. 51; pp. 59–76+ (Dental Insurance, Covered Services, Exclusions) NOT reachable.** Riders: 1 page each, fully read. |
| `ncflex-metlife-high-certificate-2018.json` | MetLife High Option certificate, "Certificate Date: January 1, 2018" (OSHR label "12/2017") | 2018-01-01 | Schedule (p. 41), Definitions (p. 45); text ends at p. 50; clause bodies (pp. 55–72) NOT reachable. |
| `ncflex-metlife-low-certificate-2020.json` | MetLife Low Option certificate, "Certificate Date: January 1, 2020" | 2020-01-01 | Schedule (p. 46), Definitions (p. 49); text ends at p. 50. |

Also looked at (no JSON): OSHR "NCFlex Dental Insurance Documents" page (inventory of certificates — none newer than 1/1/2020 for
Classic/Low, 12/2017 for High; riders 1/1/2024); OSHR "Dental Plan Options" page (restates the 2026 summary; no dates); MetLife FAQ
sheet (ADF# D1422.16, © 2025 MetLife Services and Solutions, LLC; only fact: pre-treatment estimate "in excess of $300"); July 2025
employee-session slides (2025 rates only; nothing on Types/waiting/alternate benefit); 2025 Plan Details (not needed).

## Key results for the ML26 preset
- Column order confirmed on both tables: **High Option | Classic Option | Low Option**.
- Classic monthly cost, all tiers (p. 24): Employee Only **$37.94**; Employee and Spouse $76.06; Employee and Child(ren) $82.40; Employee and Family $130.22.
  High: $58.76 / $117.88 / $127.12 / $208.12. Low: $25.64 / $51.70 / $55.54 / $88.50.
- Deductible (p. 25): High $50/$150; Classic $25/$75; Low $25/$75 "Calendar-Year Deductible (per person/per family)".
  Certificate wording (Classic sch 47): "$25 for the following Covered Services Combined: Type B; Type C; excluding implants and implant services".
- Calendar-year maximum (p. 25): $5,000 / $1,500 / $1,000 "(Per covered person; excludes orthodontic services under the High Option and Classic Option Plans)".
- Percentages (p. 25): Type I 100% / 100% / "100% after deductible"; Type II row 1 (fillings incl. composite, simple extractions, endodontics,
  re-cement, denture repair) 80 / 60 / 50 "after deductible"; Type II row 2 (periodontal services incl. scaling and root planing, perio
  maintenance, oral surgery (wisdom teeth), general anesthesia) **50 / 50 / 50**; Type III (crowns incl. single implant crowns, dentures,
  bridges, implants) 50 / 50 / Not Covered; Type IV ortho 50 / 50 / Not Covered.
  Basis: the guide never prints "plan pays"; footnote says "Reimbursement for out-of-network services is based on reasonable and
  customary (R&C) charge" and the certificates' schedule header reads "Covered Percentage for: In-Network based on the Maximum Allowed
  Charge | Out-of-Network based on the Reasonable and Customary Charge" — recorded as percent_plan_pays, confidence medium.
- Frequencies printed in the guide: exam 2/calendar year; cleaning 2/calendar year; bitewings 1/calendar year; FMX or pano 1 every five
  years; fluoride 2/calendar year under age 19; sealants permanent first and second molars under age 16 ("see certificate for frequencies");
  filling replacements once every 24 months; perio maintenance 2 per consecutive 12 months; crowns/dentures/bridges replacements every
  seven years; crowns not eligible for dependent children under age 14; "Single prosthetic procedures are considered completed on the date
  they are inserted, not the date of impression." (supports dos_rule = completion/insertion for crowns).
- Night guard: guide exclusion "Appliances or treatment for bruxism (grinding teeth)." (p. 26, "partial listing").
- Network: "MetLife Preferred Dental Provider (PDP) Plus Network"; in-network MAC = negotiated fee; OON R&C "lowest of" three-part test,
  no percentile in the guide. Certificates: 70th percentile (Classic def 50; Low p. 49), **80th percentile (High p. 45)**.
- Benefit year: "Year or Yearly, for Dental Insurance, means the 12 month period that begins January 1." (Classic def 50 — the preset cites
  "page 1"; correct to def 50). Dependent child "under age 26" (def 48).
- Pre-estimate: encouraged at "$300 or more" (guide p. 24).

## Conflicts preserved (see `conflicts` arrays)
1. Guide labels the 50% periodontal/oral-surgery/anesthesia row "Type II", but certificates have Type B = 60% (Classic) / 80% (High);
   the 50% row corresponds to certificate Type C. Class label for `scaling_root_planing` and `extraction_surgical` → AMBIGUOUS; 50% itself is DOC.
2. Implants and the deductible: guide Type III row (lists Implants) "50% after deductible" vs Classic certificate "excluding implants and
   implant services" from the deductible. Guide p. 26: "If there are any discrepancies, the plan policy certificate and/or contract shall govern."
3. Version: certificates dated 1/1/2020 (Classic, Low) and 1/1/2018 (High), amended 1/1/2024, vs plan year 2026 guide. Schedule values
   match the 2026 guide for all three options, but clause bodies could not be compared.
4. High certificate label "12/2017" (OSHR) vs printed "Certificate Date: January 1, 2018".

## Gaps / UNKNOWN (where looked)
- Alternate benefit clause, missing tooth clause, waiting period (absent from guide pp. 24–26, full guide, FAQ, slides, and certificate
  schedules; the certificate DENTAL INSURANCE section p. 59 was not reachable — absence NOT confirmed), sealant frequency, SRP per-quadrant
  limits, posterior composite rule, crown material distinction, partial-denture type, implant body vs crown, surgical extraction of
  non-wisdom teeth, in/out-of-network sharing of deductible/maximum.
- The dental pages do not print "2026"; the year comes from the guide cover and OSHR title (effective_period note).
- No CDT codes in any opened document → `procedure_mappings` empty in all four JSONs.

## Access failures / judgment calls
- WebFetch's PDF→text for all three certificates (and the UNC Classic edition) ends near printed page 50–51 (certificates run 72–76+ pages).
  Everything from the DENTAL INSURANCE section onward is therefore UNKNOWN. No non-sanctioned fetch was attempted.
- One targeted pass over the plan details wrongly answered NOT PRESENT for "plan year"/"enroll"; a third pass confirmed the transcription,
  which is used. The exclusion bullet is printed "lost of stolen" (sic) and is quoted as printed.
- The High and Low certificates got one to two passes each (time box); their deductible lines may carry an implant tail not captured.
- The second rider PDF ("...options112024") contains both the removable-appliance and implant-repair changes; the first ("...-1124") returned
  only the removable-appliance change — recorded as returned, not reconciled.

## Suggested preset edits (for the caller; not applied)
premium_monthly.employee_only → 3794 (DOC, p. 24); class_of.composite → Type II DOC (guide p. 25) with alternate allowance still UNKNOWN;
class_of.crown/cleaning/root_canal → cite guide p. 25 instead of the flagged 2025 summary; benefit_year cite → Classic def 50;
dos_rule → completion/insertion (DOC, p. 25, crowns); add exclusion night_guard (p. 26); add deductible implant conflict; keep
waiting_months/alternate_benefit/missing_tooth UNKNOWN.
