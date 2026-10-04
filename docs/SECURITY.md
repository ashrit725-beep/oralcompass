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

## Server protections (implemented; checked against the code)

- **Sessions** (`api/app/sessions.py`): one signed `oc_session` cookie per visitor (HMAC with `ORALCOMPASS_SESSION_SECRET`); the owner key is
  a hash of the session id. A tampered cookie starts a new, empty session. `X-Dev-User` is honoured only under `ORALCOMPASS_DEV_AUTH=1`
  (local and tests), and only as a short slug (`[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`, no `..`), because it names the owner's data directory;
  anything else is 401 (`api/tests/test_api_edges.py`).
- **Owner-scoped records** (`api/app/store.py`): every read goes through the owner key; a record that is missing or owned by someone else is
  the same `404 {"detail": {"error": "not_found"}}`, and the denial is written to that visitor's audit log (`tests/test_isolation.py`).
- **Headers and body limits** (`api/app/security.py`): CSP (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`; the few relaxations are listed in the module docstring), nosniff, Referrer-Policy, Permissions-Policy,
  X-Frame-Options DENY, HSTS over https, X-Request-ID. Bodies: 35 MB on upload routes, 1 MB elsewhere. Request logs carry ids, never text.
- **Validation errors** (`api/app/main.py`): a 422 names the field and rule only (`type`, `loc`, `msg`); the submitted value is never echoed,
  so pasted plan or treatment text cannot come back in an error body.
- **Upload limits** (`api/app/uploads.py`): PDF only, 32 MB, 100 pages, SHA-256 checked, 10 files and 160 MB per visitor, 507 when the volume
  cap is reached. Treatment-plan reader (`api/app/treatment_reader.py`): 10 MB, 20 PDF pages, 20,000 characters of text, 40 items.
- **Live-AI cost guard** (`api/app/llm_guard.py`): per visitor, extraction 5/day, reader 10/day, explainer 60/day, assistant 30 per 10
  minutes; globally 300 requests and an estimated USD 2.00 per UTC day (`ORALCOMPASS_LLM_*` overrides). A refused call falls back to the
  demo/template path; it never fails the request.

## Not implemented (stated, not hidden)

- **No OCR-based redaction:** names, member IDs and dates printed inside an image reach the model when the visitor confirms the notice.
  That is why images need the confirmation above and why the paste path is offered first.
- **No image cropping:** the whole image is sent once confirmed.
- Redaction is pattern-based (`api/app/redaction.py`: member/subscriber/policy ids that contain a digit, SSN, date of birth, phone, email,
  "Patient:/Name:/Insured:/Employee:" lines, street addresses) plus the visitor's own terms, matched without regard to case or spacing. It can miss a name
  written in running prose; the preview shows the result before anything is sent.
