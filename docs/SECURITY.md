# OralCompass security and privacy notes

What reaches a language model, and what does not. "Implemented" items are enforced in code and covered by tests; "Not implemented" items
are stated so nobody assumes them. The deployment posture (headers, body limits, logs, sessions, the live-AI cost guard, and what is not
production-grade) is in `docs/DEPLOY.md` ("Security posture").

## What reaches a model

A model is called only in live mode (`ORALCOMPASS_LLM_PROVIDER=openrouter` with a key, and the cost guard allows the call). In demo mode
nothing leaves the server: answers come from templates and stored fictional fixtures. The API test suite forces demo mode for every test
(`api/tests/conftest.py`); a test that needs a live call opts in with `@pytest.mark.live_llm` and is skipped by default.

| Input | What the model receives | Where |
| --- | --- | --- |
| Uploaded plan PDF (text layer) | Redacted page text only (`redaction.redact` plus the visitor's own terms), previewed before extraction | `api/app/extraction.py`, `api/app/uploads.py` |
| Treatment plan, pasted text or a PDF with a text layer | Redacted text only; every string the model returns is redacted again | `api/app/treatment_reader.py` |
| Treatment plan, photo (PNG, JPEG, WebP) | The image itself, unredacted, only after the visitor confirms the notice (below) | `api/app/treatment_reader.py` |
| Treatment plan, PDF with no text layer | Up to 3 rendered page images, unredacted, only after the same confirmation | `api/app/treatment_reader.py` |
| Assistant and clause explainer | Facts from the stored ledger and plan clauses; amounts appear only as placeholders | `api/app/assistant.py`, `api/app/explain.py` |

## Photos and scanned PDFs (implemented)

- **Confirmation before sending.** An image has no text to redact. In live mode the reader does not send it until the visitor has read the
  notice (`READER_IMAGE_NOTICE` in `api/app/templates.py`: "This image is sent to the model as is; names, member IDs and dates on it are not
  removed. Pasting the text instead lets OralCompass remove them first. ...") and confirmed. The first request returns 200 with
  `needs_image_consent: true`, the notice and no model call; only a request carrying the multipart field `image_consent=1` (alias
  `confirm_image_sent_unredacted=true`) is sent (`tests/test_treatment_reader.py::test_live_image_needs_an_explicit_confirmation_before_any_model_call`).
- **Two gates in the web reader.** In live mode a picked photo or PDF is staged, not posted: the reader shows the notice with a required
  acknowledgement checkbox, "Paste the text instead" (focuses the paste box) and the send button. If the server still holds a file for
  consent, the reader shows the notice again with "Send the image as is".
- **Metadata removal.** Before an image leaves the server it is re-encoded (`sanitize_image`, alias `strip_image_metadata`): PNG and JPEG
  are decoded and written out as a new PNG of at most about 4 megapixels (EXIF, GPS, camera and every other metadata block are dropped);
  WebP keeps its image chunks and loses its EXIF, XMP and ICC chunks. A photo larger than 40 megapixels (read from its header) is refused
  before decoding, and an image that cannot be decoded is refused with 415 instead of being forwarded. Scanned PDF pages are rendered at a
  bounded size whatever their declared page box (`test_image_metadata_is_stripped_before_anything_is_sent`).
- **Demo mode never sends anything:** an image or scan gets the honest "demo mode cannot read new documents" result.
- **Model answers are redacted again** before they are returned, so a name the model read from a photo is not echoed back.
- **No storage of reader inputs.** The image and text live only in the request; only the lines the visitor confirms become records.
  Uploaded plan PDFs are kept in the owner's data directory (`ORALCOMPASS_DATA_DIR`, mode 0600) until "Delete all my data".
- Owner-scoped routes, per-visitor rate limits, request body limits, security headers and id-only request logs: see `api/app/security.py`.

## Not implemented (stated, not hidden)

- **No OCR-based redaction:** names, member IDs and dates printed inside an image reach the model when the visitor confirms the notice.
  That is why images need the confirmation above and why the paste path is offered first.
- **No image cropping:** the whole image is sent once confirmed.
- Redaction is pattern-based (`api/app/redaction.py`: member/policy ids that contain a digit, SSN, date of birth, phone, email,
  "Patient:/Name:" lines, street addresses) plus the visitor's own terms, matched without regard to case or spacing. It can miss a name
  written in running prose; the preview shows the result before anything is sent.
