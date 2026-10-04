# OralCompass security notes

What reaches a language model, and what does not. "Implemented" items are enforced in code and covered by tests; "Not implemented" items
are stated so nobody assumes them.

## Data sent to a model

A model is called only in live mode (`ORALCOMPASS_LLM_PROVIDER=openrouter` with a key, and the cost guard allows the call). In demo mode
nothing leaves the server: answers come from templates and stored fictional fixtures.

| Input | What the model receives | Where |
| --- | --- | --- |
| Pasted treatment-plan text | Text after `redaction.redact` (member ids, SSN, dates of birth, phone, email, name lines, street addresses) | `api/app/treatment_reader.py` |
| Treatment-plan PDF with a text layer | Its text after the same redaction | `api/app/treatment_reader.py` |
| Treatment-plan photo (PNG, JPEG, WebP) | The image itself, unredacted, only after the person confirms a notice (below) | `api/app/treatment_reader.py` |
| Treatment-plan PDF with no text layer | Up to 3 rendered page images, unredacted, only after the same confirmation | `api/app/treatment_reader.py` |
| Uploaded plan document | Redacted text plus the user's extra redaction terms, previewed before extraction | `api/app/uploads.py` |
| Assistant question | The question and the scoped records the answer is built from | `api/app/assistant.py` |

## Implemented

- **Image confirmation.** In live mode `POST /me/treatment-plans/read` answers `409 image_confirmation_required` for a photo or a scanned
  PDF unless the multipart field `confirm_image_sent_unredacted=true` is present. The 409 carries the notice text: "This image is sent to the
  model as is; names, member IDs and dates on it are not removed. Pasting the text instead lets OralCompass remove them first." The web
  reader shows that notice with two choices, "Paste the text instead" (focuses the paste box) and "Send the image as is". No model call
  happens before the confirmation (`tests/test_treatment_reader.py::test_live_image_needs_an_explicit_confirmation_before_any_model_call`).
- **Image metadata removal.** Every PNG or JPEG is decoded and re-encoded as a PNG with PyMuPDF before anything else reads it, so EXIF (GPS
  position, camera, time) is dropped. A WebP keeps its pixels and loses its `EXIF` and `XMP ` chunks. An image that cannot be decoded is
  refused with 415 instead of being forwarded (`test_image_metadata_is_stripped_before_anything_is_sent`).
- **Model answers are redacted again** before they are returned, so a name the model read from a photo is not echoed back.
- **No storage of reader inputs.** The treatment-plan reader keeps no copy of the text, the file or the image; only the lines the person
  confirms become treatment items. Uploaded plan documents are stored in the owner's data directory only.
- Owner-scoped routes, per-visitor rate limits, request body limits, security headers and id-only request logs: see `api/app/security.py`.

## Not implemented

- **No OCR-based redaction.** Text inside an image is never read or redacted before the model sees it. That is why images need the
  confirmation above and why the paste path is offered first.
- Redaction is pattern-based. A name written without a "Patient:"/"Name:" label, or an unusual id format, can pass through; the redaction
  preview on uploads exists so the person can add terms.
- No image cropping: the whole image is sent once confirmed.
