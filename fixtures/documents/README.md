# fixtures/documents — fictional PDFs only

Every PDF here is a **fictional demonstration document**. None describes a real plan, carrier or person, and none is an offer of insurance.
Real plan documents are referenced by URL and SHA-256 only (`docs/ORALCOMPASS_DATA_SOURCES.md`).

| File | What it is | Built by | Demo extraction |
|---|---|---|---|
| `harborview_certificate.pdf` | HB26 Harborview Dental PPO 2026 certificate (14 pages) | `tools/build_fictional_plans.py` (also `tools/build_harborview_pdf.py`) | `fixtures/plans/hb26.json` |
| `sm26_certificate.pdf` | SM26 Saltmarsh Dental Basic 2026 certificate (14 pages) | `tools/build_fictional_plans.py` | `fixtures/plans/sm26.json` |
| `nw26_certificate.pdf` | NW26 Northwind Dental Plus 2026 certificate (14 pages) | `tools/build_fictional_plans.py` | `fixtures/plans/nw26.json` |
| `tw26_certificate.pdf` | TW26 Tidewater Dental Select 2026 certificate (14 pages) | `tools/build_fictional_plans.py` | `fixtures/plans/tw26.json` |
| `tw26_fictional_sample_statement.pdf` | **Fictional sample member benefits statement** for TW26 (4 pages): exactly 12 invented personal identifiers next to the plan's numbers, used by "Try a fictional sample statement" in the upload step | `tools/make_sample_statement.py` | `fixtures/extractions/tw26_fictional_sample_statement.json` |

Rules:
- Never edit a PDF by hand: rerun its builder, which also rewrites the fixture's `sha256` (and, for the sample statement, the web text
  fixture `web/src/lib/__fixtures__/sample-statement-text.ts`). `python3 tools/make_sample_statement.py --check` verifies the sample is current.
- In demo mode (`ORALCOMPASS_LLM_PROVIDER=none`, or no key) an upload whose SHA-256 matches a fixture runs the full extraction with no
  model call; quotes are still verified against the uploaded file's text layer.
- The web app serves these files at `/fixtures/documents/<name>.pdf` (`api/app/server.py` in production; in development the web npm hooks copy them
  into `web/public/fixtures/documents/` via `web/scripts/copy-fixtures.mjs`, see `docs/WEB_FOUNDATION_NOTES.md`).
- The certificates carry one deliberately injected sentence on p.11 (a security test: it must be ignored, never used as a rule). The
  sample statement carries none.
