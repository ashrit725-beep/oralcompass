# OralCompass source research protocol (agents read this first)

Purpose: establish **published plan rules, procedure-code mappings and published fees from authoritative documents**, with evidence
attached to every fact, so the application can show the supporting clause next to every explanation and estimate.

## Hard rules
1. **Open the underlying document.** Search snippets, FAQs, blog posts and third-party summaries are not evidence for a specific
   plan's benefits. Use `WebFetch` on the official URL (PDFs are converted to text; page footers/markers usually show page numbers).
   Use `WebSearch` only to locate official URLs.
2. **Sanctioned tools only.** Use `WebFetch`/`WebSearch`. Do **not** use curl/wget/python to fetch anything (the egress policy blocks
   them and bypassing is prohibited). If `WebFetch` fails for a URL/domain, record the failure in `access_limits` and move on.
3. **Quote exactly.** Every fact carries a verbatim passage (copy characters exactly, including `$`, `%`, punctuation). If you cannot
   quote it, the fact is `UNKNOWN` — never paraphrase into a value. Prefer short quotes (≤ 25 words) that are unique on the page.
4. **Page/section.** Record the page number as printed in the document (say which numbering: PDF footer vs section page), the
   section/table name, and the column header context (e.g., "High / Classic / Low" column order — quote the header row too).
5. **Units and conditions.** Money in integer cents; percentages must state the basis ("plan pays" vs "you pay", in- vs out-of-network,
   "of negotiated fee" vs "of R&C"); frequencies include the period ("2 per calendar year", "once every 60 months", "per tooth");
   amounts say per person/family/period; age limits and tooth/arch conditions are recorded verbatim.
6. **No fabrication.** Missing information is `null` with `"status": "UNKNOWN"` and a note on where you looked. Do not fill gaps
   with typical values, other plans' values, or memory.
7. **Conflicts are preserved.** If two documents (or two pages) disagree, record both with dates and document authority; do not pick.
8. **Procedure IDs are fixed.** Internal keys (from `fixtures/procedures.json`) are never renamed. External codes (e.g., CDT "D2740")
   are recorded as explicit mappings with the descriptor **as printed in the opened document**, a confidence level, and
   `review: true` whenever the internal key could map to more than one code (e.g., bitewings 2 vs 4 films; SRP 1–3 vs 4+ teeth;
   partial denture resin vs cast; night guard hard/soft).
9. **Reuse terms.** Record the document's copyright/terms (e.g., ADA CDT © notice, "U.S. government publication", state public record).
10. **Separate published from personal.** Published fee schedules and benchmarks are never a user's price or allowance; label payer,
    geography, date and purpose.

## Output (write both files; create directories if needed)
- `sources/extracted/<source_id>.json` — schema below.
- `sources/notes/<source_id>.md` — what you opened, what you could not open, judgment calls, open questions (≤ 1 page).

```json
{
  "source_id": "kebab-case-id",
  "title": "exact document title",
  "publisher": "organization that published the document",
  "url": "https://...",
  "secondary_urls": [],
  "document_type": "certificate | evidence_of_coverage | benefits_guide | plan_brochure | fee_schedule | rate_sheet | license_terms | web_page",
  "document_date": "YYYY-MM-DD or null — publication/version/certificate date as printed",
  "effective_period": {"start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null", "quote": "passage establishing it or null"},
  "scope": {"geography": "...", "population": "who the plan is for", "plan_type": "PPO/DHMO/indemnity/...", "network": "..."},
  "retrieved_at": "2026-10-03",
  "retrieval_method": "WebFetch (PDF→text; page numbers from footers)",
  "pages_total": null,
  "reuse_terms": "copyright / public record statement as printed, or 'not stated'",
  "access_limits": ["anything you could not open or verify, with the error"],
  "facts": [
    {
      "fact_id": "<source_id>:<field>:<option>",
      "plan_option": "Classic | High | Low | Standard | n/a",
      "field": "deductible_individual | deductible_family | annual_max | coinsurance | waiting_period | frequency | exclusion | alternate_benefit | missing_tooth | oon_basis | premium_monthly | effective_dates | eligibility | age_limit | class_membership | fee | other",
      "procedure_key": "internal key when the fact is procedure-specific, else null",
      "value": "number in cents / integer percent / string / null",
      "unit": "cents | percent_plan_pays | percent_you_pay | months | count | text",
      "basis": "per person per calendar year | per family | per tooth | of negotiated fee | ...",
      "network": "in | out | both | n/a",
      "quote": "verbatim passage",
      "page": "page number as printed",
      "page_numbering": "pdf_footer | section_page | unknown",
      "section": "table/heading name",
      "status": "DOC | UNKNOWN | AMBIGUOUS | CONFLICT",
      "confidence": "high | medium | low",
      "review_status": "quote_verified_in_text | needs_review",
      "notes": ""
    }
  ],
  "procedure_mappings": [
    {"internal_key": "crown", "external_system": "CDT", "external_code": "D2740", "descriptor_as_printed": "...", "quote": "...", "page": "...", "confidence": "high|medium|low", "review": false, "notes": ""}
  ],
  "conflicts": [{"field": "...", "a": {"value": "...", "quote": "...", "doc": "...", "date": "..."}, "b": {...}, "note": "..."}],
  "gaps": ["fields looked for and not found, with where you looked"]
}
```

Internal procedure keys (do not rename): exam, cleaning, bitewing_xrays, fluoride_child, sealant, composite (two-surface posterior resin),
amalgam (two surfaces), extraction_simple, extraction_surgical, scaling_root_planing (per quadrant), root_canal_molar, crown
(porcelain/ceramic), cast_crown (full cast metal), denture_partial, implant (body), night_guard (occlusal guard).

Time box: about 40 minutes. Breadth with exact quotes beats depth without them. Finish by writing both files even if partial.
