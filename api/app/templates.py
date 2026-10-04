"""Server-side user-facing strings and templates. Linted by tools/advice_lint.py (information only)."""
FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination."
PRESET_BANNER = "Listed here means the document is public, not that you are eligible to enroll."
COMPARISON_BANNER = "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans."

ADVICE_INTRO = "OralCompass provides information, not a choice. Here is what the supplied documents and inputs show."
ADVICE_LINE_STATUS = {
    "estimate": "For {name}, the estimate is complete.",
    "unresolved": "For {name}, the estimate is waiting for information, so no amount is shown yet.",
    "not_covered": "For {name}, the plan document lists the service as not covered.",
    "other": "For {name}, the estimate lists its own status.",
}
ADVICE_STEPS_CITED_ONE = "Its {rule} step is tied to a sentence in the plan document ({where})."
ADVICE_STEPS_CITED_MANY = "Its {rules} steps are each tied to a sentence in the plan document ({where})."
ADVICE_STEPS_UNCITED = "None of its steps is tied to a sentence in the plan document."
ADVICE_RULE_ROW = "For {name}, the plan document places the service in {category}, and the rule row lists the clauses behind it."
ADVICE_RULE_ROW_UNSTATED = "For {name}, the pages read do not place the service in a coverage class."
ADVICE_AMOUNTS = "Each amount is on the estimate line beside its evidence label."
ADVICE_NOT_PROVIDED = "Still not provided: {items}."
ADVICE_DIFFERENCES = "Where the documents differ: {items}"
ADVICE_RULE_WORDS = {"D": "deductible", "CO": "coinsurance", "M": "annual maximum", "AB": "alternate benefit", "N": "network", "X": "exclusion",
                     "W": "waiting period", "F": "frequency limit"}


def join_words(items: list[str]) -> str:
    """'a', 'a and b', 'a, b and c'."""
    items = [i for i in items if i]
    return items[0] if len(items) == 1 else (", ".join(items[:-1]) + " and " + items[-1] if items else "")


def advice_question_response(facts_by_scenario: dict[str, str], differences: list[str], not_provided: list[str]) -> str:
    """Fixed neutral template for questions that ask the app to decide: plain sentences of fact, built from engine fields. The user decides.
    `facts_by_scenario` maps a line name to its already-written sentences (see assistant.advice_block)."""
    parts = [ADVICE_INTRO]
    parts.extend(facts_by_scenario.values())
    if differences:
        parts.append(ADVICE_DIFFERENCES.format(items=" ".join(differences)))
    if not_provided:
        parts.append(ADVICE_NOT_PROVIDED.format(items=join_words(not_provided)))
    return " ".join(parts)
BENCHMARK_NOTE = ("Published reference rates are shown with their payer, geography, date and purpose. They are not your dentist's fee, not your plan's allowed amount "
                  "and not a commercial price. An estimate uses them only if you enter one yourself as a hypothetical, and then labels it as such.")
JOURNEY_NOTE = ("Completion describes recorded activity (documents added, information viewed, dates entered). It is not a statement about treatment or healing. "
                "Items you mark are labeled as marked by you; items the dental team confirmed are labeled as confirmed, with the date they gave.")
SAMPLE_JOURNEY_LABEL = "Sample journey: fictional person and records. Plan rules come from the cited documents."

# ---------- uploads, extraction, review, publish (spec §7.3 to §7.6) ----------
EXTRACTION_STAGE_LABELS = {
    "queued": "Waiting to start",
    "reading_text": "Reading the document text",
    "redacting": "Removing personal details",
    "identifying_fields": "Identifying benefit fields",
    "matching_rules": "Matching the 16 procedure identifiers to the document's wording",
    "verifying_quotes": "Verifying each quote against the page text",
    "ready": "Extraction complete",
}
EXTRACTION_FAILED_SCANNED = "no text layer (scanned document)"
EXTRACTION_FAILED_MODEL = "model unavailable"
EXTRACTION_FAILED_UNREADABLE = "the document could not be processed"
REDACTION_NOTE = "The document text is treated as data. Nothing in it is followed as an instruction."
DEMO_EXTRACTION_RIBBON = "Demo mode: fields come from a stored fixture that matches this document's checksum."
DEMO_NO_MODEL_NOTE = "No extraction model is configured in this environment. Fields from a known fixture document are shown; others can be entered by hand."
LIVE_EXTRACTION_RIBBON = "Live mode: a model proposed these fields from the redacted text. Every quote was checked against the page text by the server."
PARAPHRASE_NOTE = "Extraction can return paraphrases. A quote that does not match the page text is rejected and its value is dropped."
PUBLISH_NOTE = ("Only decided rows enter the plan version. Rows marked \"Needs review\" stay AMBIGUOUS and are flagged on every estimate; "
                "rows marked \"Not in document\" stay UNKNOWN.")
IGNORED_WORDING_NOTE = "Text in the document that was not used as a rule: sentences addressed to automated readers are listed here and ignored."
UNMATCHED_WORDING_NOTE = "Wording in the document that matched none of the 16 procedure identifiers. It stays as the document printed it and enters no rule."
UPLOAD_PLAN_BANNER = "Uploaded plan: rules come from the quotes you decided on in your own document. Nothing is copied from a preset plan."
UPLOAD_VERSION_NOTE = "Published versions are immutable. Publishing again creates the next version; stored estimates keep the version they were calculated with."

# ---------- grounded assistant (spec section 8) ----------
ASSIST_RIBBON_DEMO = "Demo mode: template answers assembled from the engine's fields, not a live model."
ASSIST_RIBBON_LIVE_FALLBACK = "The model did not answer in time; a template answer is shown."

# ---------- live-AI cost guard (api/app/llm_guard.py): shown when a per-visitor or daily limit refuses a live call ----------
LLM_LIMIT_RIBBON = "The live model limit for today has been reached; a template answer is shown."
LLM_LIMIT_EXTRACTION_RIBBON = "The live model limit for today has been reached. Fields from a known fixture document are shown; others can be entered by hand."
ASSIST_GUARD_REMOVED = "{n} sentence(s) were removed by the information-only check."
ASSIST_NOTHING_SURVIVED = "No sentence about this step passed the information-only check; the clause and step are listed instead."
ASSIST_RATE_LIMITED = "Too many questions in a short time; the composer opens again in a moment."

# ---------- informational reminders (master prompt section 19): fact statements only, every figure from the engine or the user's records ----------
REMINDER_BENEFIT_YEAR_END = "Your plan document states the benefit year ends {end}. As of your statement dated {date}, {remaining} of the {maximum} annual maximum had not been used."
REMINDER_BENEFIT_YEAR_END_NO_USAGE = "Your plan document states the benefit year ends {end}. The amount of the annual maximum used this year is not provided in your records."
REMINDER_BENEFIT_YEAR_END_NO_MAX = "Your plan document states the benefit year ends {end}. The pages read do not state an annual maximum."
REMINDER_BENEFIT_YEAR_UNKNOWN = "The pages read do not state when this plan's benefit year begins, so no benefit-year end date is listed."
REMINDER_INTERVAL = "Your plan document limits {name} to one every {months} months. Your records list a service on {last}; the first date that satisfies the interval is {next}."
REMINDER_CALENDAR_COUNT = "Your plan document limits {name} to {n} per {period}. Your records list {k} in the current benefit year; the count resets on {reset}."
REMINDER_DOCUMENT_AWAITING = "A document you added ({label}) is waiting for your decisions on its extracted fields."
PUSH_TEST_BODY = "A date you chose to follow is approaching. Open the app for details."

# ---------- AI treatment-plan reader (addendum D.5a): line items as written; mapping only to the 16 fixed identifiers ----------
READER_STAGE_LABELS = {
    "reading": "Reading the document",
    "redacting": "Removing personal details",
    "reading_lines": "Finding each procedure line",
    "matching": "Matching each line to the 16 procedure identifiers",
    "ready": "Ready for your review",
}
READER_RIBBON_LIVE = "Read by the model from the redacted text. Every line, tooth, fee and code is shown as written; nothing is added until you confirm."
READER_RIBBON_LIVE_IMAGE = ("Read by the model from the image. A photo cannot be redacted before reading, so personal details in it reach the model; "
                            "the server removes them from the model's answer. Nothing is added until you confirm.")
READER_RIBBON_DEMO = "Demo mode: this text matches a stored fictional estimate, so its lines come from the stored record, not from a model."
READER_DEMO_CANNOT_READ = ("Demo mode cannot read new documents. No model is configured here; only the two stored fictional estimates are recognised. "
                           "Lines can still be added one at a time below.")
READER_LIMIT_NOTE = "The reading limit for this session or for today has been reached, so the model was not called."
READER_MODEL_FAILED = "The model did not answer in time, so the document was not read."
READER_SCANNED_PDF = "This PDF has no text layer."
READER_IMAGE_NOTICE = ("This image is sent to the model as is; names, member IDs and dates on it are not removed. Pasting the text instead lets "
                       "OralCompass remove them first. Photo metadata (camera, time, location) is removed before sending. Nothing is sent until you confirm.")
READER_NO_LINES = "No procedure lines were found in this text."
READER_CONFIRM_SOURCE = "treatment plan read by OralCompass, confirmed by you on {date}"
READER_MATCH_CODE = "Matched by the code printed on the estimate ({code})."
READER_MATCH_DESCRIPTOR = "Matched by the wording, against the procedure names and the descriptors printed in the cited public documents."
READER_MATCH_AMBIGUOUS = "The wording fits more than one procedure identifier; the choices are listed."
READER_NOT_MATCHED = "Not matched: the wording fits none of the 16 procedure identifiers."
READER_CODE_NOT_LISTED = "The printed code is not among the codes in the cited public documents; the wording was used instead."
READER_DESCRIPTION_DIFFERS = "The wording alone would match a different identifier; the printed code was used."

# ---------- AI clause explainer (addendum D.5b): one plain sentence per clause, grounded on its quote ----------
EXPLAIN_LABEL_LIVE = "Written by the model from this quote"
EXPLAIN_LABEL_DEMO = "Demo mode"
EXPLAIN_LABEL_FALLBACK = "Plain-words template"
# The depth-1 PLAIN sentences, mirrored from web/src/lib/copy.ts PLAIN (a test keeps the two identical). Demo mode returns these.
EXPLAIN_PLAIN = {
    "deductible": "The first dollars of covered care each benefit year that you pay before the plan pays its share.",
    "annual_max": "The most the plan pays for your care in a benefit year. It limits what the plan pays, not what you can owe.",
    "coinsurance": "The percentage split of the allowed amount after the deductible: the plan pays one share, you pay the rest.",
    "alternate_benefit": "When a less costly alternative exists, the plan pays on that alternative's allowance; the difference is your share.",
    "network": "In-network dentists accept the plan's allowed amount; out-of-network dentists may bill you the difference.",
    "waiting": "A period after joining the plan during which some services are not covered.",
    "frequency": "How often a service is covered, counted per benefit year or measured from the last time you had it.",
    "exclusion": "A service the plan does not pay for, or pays for only under stated conditions.",
    "dos": "For multi-visit procedures, which date the plan uses decides which benefit year the service falls in.",
    "premium": "What is paid to keep the plan, usually from each paycheck; it is not part of any procedure estimate.",
    "allowed": "The amount the plan uses as the basis for its payment; in-network dentists accept it as payment in full.",
    "plan": "Who insures the plan, where it applies, when it is in effect, and which document these rules come from.",
    "cost": "From the dentist's fee to what you pay, one rule at a time; every step is tied to the clause that produced it.",
}
EXPLAIN_PLAIN_DEFAULT = "This sentence states a rule of your plan."
