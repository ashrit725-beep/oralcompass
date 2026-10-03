---
description: Flattened cross-reference export (CSV + JSON) of plan × procedure × stage rules for review and controlled retrieval (master prompt §6)
---
`tools/export_crossref.py` → `exports/crossref.csv|json` with columns plan_id, plan_version, procedure_id, stage_id, CDT_code (as printed, or blank), unit, network_status,
coverage_status, insurer_share, deductible_applies, annual_limit, lifetime_limit, conditions, cost_low, cost_central, cost_high, price_basis, source_document, source_page,
source_confidence. Category-level mappings carry `mapping_basis=category`. Add `GET /exports/crossref` (public catalogs only; no personal data). Test the row count equals plans × mapped procedures.
