# delta-msu — research notes (2026-10-03)

## What was opened (WebFetch only; no curl/wget/python downloads)
1. **Evidence of Coverage, form PPO-ENT-MS-E-R23**, Delta Dental Insurance Company, Mississippi State University, Group No: 01125,
   "Effective Date: January 1, 2024" — https://www.hrm.msstate.edu/sites/www.hrm.msstate.edu/files/2024-03/Delta%20Dental%20Evidence%20of%20Coverage.pdf
   (14 fetch passes). Parts and footer codes: main document `PPO-ENT-MS-E-R23 n 01125` (TOC: Introduction 1, Definitions 2,
   Eligibility 3, How To Use This Plan 5, Selecting Your Dentist 6, How Claims are Paid 6, Complaint 9, COB 9, Renewal/Termination 10,
   General Provisions 11); **Attachment A** `E-PPO-A-DM2LH2 1-2 01125` (Deductibles, Maximums and Contract Benefit Levels);
   **Attachment B** `ENT-LE-MS-22 1-7 01125` (Services, Limitations (35 items), Exclusions (34 items)); HIPAA notice (5 pages,
   "effective on and after January 1, 2017"). Order in the text stream: main → Attachment A → Attachment B → HIPAA.
2. **Benefit Highlights sheet** "Plan Benefit Highlights for: Mississippi State University Group No: 01125", form codes
   `HL_PPO #128472EA (rev. 7/20)` and `HLT_PPO_2COL_HILO_DDIC (Rev. 8/26/2020)`, file name "...2021.pdf" — prints **Monthly Rates**
   (Enrollee only $28.82 Low / $41.57 High; Enrollee + 1 or more dependents $60.13 / $86.49). No plan year printed. Extracted to
   `msu-dental-benefit-highlights-2021.json`.
3. HRM pages: /benefits, /benefits/insurance, /benefits/insurance/dental (last modified 2026-05-04 per page metadata). The dental page
   says "A dental plan that provides two options, High Option and Low Option" and "The employee is responsible for the full cost."; it
   links only the 2024-03 EOC, the 2021 highlights sheet, a 2021-05 "Advantages of Delta Dental" PDF and a claims example.
4. Claims example PDF (2021-05 path) — "Delta Dental PPO plus Premier – Claim Payment Example" dated Q4 2012, "hypothetical numbers for
   illustrative purposes only". Not used (illustrative, old, and the fetcher's rendering of its figures was internally inconsistent).

## Could not open / not found
- https://www.hrm.msstate.edu/forms/delta-dental-enrollment-change-form → HTTP 403.
- **No 2025 or 2026 EOC and no MSU-specific 2024-2026 rate sheet** anywhere on hrm.msstate.edu or via WebSearch. Recorded as a gap:
  "newer version not found at hrm.msstate.edu/benefits/insurance/dental (page last modified 2026-05-04 still links the 2024-03 EOC)".
- Physical PDF page indexes are not visible through WebFetch; only the printed footer page numbers per part. Mapping for seeding:
  physical index = (title page + TOC page, unnumbered) + main pages (11-13, unresolved) + Attachment A (2) + Attachment B (7) + HIPAA (5).

## Judgment calls
- **Page numbering**: facts carry the footer page *within the part* (`page_numbering: section_page` for Attachments, `pdf_footer` for
  the main document) and name the part in `section`. The small model's page attribution drifted ±1 on three items (fluoride L.4: p.2/p.3;
  crowns L.24: p.4/p.5; "incurred" rule: main p.3/p.4); those are `needs_review`. Everything must be re-verified on the real PDF by
  `tools/seed_presets.py`.
- **Verbatim refusal**: the fetcher declined to dump all of Attachment B; I switched to item-by-item short-quote prompts. Quotes
  were cross-checked where two passes returned the same sentence (crowns, implants, SRP, 24-month filling rule, exam/cleaning).
- **Waiting period** is stated by service *type* ("Restorative, Endodontics, Periodontics, and Prosthodontics"), not by class.
  Restorative (fillings) is Basic → composite/amalgam wait 12 months; Oral Surgery (extractions), Sealants, Palliative, Denture Repairs
  (Basic) are not named → no wait in the text. "Crowns and Inlays/Onlays" is a separate Major item not literally named → **AMBIGUOUS**.
- **Implants**: two separate passages — Limitation 33 (p.6: "We will not pay for implants ... but We will credit the cost of a pontic or
  standard complete or partial denture ...") and Exclusion 34 (p.7: "services for implants (prosthetic appliances placed into or on the
  bone ...)"). Both recorded; not a contradiction.
- **Posterior composite downgrade**: not found in Limitations 1-35 / Exclusions 1-34 → UNKNOWN (not stated), not "false".
- **Missing tooth clause**: not found → UNKNOWN. Closest: Exclusion 7 (procedures before eligibility), Exclusion 11 (bridges/partials under 16).
- **Highlights-sheet premiums**: recorded as DOC with `confidence: medium` and an explicit "plan year not printed; rev. 8/26/2020" caveat.
  Under CLAUDE.md rule 8/"no premium figures not printed in a stored document" they may be shown only with that date and caveat.
- **Low Plan** recorded as a separate `plan_option` (Basic 50%, Major 25%, max $1,000, Ortho "Not Covered", deductible waiver D&P only).

## Conflicts with the existing DD24 preset (fix list for seeding)
1. Quotes "Diagnostic & Preventive 100%", "Basic 80%", "Major 50%" are **not verbatim**; rows read
   "Diagnostic and Preventive Services 100% 100% 100% 100%", "Basic Services 80% 80% 50% 50%", "Major Services 50% 50% 25% 25%"
   (columns: High PPO | High Premier & Non-Delta | Low PPO | Low Premier & Non-Delta).
2. `excluded.implant` cite: page 3 / "Exclusion 34" → actually **Limitation 33, Attachment B footer p.6**; Exclusion 34 (p.7) is different text.
3. `frequency.cleaning` cite page 1 → **Limitation 2(a), Attachment B p.2**; `frequency.crown` cite page 1 → **Limitation 24, p.5 (±1)**;
   `alternate_benefit` cite page 1 → **Limitation 1, p.2**.
4. `classes[Major].cite` joins "(3) Endodontics: ..." and "(4) Periodontics: ..." into one quote — the item number sits between them.
5. `waiting_months {Basic:12, Major:12}` is broader than the text (see judgment call); crown wait is ambiguous.
6. `alternate_benefit.conditions` = mandibular_molar only; text also names "a maxillary second or third molar", and the alternate basis
   is "a porcelain fused to high noble metal crown" allowance (no dollar amount → plan payment is an upper bound).
7. `oon_rule.value.in` is a paraphrase; verbatim: "PPO Dentists have agreed to accept the PPO Maximum Allowance as payment in full for covered services."
8. Confirmed as-is: Calendar Year definition (p.2), "$50 per Enrollee each Calendar Year", "$1,500 per Enrollee per Calendar Year",
   "A Non-Delta Dental Dentist can bill You the difference" (p.6), "Pre-Treatment Estimate requests are not required" (p.5),
   "$1,200 per dependent child Enrollee to age 26 per lifetime" (Att. A p.1), dos_rule note ("Continuation of Benefits", main p.4 ±1),
   premiums UNKNOWN in the EOC, allowed amounts UNKNOWN, form number PPO-ENT-MS-E-R23, dependent children "from birth to age 26".

## Open questions
- Exact Low Plan deductible-waiver cell text (cells were concatenated in extraction).
- Item number of the root-canal retreatment sentence (between Limitations 14 and 18).
- Main-document page count (11 vs 13) and therefore the physical index of Attachments A/B.
- Whether MSU publishes current dental premiums anywhere public (Employee Navigator is login-only).
