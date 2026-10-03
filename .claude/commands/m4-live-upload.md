---
description: M4 — live upload → redaction preview → cited extraction → confirm step → compare against presets (only if M0 passed)
---
Build milestone M4 (spec §2 Steps 1–5, §5.2) only if `docs/M0_RESULT.md` says extraction ≥ 90%. Otherwise implement the F1-lite manual-entry form.

1. Upload flow (web): PDF ≤ 100 pages / 32 MB → client computes SHA-256 and extracts a text layer with pdf.js for the redaction preview → `POST /documents`
   → presigned PUT (M3) → `POST /documents/{id}/extract` (new endpoint) → poll status → Page renders immediately while rules arrive.
2. `POST /documents/{id}/extract`: owner check → load bytes → server-side text layer (PyMuPDF) → redaction → `BedrockExtractor.extract` (two calls) →
   PlanModel JSON with page + quote per field → cache by `(sub, sha256)` → store on the document. Any field the model cannot quote is UNKNOWN.
3. Confirm step (web): checklist of extracted fields with sentence + page; ✓ Looks right / ✎ Edit / "Not found in document"; edits get the USER badge.
   Positional highlights come from the quotes exactly as in presets.
4. Comparison with an upload: `plan_refs` accepts `upload:<document_id>`; stitches for the upload use the document's own version label (e.g. `UP1`).
5. Failure modes: unreadable scan → OCR attempt → manual entry; Bedrock error → "Rules could not be read automatically; enter them by hand" (never a guess).
Acceptance: upload the Delta MSU EOC (public) → confirm step shows the eight gold fields with correct pages; the Ledger for Sam's estimate resolves to
"unresolved" until usage/network/allowed/enrollment are entered — exactly like the DD24 preset.
