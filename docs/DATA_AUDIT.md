# OralCompass data audit

Generated 2026-10-03 by `tools/audit_data.py` (re-run after any fixture change).

## Inventory

- procedures: 16
- plans: 13
- real_plans: DD24, DD24L, FD26H, FD26S, FM26H, FM26S, ML26, ML26H, ML26L
- fictional_plans: HB26, NW26, SM26, TW26
- users: 3
- journeys: 4
- documents_stored: 4
- procedure_codes_mapped: 16
- benchmark_rows: 33

## Findings by severity

- info: 106
- medium: 20

## Findings

| severity | area | record | issue | detail |
|---|---|---|---|---|
| medium | plans | DD24 | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | DD24 | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | DD24 | document plan year 2024 is older than 2026 — possibly outdated | Possibly outdated for 2026: the latest public EOC is effective 2024-01-01; premiums come from a 2020-revision highlights sheet. |
| medium | plans | DD24L | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | DD24L | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | DD24L | document plan year 2024 is older than 2026 — possibly outdated | Possibly outdated for 2026: the latest public EOC is effective 2024-01-01; premiums come from a 2020-revision highlights sheet. |
| medium | plans | FD26H | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | FD26H | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | FD26S | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | FD26S | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | FM26H | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | FM26H | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | FM26S | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | FM26S | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | ML26 | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | ML26 | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | ML26H | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | ML26H | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| medium | plans | ML26L | source document SHA-256 not recorded | The egress policy of the build environment blocks binary downloads from this host; the document was read through the sanctioned text-extraction fetch. Record the SHA-256 and re-verify each quote on its PDF page when the PDF is downloaded (tools/seed_presets.py). |
| medium | plans | ML26L | source PDF not stored locally — Page view falls back to quote + page reference + link | binary download blocked in the build environment |
| info | fee_benchmarks | NC Medicaid | codes absent from the published schedule (no benchmark) | D2740, D2750, D2790, D2791, D2792, D5213, D5214, D6010, D9944, D9945, D9946 |
| info | fee_benchmarks | cast_crown | no published benchmark row maps to this procedure |  |
| info | fee_benchmarks | crown | no published benchmark row maps to this procedure |  |
| info | fee_benchmarks | implant | no published benchmark row maps to this procedure |  |
| info | fee_benchmarks | night_guard | no published benchmark row maps to this procedure |  |
| info | plans | DD24 | class_of.bitewing_xrays is AMBIGUOUS | The 'Diagnostic' category description does not name x-rays; the only x-ray text is Limitation 3 (x-ray limitations). Diagnostic is the only plausible home — com |
| info | plans | DD24 | waiting_months is AMBIGUOUS | The 12-month wait names 'Restorative, Endodontics, Periodontics, and Prosthodontics' — procedure groups, not classes. Applied to fillings (Restorative), root ca |
| info | plans | DD24 | dos_rule is UNKNOWN | The EOC's 'incurred' rule (crown 'at the time the tooth or teeth are prepared') sits under Continuation of Benefits and governs termination liability; the claim |
| info | plans | DD24 | missing_tooth clause UNKNOWN | No missing-tooth clause found in Attachment B Limitations 1–35 or Exclusions 1–34 (fetcher reported none); not asserted  |
| info | plans | DD24 | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | No fee schedule or dollar allowances anywhere in the EOC ('Maximum Contract Allowance' is defined but not listed). Payment is 'the lesser of the Dentist's Submi |
| info | plans | DD24 | premium employee_only is AMBIGUOUS | Printed on the Benefit Highlights sheet revised 8/26/2020 (file dated 2021). No plan year is printed on the sheet; the rate may not apply to 2024–2026. Shown wi |
| info | plans | DD24 | premium employee_plus_dependents is AMBIGUOUS | same sheet; 'Enrollee + 1 or more dependents' tier |
| info | plans | DD24 | 4 documented conflict(s) preserved | waiting_period (Basic Services); deductible waiver (Low Plan); existing preset DD24 citations vs document (not a document-vs-document conflict; recorded for the seeding fix list); waiting_period (Basi |
| info | plans | DD24L | class_of.bitewing_xrays is AMBIGUOUS | The 'Diagnostic' category description does not name x-rays; the only x-ray text is Limitation 3 (x-ray limitations). Diagnostic is the only plausible home — com |
| info | plans | DD24L | waiting_months is AMBIGUOUS | The 12-month wait names 'Restorative, Endodontics, Periodontics, and Prosthodontics' — procedure groups, not classes. Applied to fillings (Restorative), root ca |
| info | plans | DD24L | dos_rule is UNKNOWN | The EOC's 'incurred' rule (crown 'at the time the tooth or teeth are prepared') sits under Continuation of Benefits and governs termination liability; the claim |
| info | plans | DD24L | missing_tooth clause UNKNOWN | No missing-tooth clause found in Attachment B Limitations 1–35 or Exclusions 1–34 (fetcher reported none); not asserted  |
| info | plans | DD24L | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | No fee schedule or dollar allowances anywhere in the EOC ('Maximum Contract Allowance' is defined but not listed). Payment is 'the lesser of the Dentist's Submi |
| info | plans | DD24L | premium employee_only is AMBIGUOUS | Printed on the Benefit Highlights sheet revised 8/26/2020 (file dated 2021). No plan year is printed on the sheet; the rate may not apply to 2024–2026. Shown wi |
| info | plans | DD24L | premium employee_plus_dependents is AMBIGUOUS | same sheet; 'Enrollee + 1 or more dependents' tier |
| info | plans | DD24L | 4 documented conflict(s) preserved | waiting_period (Basic Services); deductible waiver (Low Plan); existing preset DD24 citations vs document (not a document-vs-document conflict; recorded for the seeding fix list); waiting_period (Basi |
| info | plans | FD26H | class_of.implant is UNKNOWN | The Implant Services subsection lies after the readable pages (~p.30). Section 4 states a $2,500 per-person per-calendar-year implant limit under the High Optio |
| info | plans | FD26H | class_of.night_guard is UNKNOWN | Occlusal guard appliance codes (D9944–D9946) do not appear in readable pages 1–29; only 'D9936 Cleaning and inspection of occlusal guard' (2026 change) was foun |
| info | plans | FD26H | waiting_months is UNKNOWN | No 'waiting period' text in readable pages 1–29; Summary of Benefits and Sections 7/9 not readable — UNKNOWN, not 'none'. |
| info | plans | FD26H | dos_rule is UNKNOWN | Not stated in the readable pages; computed with the completion date and labeled as an assumption. |
| info | plans | FD26H | missing_tooth clause UNKNOWN | Section 7 General Exclusions not readable. |
| info | plans | FD26H | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | The brochure prints no fee schedule. 'The plan allowance is the amount we allow for a specific procedure' (p.13); the amount must come from your pre-treatment e |
| info | plans | FD26H | premium self_only is UNKNOWN | Rate pages at the end of the brochure were not readable and North Carolina's rating region could not be determined from an official page (OPM's rating-region sp |
| info | plans | FD26S | class_of.implant is UNKNOWN | The Implant Services subsection lies after the readable pages (~p.30). Section 4 states a $2,500 per-person per-calendar-year implant limit under the High Optio |
| info | plans | FD26S | class_of.night_guard is UNKNOWN | Occlusal guard appliance codes (D9944–D9946) do not appear in readable pages 1–29; only 'D9936 Cleaning and inspection of occlusal guard' (2026 change) was foun |
| info | plans | FD26S | waiting_months is UNKNOWN | No 'waiting period' text in readable pages 1–29; Summary of Benefits and Sections 7/9 not readable — UNKNOWN, not 'none'. |
| info | plans | FD26S | dos_rule is UNKNOWN | Not stated in the readable pages; computed with the completion date and labeled as an assumption. |
| info | plans | FD26S | missing_tooth clause UNKNOWN | Section 7 General Exclusions not readable. |
| info | plans | FD26S | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | The brochure prints no fee schedule. 'The plan allowance is the amount we allow for a specific procedure' (p.13); the amount must come from your pre-treatment e |
| info | plans | FD26S | premium self_only is UNKNOWN | Rate pages at the end of the brochure were not readable and North Carolina's rating region could not be determined from an official page (OPM's rating-region sp |
| info | plans | FM26H | class_of.root_canal_molar is UNKNOWN | D3330 (molar root canal) was not present in the readable text (truncated near p.33); class and coinsurance unknown. |
| info | plans | FM26H | class_of.denture_partial is UNKNOWN | D5211–D5214 not present in the readable text; class unknown. |
| info | plans | FM26H | class_of.implant is UNKNOWN | D6010 (implant body) not present in the readable text; only implant maintenance codes appeared in the 2026 changes list. |
| info | plans | FM26H | class_of.night_guard is UNKNOWN | Occlusal guard appliance codes (D9944–D9946) not present in the readable text; only the 2026 frequency change (1 in 24 months) is known. |
| info | plans | FM26H | deductible_family is UNKNOWN | Family deductible not stated in the returned text (deductible printed per person). |
| info | plans | FM26H | waiting_months is UNKNOWN | No sentence containing 'waiting' was found in the readable text; because the text was truncated this is UNKNOWN, not 'no waiting period'. |
| info | plans | FM26H | dos_rule is UNKNOWN | Not stated in the readable pages; computed with the completion date and labeled as an assumption. |
| info | plans | FM26H | missing_tooth clause UNKNOWN | Section 7 General Exclusions (p.50) was not reliably extracted. |
| info | plans | FM26H | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | The brochure prints no fee schedule. 'Plan Allowance' is 'the maximum amount we will consider for payment for a specific procedure' (p.59); the amount must come |
| info | plans | FM26H | premium self_only is UNKNOWN | Rate Information (p.71) was not returned by the text extraction; rates depend on the rating area for your ZIP code (North Carolina's area not determined). |
| info | plans | FM26S | class_of.root_canal_molar is UNKNOWN | D3330 (molar root canal) was not present in the readable text (truncated near p.33); class and coinsurance unknown. |
| info | plans | FM26S | class_of.denture_partial is UNKNOWN | D5211–D5214 not present in the readable text; class unknown. |
| info | plans | FM26S | class_of.implant is UNKNOWN | D6010 (implant body) not present in the readable text; only implant maintenance codes appeared in the 2026 changes list. |
| info | plans | FM26S | class_of.night_guard is UNKNOWN | Occlusal guard appliance codes (D9944–D9946) not present in the readable text; only the 2026 frequency change (1 in 24 months) is known. |
| info | plans | FM26S | deductible_family is UNKNOWN | Family deductible not stated in the returned text (deductible printed per person). |
| info | plans | FM26S | waiting_months is UNKNOWN | No sentence containing 'waiting' was found in the readable text; because the text was truncated this is UNKNOWN, not 'no waiting period'. |
| info | plans | FM26S | dos_rule is UNKNOWN | Not stated in the readable pages; computed with the completion date and labeled as an assumption. |
| info | plans | FM26S | missing_tooth clause UNKNOWN | Section 7 General Exclusions (p.50) was not reliably extracted. |
| info | plans | FM26S | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | The brochure prints no fee schedule. 'Plan Allowance' is 'the maximum amount we will consider for payment for a specific procedure' (p.59); the amount must come |
| info | plans | FM26S | premium self_only is UNKNOWN | Rate Information (p.71) was not returned by the text extraction; rates depend on the rating area for your ZIP code (North Carolina's area not determined). |
| info | plans | ML26 | class_of.scaling_root_planing is AMBIGUOUS | printed under 'Type II' but at the 50% row, which equals the certificate's Type C percentage; computed at 50% |
| info | plans | ML26 | class_of.extraction_surgical is AMBIGUOUS | the guide names only 'Oral Surgery (wisdom teeth extractions)' in the 50% row; a surgical extraction of another tooth could fall under 'Simple Extractions' — no |
| info | plans | ML26 | waiting_months is UNKNOWN | Not mentioned on guide pages 24–26 or elsewhere in the 56-page guide; the certificate section that would contain a waiting period was not reachable. Absence not |
| info | plans | ML26 | alternate_benefit UNKNOWN | The certificate's Alternate Benefits clause (DENTAL INSURANCE section, p.59–62) was not reachable; the guide does not print one. Absence is not confirmed. |
| info | plans | ML26 | missing_tooth clause UNKNOWN | Not in the guide (its exclusion list is 'a partial listing'); certificate exclusions (p.66–67) not reachable. |
| info | plans | ML26 | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | No fee schedule or negotiated fee is printed in the guide or the certificates. In-network: 'The MAC for in-network dental providers is the negotiated in-network |
| info | plans | ML26 | 6 documented conflict(s) preserved | class label for periodontal services / oral surgery / general anesthesia; deductible applicability to implants; out-of-network R&C percentile; certificate version vs plan year; deductible applicabilit |
| info | plans | ML26H | class_of.scaling_root_planing is AMBIGUOUS | printed under 'Type II' but at the 50% row, which equals the certificate's Type C percentage; computed at 50% |
| info | plans | ML26H | class_of.extraction_surgical is AMBIGUOUS | the guide names only 'Oral Surgery (wisdom teeth extractions)' in the 50% row; a surgical extraction of another tooth could fall under 'Simple Extractions' — no |
| info | plans | ML26H | waiting_months is UNKNOWN | Not mentioned on guide pages 24–26 or elsewhere in the 56-page guide; the certificate section that would contain a waiting period was not reachable. Absence not |
| info | plans | ML26H | alternate_benefit UNKNOWN | The certificate's Alternate Benefits clause (DENTAL INSURANCE section, p.59–62) was not reachable; the guide does not print one. Absence is not confirmed. |
| info | plans | ML26H | missing_tooth clause UNKNOWN | Not in the guide (its exclusion list is 'a partial listing'); certificate exclusions (p.66–67) not reachable. |
| info | plans | ML26H | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | No fee schedule or negotiated fee is printed in the guide or the certificates. In-network: 'The MAC for in-network dental providers is the negotiated in-network |
| info | plans | ML26H | 4 documented conflict(s) preserved | class label for periodontal services / oral surgery / general anesthesia; deductible applicability to implants; out-of-network R&C percentile; document date label |
| info | plans | ML26L | class_of.scaling_root_planing is AMBIGUOUS | printed under 'Type II' but at the 50% row, which equals the certificate's Type C percentage; computed at 50% |
| info | plans | ML26L | class_of.extraction_surgical is AMBIGUOUS | the guide names only 'Oral Surgery (wisdom teeth extractions)' in the 50% row; a surgical extraction of another tooth could fall under 'Simple Extractions' — no |
| info | plans | ML26L | waiting_months is UNKNOWN | Not mentioned on guide pages 24–26 or elsewhere in the 56-page guide; the certificate section that would contain a waiting period was not reachable. Absence not |
| info | plans | ML26L | alternate_benefit UNKNOWN | The certificate's Alternate Benefits clause (DENTAL INSURANCE section, p.59–62) was not reachable; the guide does not print one. Absence is not confirmed. |
| info | plans | ML26L | missing_tooth clause UNKNOWN | Not in the guide (its exclusion list is 'a partial listing'); certificate exclusions (p.66–67) not reachable. |
| info | plans | ML26L | no allowed amounts (fee schedule) in the document — user must supply allowed amounts | No fee schedule or negotiated fee is printed in the guide or the certificates. In-network: 'The MAC for in-network dental providers is the negotiated in-network |
| info | plans | ML26L | 3 documented conflict(s) preserved | class label for periodontal services / oral surgery / general anesthesia; deductible applicability to implants; out-of-network R&C percentile |
| info | procedure_codes | bitewing_xrays | mapping requires review | codes seen: D0272, D0274 |
| info | procedure_codes | cast_crown | mapping requires review | codes seen: D2790, D2791, D2792 |
| info | procedure_codes | cleaning | mapping requires review | codes seen: D1110, D1120 |
| info | procedure_codes | denture_partial | mapping requires review | codes seen: D5211, D5212, D5213, D5214 |
| info | procedure_codes | exam | mapping requires review | codes seen: D0120 |
| info | procedure_codes | extraction_surgical | mapping requires review | codes seen: D7210 |
| info | procedure_codes | fluoride_child | mapping requires review | codes seen: D1206, D1208 |
| info | procedure_codes | night_guard | mapping requires review | codes seen: D9944, D9945, D9946 |
| info | procedure_codes | scaling_root_planing | mapping requires review | codes seen: D4341, D4342 |
| info | procedures | amalgam | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | bitewing_xrays | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | cast_crown | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | cleaning | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | composite | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | crown | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | denture_partial | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | exam | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | extraction_simple | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | extraction_surgical | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | extraction_surgical | category varies by plan — class must come from each plan document | basic/major (varies) |
| info | procedures | fluoride_child | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | implant | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | implant | category varies by plan — class must come from each plan document | major/excluded (varies) |
| info | procedures | night_guard | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | night_guard | category varies by plan — class must come from each plan document | major/excluded (varies) |
| info | procedures | root_canal_molar | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | root_canal_molar | category varies by plan — class must come from each plan document | basic/major (varies) |
| info | procedures | scaling_root_planing | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
| info | procedures | scaling_root_planing | category varies by plan — class must come from each plan document | basic/major (varies) |
| info | procedures | sealant | dentist fee is a fictional demo figure | Northside Dental Group (fictional) fee list, 2026 |
