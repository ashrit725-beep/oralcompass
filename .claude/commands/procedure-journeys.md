---
description: Research and add the ten oral-surgery journey templates plus checkup and braces (master prompt §5) as data-driven stages, with sources, units and cost bases
---
Provisional set (label it "Ten common oral procedure journeys" unless prevalence evidence is found; never fabricate prevalence): simple extraction, surgical extraction,
impacted wisdom tooth removal, implant placement + restoration pathway, bone grafting, sinus augmentation, apicoectomy, periodontal flap surgery, gum grafting, frenectomy;
extensions: routine checkup (one island), orthodontic braces (consultation, placement, grouped adjustments, removal, retention).
For each: aliases, variants that change billing items, applicable codes with units (tooth/quadrant/arch/visit) only as printed in opened authoritative documents
(ADA, AAOMS, AAP, AAE, NIDCR, FDA, university resources; FEDVIP brochures for code lines), typical stages (required/optional/conditional/repeated/bundled), visit-count
and elapsed-time ranges only where a source supports them, cost low/central/high with basis (published mean/median, quoted price, midpoint, demo assumption — never call a
midpoint an average), what is bundled, neutral recovery timing with no instructions, and source/date/geography/confidence/limitations.
Deliver: `fixtures/journey_templates/*.json` (stages, steps, step_billing_items, layout-free), new procedure keys appended to `fixtures/procedures.json` (existing ids untouched),
`docs/RESEARCH.md` with links and access dates, loader + `GET /journey-templates`, tests that island count follows the template, and the advice linter over every stage text.
Islands are stages, not billing codes; healing time is never charged; adjustments can be grouped visually while every charge stays modeled.
