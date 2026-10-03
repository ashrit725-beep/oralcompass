---
description: Protected local admin workflow — assign an uploaded plan PDF/CSV/JSON to a label (A/B/C), extract, review, publish an immutable reviewed version, recalculate
---
Build `api/app/admin_import.py` (dev-only gate `ORALCOMPASS_ADMIN=1` + owner): upload (size/type validated, stored under the owner's prefix, never public), extraction
(PyMuPDF text with page refs; `BedrockExtractor`/fixture extractor proposes rules with quotes; scanned PDFs without OCR are reported, not dropped), a review table
(proposed value, quote, page, confidence, conflicts between summary and certificate preserved; governing document recorded when the documents state a hierarchy), publish
(immutable version with sha256 + reviewed_at; unreviewed proposals never become DOC), recalculation of saved estimates against the new version. UI: Documents → "Review
imported plan" table with per-field confirm/reject. Tests: unreviewed extraction cannot reach a calculation; versions are immutable; owner isolation.
