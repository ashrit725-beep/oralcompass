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
| Uploaded plan PDF (text layer) | Page text with every identifier the visitor confirmed on the device removed, then the server's own patterns and the visitor's own terms (see "Redaction before AI analysis") <!-- verify: feat/client-redaction --> | `api/app/extraction.py`, `api/app/uploads.py`, `api/app/redaction.py` |
| Treatment plan, pasted text or a PDF with a text layer | Text redacted on the device first, then again on the server; every string the model returns is redacted again <!-- verify: feat/client-redaction --> | `api/app/treatment_reader.py` |
| Treatment plan, photo (PNG, JPEG, WebP) | The image itself, unredacted, only after the visitor confirms the notice (below) | `api/app/treatment_reader.py` |
| Treatment plan, PDF with no text layer | Up to 3 rendered page images, unredacted, only after the same confirmation | `api/app/treatment_reader.py` |
| Assistant (Ask in plain words, Ask about this step) and clause explainer | Facts from the stored ledger and plan clauses with names and identifiers redacted, and the visitor's question redacted; amounts appear only as placeholders | `api/app/assistant.py`, `api/app/explain.py` |

## Redaction before AI analysis

<!-- verify: feat/client-redaction (this whole section: web/src/lib/redact.ts, the upload step's review screen, api/app/redaction.py
redact_detailed and the client_redaction intake in api/app/uploads.py) -->

When a person picks a plan document or a benefits statement, personal details are found and reviewed on their own device before anything
is uploaded, removed again on the server before any model call, and counted. The screen says, with the real count, "12 personal
identifiers removed before AI analysis". This is a privacy measure, not a certification: see "Limits and known gaps" below.

### Categories detected

The device detector (`web/src/lib/redact.ts`, deterministic, `REDACTION_VERSION = 1`) and the server patterns (`api/app/redaction.py`)
cover the same ten categories:

| Category | What is matched | Shown in the text as |
| --- | --- | --- |
| `name` | 2 to 5 capitalised words after a label (Patient, Member, Subscriber, Insured, Employee, Dependent, Policyholder, Primary, Name, Dear, Attn), and every later occurrence of the same name anywhere in the document | `[name removed]` |
| `address` | A street line (number, words, a street suffix such as St, Ave, Rd, Blvd, Dr, Ln, Ct, Way, Pl, Pkwy, Ter, Cir, with an optional Apt, Suite or Unit) and a "City, ST 12345" line | `[address removed]` |
| `member_id` | A value after a Member, Subscriber, ID, Identification or Policy ID label that contains a digit (5 to 20 letters, digits, hyphens) | `[member ID removed]` |
| `group_number` | A value after Group or Grp (No., Number, #) that contains a digit | `[group number removed]` |
| `claim_number`, `account_number` | A value after a Claim or Account / Acct label (#, No.) | `[claim number removed]`, `[account number removed]` |
| `ssn` | NNN-NN-NNNN, or 9 digits after an SSN / Social Security label | `[SSN removed]` |
| `dob` | A date in a common format after DOB, Date of birth or Birth date | `[date of birth removed]` |
| `phone` | Personal phone and fax numbers; toll-free numbers (800, 833, 844, 855, 866, 877, 888) are the carrier's and are never removed | `[phone removed]` |
| `email` | Email addresses | `[email removed]` |

Never removed, because the AI needs them: procedure codes (D0120, D2740, ...), dollar amounts, percentages, plan-year and effective dates
without a birth label, deductible and maximum figures, frequency limits ("1 per 6 months"), waiting periods, tooth numbers, plan and
carrier names, and plan prose such as "member services" or "group dental plan" (identifier patterns require a value that contains a digit).

The count is of **distinct** identifiers, de-duplicated by a normalised value (case-insensitive, spacing collapsed, and for IDs and phone
numbers punctuation-insensitive); occurrences are counted separately ("removed in 4 places"). Every pattern on both sides is linear-time
(bounded repetitions, no nested open-ended runs), because it runs on visitor-supplied text.

### What stays on the device, what is uploaded and stored privately

| Stays on the device | Uploaded, stored privately in the owner's data directory |
| --- | --- |
| The pdf.js text the browser read, the detector's run, the redacted-text preview, and any value revealed with **Show** (values are masked by default). | The PDF itself, unredacted (mode 0600 under `ORALCOMPASS_DATA_DIR`): the server reads its text for extraction, verifies quotes against its pages, and shows its pages to the owner. |
| Identifiers the person switched to **Keep in text** are not sent in the list. | The `client_redaction` list: `{"version":1,"identifiers":[{"category","value"}],"extra_terms":[...]}` with the confirmed values, stored with the document, never logged and never returned in full. |

The upload contract (`POST /me/documents/upload`, optional multipart field `client_redaction`): at most 300 identifiers, 20 extra terms
of at most 64 characters, values of 2 to 120 characters, 64 KB in all; anything invalid is refused with
`422 {"error": "invalid_client_redaction"}`, a constant body that never echoes the input, and nothing is stored. Responses (the upload's
redaction preview, `GET` extraction and the document record) carry categories, counts and masked values only. Uploads made without the
field (older clients, scripts) still get the server patterns and the visitor's own terms; `PUT /me/documents/{id}/redaction` keeps
working. "Delete all my data" removes the PDF, the list and every record.

### What the AI receives

Before any model call the server builds the model input only from the PyMuPDF text of the stored PDF after two layers of removal:

1. **Confirmed values.** Every occurrence of every value confirmed on the device (and every extra term) is removed, whatever its case,
   spacing, punctuation or line breaks, so differences between the pdf.js text on the device and the PyMuPDF text on the server do not
   matter. Matching is anchored to word boundaries ("Sam" never matches inside "Sample").
2. **The server's safety net.** Its own label-anchored patterns for the same ten categories run over the result. The union of both layers
   is what the model never sees.

The authoritative count comes from the server: `summary = {total, by_category, occurrences, from_device, from_server_check, masked}`,
where `total` is the distinct identifiers removed from what the model receives. After upload the progress line, the review table and the
Documents card show that number, and say so when the server's own check found more than the device. Quote verification stays against
the PDF's text layer; clause quotes contain no identifiers.

The treatment-plan reader runs the same on-device step on pasted text and on PDFs with a text layer, then the server removes the values
and runs its patterns before any call.

### Limits and known gaps

- **Names without a label.** Names are found after a label, and then everywhere the same name appears. A name that appears only in running
  prose, with no label anywhere in the document, is not detected; the person can add it in the "Add a word or number to remove" field.
- **Scanned pages and photos.** A page with no text layer gives the device nothing to read (the review step says so). For plan uploads, a
  page with fewer than 20 characters of text counts as scanned and contributes no text; a document that is mostly scanned ends in a
  failed extraction with no model call. A treatment-plan photo or scanned PDF is sent to the model as is, only after the consent notice
  below. There is no OCR-based redaction.
- **Pattern limits.** Formats the patterns do not know (non-US addresses, international phone numbers, IDs without a label or without a
  digit) can be missed; a false positive can be kept with the switch. The preview shows the result before anything is uploaded.
- **"Keep in text" is a device-side choice.** The server's safety net does not receive the kept list, so a kept value that also matches a
  server pattern is still removed from the model input, and the server's count includes it (the screen notes when the server found more).
- **The original is stored.** The uploaded PDF is kept unredacted in the owner's private space, because quotes are verified against it.
  It is never sent to a model as a file.
- Model answers on the treatment-plan reader are redacted again before they are returned.

## Ask in plain words: the assistant's guards

<!-- verify: feat/ask-plain (this whole section: api/app/assistant.py, api/app/assistant_glossary.py, web/src/components/assistant/*) -->

The prompt box on every tab ("Ask in plain words") and the scoped "Ask about this step" use the same pipeline (`POST /me/assistant`).

- **Scope lock.** The scope is the current plan, the journey's estimate and the journey; every id goes through the owner check
  (`repo.get_owned`), so another visitor's records are a constant 404.
- **Deterministic first.** Questions are classified without a model (keywords, the glossary in `api/app/assistant_glossary.py` with its
  plural, possessive and spelling variants, and procedure names on the journey). Demo mode composes every answer from templates.
- **Information only.** "Should I" questions get a fixed plain-language template ("OralCompass explains what your documents say; it does
  not choose for you.") followed by what the document says; clinical questions get "This is a question for your dentist; OralCompass only
  explains your plan and your costs." Templates and the glossary pass `tools/advice_lint.py`, and every sentence passes the runtime advice
  guard.
- **No arithmetic, no bare amounts.** Every figure is a `{{ref:n}}` placeholder resolved from the engine's stored ledger with its
  evidence badge; a sentence with a bare amount or percentage is dropped (`MONEY_IN_TEXT`). Glossary definitions contain no numbers.
- **What a live model receives.** The facts the read-only tools gathered (names and identifiers redacted) and the visitor's question,
  redacted. In live mode the model only rewrites the simple sentence within the same refs.
- **Plain-language readability fallback.** A deterministic Flesch-Kincaid grade check (Python, no new dependency) runs on the simple
  block; above grade 9 the answer falls back to the template. "Say it more simply" uses a stricter one-sentence prompt in live mode and a
  second template variant in demo mode.
- **Cost guard.** Assistant calls count against the per-visitor limit (30 per 10 minutes) and the global daily caps; a refusal falls back
  to the template and the answer says so. The test suite never reaches a live model (fake client).

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
- Redaction is pattern-based, on the device and on the server, plus the visitor's own terms, matched without regard to case or spacing.
  It can miss a name written only in running prose with no label; the review step shows the result before anything is uploaded (see
  "Limits and known gaps" above). <!-- verify: feat/client-redaction -->
