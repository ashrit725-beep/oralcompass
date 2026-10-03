# NC dental plan documents, plan year 2026 — research notes (2026-10-03, ~21:14–21:36 UTC)

Protocol followed: `sources/RESEARCH_PROTOCOL.md` (WebSearch to locate, WebFetch to open; no curl/wget/python fetches).
Caveat on method: WebFetch converts the PDF and answers through a small sub-model that caps quotes at ~125 characters and
refuses full-text dumps. Facts were therefore collected field by field and, where it mattered, re-asked in a second call.
Cells that came back differently across calls are recorded as `AMBIGUOUS` (Delta) or `needs_review` (MetLife), never resolved by judgment.

## Opened and extracted

1. **OPM FEDVIP — The MetLife Federal Dental Plan 2026 (form 02AP-11)** → `sources/extracted/opm-fedvip-metlife-2026.json`
   - URL: https://www.opm.gov/healthcare-insurance/healthcare/plan-information/plans/pdf/2026/brochures/02AP-11.pdf (71 pp.; footer
     "2026 The MetLife Federal Dental Plan <n> Enroll at www.BENEFEDS.gov"). Nationwide incl. NC; "This brochure is the official
     statement of benefits." (p. 2). Coverage from January 1, 2026 (p. 7).
   - Captured with footer-verified pages: deductibles (p. 22), annual maximum (p. 23), Class A/B/C/D "You pay" headers (pp. 25, 29, 33, 41),
     alternate-benefit clause (p. 18), out-of-network Plan Allowance = in-network Plan Allowance + balance-billing sentences (p. 17),
     CDT © notice (p. 7), frequency rows with printed CDT codes for exams, cleanings, bitewings, fluoride, sealants (p. 26), fillings
     replacement 1 in 24 months (p. 29), SRP 1 every 24 months per quadrant (pp. 30–31), extractions (p. 31), crowns 1 per tooth every
     60 months (p. 33), prior-service note (p. 33), occlusal-guard frequency change to 1 in 24 months (p. 6).
   - 12 CDT mappings recorded (exam D0120, cleaning D1110, bitewings D0274, fluoride D1208, sealant D1351, amalgam D2150, composite D2392,
     extraction_simple D7140, extraction_surgical D7210, SRP D4341, crown D2740, cast_crown D2790); `review: true` where several codes fit.
   - **Could not extract**: Rate Information p. 71 (three attempts; only "Your rates are determined based on where you live. This is
     called a rating area." surfaced) → premiums UNKNOWN. The converter's text window ended around pp. 29–33 in several calls, so
     D3330 (molar root canal), partial dentures (D5211–D5214), implant body (D6010), occlusal-guard codes (D9944–D9946), Section 7
     exclusions (p. 50) and the Definitions entry for Plan Allowance (p. 59) are UNKNOWN or `needs_review`. No sentence containing
     "waiting" was found → waiting periods UNKNOWN (not asserted as none).
   - Judgment call: one call returned Class C rows such as "D5211 Complete denture – maxillary …" and "D6240 Removable unilateral
     denture …" (p. 35). Those descriptors do not match CDT and two verification calls reported the codes NOT PRESENT; that output was
     discarded and is noted in `access_limits`.

2. **Delta Dental of North Carolina — Individual & Family Dental Plans 2026 (non-EHB brochure)** → `sources/extracted/delta-dental-nc-individual-2026.json`
   - URL: https://deltadentalnc.com/hubfs/2026%20DIGITAL_DDNC-Individual-Brochure-nonEHB1%20Final.pdf?hsLang=en (4 pp., printed page
     numbers). Insurer-published, NC-specific, dated ("Rates are effective January 1, 2026 – December 31, 2026."), names Policy form
     INVD-100-Delta-2026-NC and states "The Policy prevails if discrepancies are noted between this brochure and the Policy." (p. 4).
     It is a `plan_brochure`, not the contract — the Policy itself is not posted publicly (search for the form number found nothing).
   - Captured: $50/person, $150/family deductible with the exempt classes (p. 3); maximums $1,000 (Preventive, Enhanced) / $1,500
     (Premium) + $1,000 lifetime ortho (p. 3); plan-pays percentages per class for PPO / Premier / Out of Network (p. 3); waiting
     periods (pp. 1, 3; Enhanced 12 consecutive months for major, waivable with 12 months prior coverage); posterior composite paid at
     the amalgam amount (p. 3); Nonparticipating Dentist Fee basis with balance billing (p. 3 footnote); printed monthly premiums by
     age band (p. 3); exclusions incl. "procedures begun prior to the member's eligibility" and cosmetic (p. 3/4).
   - Document oddities recorded verbatim: the Premium Plan waiting-period text and the orthodontic exclusion both print "Premier Plan"
     where "Premium Plan" is evidently meant.
   - **AMBIGUOUS (extractor disagreement, not document conflict)**: Preventive Plan Basic/Major cells (50/40/40 vs 50/50/50; Major
     "Not Covered" vs a "Simple Extractions" row), Enhanced Plan Major (70/65/65 vs 80/70/70), Orthodontic Premier/OON (50 vs 40).
     Resolve by opening the 4-page PDF directly before any of these cells is shown as DOC.
   - Secondary URL (web page, no page numbers): https://deltadentalnc.com/exceptionsandreductions — the limitations page the brochure
     cites. It names 2022/2023 policy forms, not the 2026 form, so its frequency sentences (exams 2/yr, cleanings 2/yr combined,
     bitewings 1/yr age 19+, fluoride 2/yr under 19, sealants 1 per tooth per 3 yrs, root planing once per two years, crowns once per
     five years per tooth, occlusal guard once per benefit year ages 13–19 / once per lifetime 19+, alternate-benefit clause) are
     recorded as `AMBIGUOUS` for plan year 2026.
   - No CDT codes printed → `procedure_mappings` empty.

## Looked for and rejected / could not open

- **Blue Cross and Blue Shield of North Carolina — Dental Blue for Individuals**: no benefit booklet/policy PDF is linked from
  bcbsnc.com (members/dental-blue, shop-plans/dental/compare, member forms). Only a quote tool (shopper.bcbsnc.com) and an undated
  limitations web page (https://www.bcbsnc.com/assets/shopper/public/dental/limitationsExclusions.htm — no plan name, date or form
  number) exist publicly. Not extracted as evidence.
- **"Dental Blue Policy (Rev. 9/24)"** at myrxtoolkit.com — opened; it is **BlueCross BlueShield of South Carolina** ("Every Qualified
  Individual or Enrollee who applies for coverage will be accepted if the applicant is a South Carolina Resident.", p. 5). Rejected.
- **bluecrossnc.com Medicare dental benefit highlights (bh-comprehensive-1500-max-26.pdf)** — Medicare Advantage supplemental dental,
  not individual/group dental insurance; not opened further.
- **Delta Dental NC group certificate, Wake Technical Community College Low Plan 2026** (piercegroupbenefits.com) — a full certificate
  but hosted on a broker site; not opened within the time box. Candidate for a future pass if the insurer or the college posts it.
- **Delta Dental NC EHB-certified 2026 brochure** (deltadentalnc.com/hubfs/2026 EHB Individual and Family Brochure DIGITAL Final.pdf) —
  located, not opened (time box); listed as a secondary URL.

## Open questions for the next pass
1. Open the MetLife PDF pages 34–71 with a different converter (or the BENEFEDS copy) to capture endodontics, prosthodontics, implants,
   occlusal guards, Section 7 exclusions, Plan Allowance definition and the rating-area rate table (NC region).
2. Open the Delta NC brochure page 3 table directly to settle the four AMBIGUOUS cell sets.
3. Ask Delta Dental NC whether Policy INVD-100-Delta-2026-NC is available on request; the brochure's limitation list is explicitly partial.
