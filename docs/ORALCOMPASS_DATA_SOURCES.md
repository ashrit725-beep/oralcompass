# OralCompass — data sources, imports and research record

Generated 2026-10-03 from `fixtures/sources.json`, `fixtures/ingest_report.json` and `fixtures/audit_report.json`
(re-run `python3 tools/ingest_sources.py && python3 tools/audit_data.py` after any change to `sources/extracted/`).

## 1. What was audited first (state before this import)

| Area | Found | Problem |
|---|---|---|
| Procedures | 16 internal keys in `fixtures/procedures.json` with fictional demo fees | No external identifiers; fee source fictional (labeled) |
| Plans | 2 real presets (DD24 Delta Dental MSU 2024; ML26 NCFlex MetLife 2026), 4 fictional | DD24: cites were attachment page numbers with non-verbatim quotes, implant cite pointed at the wrong item, waiting period applied to whole classes; ML26: class/frequency facts came from an unreliable 2025 summary table, premium UNKNOWN although printed in the 2026 guide, benefit-year cite wrong page; both used the key `root_canal` (not an internal key — unsupported mapping) and covered only 4 of 16 procedures |
| Coverage rules | Per plan: class_of for 4 keys | 12 procedures had no class in either real plan → every estimate for them was unresolved |
| Fees | Only fictional dentist fees | No published fee reference with payer/geography/date |
| Documents | 4 fictional PDFs stored; real documents referenced by URL only | No SHA-256, no page index, no evidence list per clause |
| Relationships | Sam/Jordan users and journeys | Consistent (no dangling links); `network_default` stored as an object (fixed in seeding) |

## 2. Source inventory (all opened through the sanctioned text-extraction fetch on 2026-10-03)

| Label | Document | Publisher | Dated / in effect | Scope | Contributes | Access limits |
|---|---|---|---|---|---|---|
| ML26 | 2026 NCFlex Dental Plan Details (Benefits Guide pp.24–26) | NC Office of State Human Resources | guide Aug 2025; plan year 2026 | North Carolina state employees; MetLife PDP Plus | ML26/ML26H/ML26L rules, premiums (all 12 cells), frequencies, exclusions | pages do not print "2026" (year from guide cover); no CDT codes |
| ML20c / ML18h / ML20l | MetLife certificates (Classic 1/1/2020, High 1/1/2018, Low 1/1/2020) + 2024 riders | NC OSHR / MetLife | 2020 / 2018 (amended 2024) | same group policy 165756-1-G | benefit-year definition, R&C percentile (70th / 80th), implant deductible wording | text reachable only to ~p.50–51: covered-service lists, alternate benefit, waiting period, missing tooth, exclusions NOT reached → UNKNOWN |
| DD24 | Delta Dental PPO Evidence of Coverage, Mississippi State University group 01125 (form PPO-ENT-MS-E-R23) | MSU HRM (Delta Dental Insurance Company document) | effective 2024-01-01; no newer EOC found (HRM page last modified 2026-05-04 still links it) | Mississippi | DD24/DD24L rules: 15 class memberships, 10 frequency/age limits, exclusions, alternate benefit, payment basis | page numbers are per PART (main / Attachment A / Attachment B); three attributions ±1; premiums not in the EOC |
| MSU20h | MSU Benefit Highlights sheet rev. 8/26/2020 | MSU HRM | no plan year printed | Mississippi | monthly rates (AMBIGUOUS applicability) | waiting-period sentence conflicts with the EOC |
| FM26 | The MetLife Federal Dental Plan 2026 (FEDVIP brochure 02AP-11) | U.S. OPM | plan year 2026 | nationwide incl. NC | FM26H/FM26S rules with 12 printed CDT codes, frequencies, alternate benefit, OON basis | pages ~33–71 unreachable: rates, exclusions, endodontic/prosthodontic/implant/occlusal-guard rows UNKNOWN |
| FD26 | Delta Dental's Federal Employees Dental Program 2026 (02AP-05) | U.S. OPM | plan year 2026 | nationwide incl. NC | FD26H/FD26S rules with 14 printed CDT codes, separate OON deductible/maximum, implant cap | pages ~30–62 unreachable: rates/regions, exclusions, implants, occlusal guards |
| DN26 | Delta Dental of North Carolina Individual & Family Dental Plans 2026 (brochure, 4 pp.) | Delta Dental of NC | rates effective 2026 | North Carolina residents | recorded as evidence (44 facts, 14 AMBIGUOUS); NOT imported as a preset because the governing Policy (INVD-100-Delta-2026-NC) is not public and the brochure's table cells were read inconsistently | policy not posted; limitations page cites 2022/2023 forms |
| NCMED26 | NC Medicaid Dental Reimbursement Rates (last revision Apr 1, 2026; rows effective 10/1/2025) | NC DHHS (ADA-hosted copy) | effective 2025-10-01, open-ended | North Carolina, Medicaid fee-for-service | 22 benchmark rows (cents) for mapped codes; 11 codes absent | official portal robots-blocked → ADA-hosted copy; byte identity unverified; no page markers |
| ADACDT | ADA Dental Terminology licensing page + sell sheet | American Dental Association | — | — | reuse terms (commercial license required for CDT; no free exemption found) | license agreement DOCX not opened; fees unpublished |
| CDTMAP | Aggregated code mappings from the above + Aetna/GEHA/UHC FEDVIP brochures, WI ForwardHealth and OK OHCA PDFs | various (official) | 2026 | code identification only | 57 mapping candidates for the 16 keys | long PDFs truncated by the fetch; one hallucinated pass discarded |

Not accessible / not used: NC DHHS ServiceNow fee-schedule portal (robots), Delta Dental FEDVIP plan-highlights PDF (robots), OPM rating-region and premium spreadsheets (binary), BCBSNC Dental Blue booklets (not public), CMS Marketplace PUF (binary download blocked by the build environment's egress policy). Binary PDF downloads from every host above are blocked by the egress policy, so **SHA-256 values and physical PDF page indexes are pending** and the Page view for real plans shows the exact quote, its printed page reference and the official link instead of the rendered PDF.

## 3. Import results (actual counts)

- Sources: 12 · facts: 437 (DOC 370, UNKNOWN 46, AMBIGUOUS 19, CONFLICT 2) · documented conflicts preserved: 11
- Presets written from facts: ML26, ML26H, ML26L, DD24, DD24L, FM26H, FM26S, FD26H, FD26S (9 real) — plus 4 fictional (HB26, SM26, NW26, TW26, generated separately and labeled)
- Procedure IDs: 16/16 kept; 16/16 have at least one external (CDT) code seen printed in an opened document; **review required for 9** (exam, cleaning, bitewing_xrays, fluoride_child, extraction_surgical, scaling_root_planing, cast_crown, denture_partial, night_guard) because more than one code could apply — the UI shows the alternatives and never chooses silently; a code printed on the user's own estimate wins.
- Class coverage per real preset: ML26/ML26H 15 known (2 AMBIGUOUS: scaling_root_planing, extraction_surgical) + 1 excluded; ML26L 11 known + 5 excluded (Type III "Not Covered"); DD24/DD24L 14 known (1 AMBIGUOUS: bitewing_xrays) + 2 excluded; FM26H/S 12 known + 4 UNKNOWN (root_canal_molar, denture_partial, implant, night_guard); FD26H/S 14 known + 2 UNKNOWN (implant, night_guard).
- Fee benchmarks: 22 codes present (D0120 … D7210), 11 absent (D2740, D2750, D2790–D2792, D5213, D5214, D6010, D9944–D9946) — absent means "no published rate", never a substituted number.
- Validation: 0 errors (identifier integrity, class rules, clocks, statuses, cite quotes equal their facts, loader round-trip). Audit: 0 high, 20 medium (all "SHA-256 pending / PDF not stored / DD24 possibly outdated"), 106 informational.

## 4. Separation of published vs personal information

Published (from documents): plan identity, deductibles, maximums, coinsurance (basis recorded: the FEDVIP brochures print *you-pay* percentages, converted to plan share with the conversion noted), deductible exceptions, waiting periods (or UNKNOWN), frequency limits with their periods, exclusions, age limits, alternate-benefit clauses, payment basis, premiums.
Personal (user records, owner-scoped): remaining deductible/maximum (derived from a dated statement: `$1,500 − $240 = $1,260`), eligibility/enrollment date, claim history, dentist's fee (separate field), allowed amount (separate field, with `allowed_source`), appointment dates (with who gave them), dental-team instructions (verbatim, with source).
Benchmarks (NC Medicaid) are a third category: labeled by payer/geography/date/purpose and never used in a calculation unless typed in as a hypothetical.

## 5. Verified end-to-end path (test `api/tests/test_records.py::test_real_data_path_procedure_id_to_cited_rules_to_traceable_calculation`)

`root_canal_molar` and `crown` (existing IDs) → preset **ML26** rules from the 2026 NCFlex guide (Type II 60% / Type III 50% after a $25 deductible, p.25; night guard excluded p.26) → Alex's fictional records (deductible met, $240 used → $1,260 remaining; allowed amounts $980 / $1,020 entered from a pre-treatment estimate response) → ledger: root canal **$392 you / $588 plan**, crown **$510 / $510**, totals **$902 / $1,098**; every coinsurance/deductible/maximum step carries a stitch `ML26#p25`; unknown rules (waiting period, alternate benefit) are flagged, never assumed. Removing the allowed amount yields `unresolved` with a missing-input explanation; out-of-network under FD26S requires the separate out-of-network usage figures; FM26H's "Unlimited" maximum removes the cap and the input requirement.

## 6. Remaining gaps (honest list)

1. PDFs not stored / hashes pending for all real documents (egress policy). `tools/seed_presets.py` is the place to download, hash and verify quotes on PDF pages when run from an environment with access.
2. NCFlex certificate clauses beyond p.51 (alternate benefit, waiting period, missing tooth, frequency details) — UNKNOWN.
3. FEDVIP brochures beyond ~p.30: premiums (and NC's rating region), exclusions, implant/occlusal-guard/endodontic rows — UNKNOWN.
4. DD24 is a 2024 document (latest public); its premiums come from a 2020 sheet — shown as AMBIGUOUS with dates.
5. No NC individual-market policy document could be opened (Delta NC brochure recorded as evidence only; BCBSNC not public).
6. Benchmarks exist for 22 codes only; crowns, cast crowns, cast partial dentures, implants and occlusal guards have no published NC Medicaid rate.
7. Per-tooth / per-quadrant frequency clocks are shown as rules but not enforced in the arithmetic (tooth/quadrant history is not collected).
8. CDT: code numbers and descriptors appear only as printed in cited public documents; no CDT catalog is shipped (ADA commercial license required for one).
