# OralCompass security and privacy notes

The deployment posture (headers, body limits, logs, sessions, the live-AI cost guard, and what is not production-grade) is in
`docs/DEPLOY.md` ("Security posture"). This file records the parts that concern personal documents sent to a model.

## What reaches a model

| Input | What the model receives | How |
| --- | --- | --- |
| Uploaded plan PDF (text layer) | Redacted page text only | `api/app/extraction.py` runs `redaction.redact` (plus the visitor's own terms) on every page before the call. |
| Treatment plan, pasted text or a PDF with a text layer | Redacted text only | `api/app/treatment_reader.py`, then every string the model returns is redacted again. |
| Treatment plan, photo or scanned PDF (no text layer) | The image itself, after the visitor confirms | See below. |
| Assistant and clause explainer | Facts from the stored ledger and plan clauses | Amounts appear only as placeholders; logs carry ids and outcomes. |

## Photos and scanned PDFs (implemented)

- An image has no text to redact. In live mode the reader does **not** send it until the visitor has read the notice
  (`READER_IMAGE_NOTICE` in `api/app/templates.py`) and confirmed: the first request returns `needs_image_consent: true` with the notice and
  no model call; only a request carrying the multipart field `image_consent=1` is sent. The notice offers pasting the text instead, which
  lets OralCompass remove names, member IDs and dates first.
- Before an image leaves the server it is re-encoded: PNG and JPEG are decoded and written out as a new PNG of at most about 4 megapixels
  (EXIF, GPS, camera and every other metadata block are dropped); WebP keeps its image chunks and loses its EXIF, XMP and ICC chunks.
  A photo larger than 40 megapixels (read from its header) is refused before decoding. Scanned PDF pages are rendered at a bounded size
  whatever their declared page box.
- Demo mode never sends anything: an image or scan gets the honest "demo mode cannot read new documents" result.
- Treatment-plan reads are not stored: the image and text live only in the request; only the lines the visitor confirms become records.
  Uploaded plan PDFs are kept in the owner's data directory (`ORALCOMPASS_DATA_DIR`, mode 0600) until "Delete all my data".

## Not implemented (stated, not hidden)

- No OCR-based redaction: names, member IDs and dates printed inside an image reach the model when the visitor confirms the notice.
- Redaction is pattern-based (`api/app/redaction.py`: member/policy ids that contain a digit, SSN, date of birth, phone, email,
  "Patient:/Name:" lines, street addresses) plus the visitor's own terms, matched without regard to case or spacing. It can miss a name
  written in running prose; the preview shows the result before anything is sent.
