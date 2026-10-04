"""Server-side user-facing strings and templates. Linted by tools/advice_lint.py (information only)."""
FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination."
PRESET_BANNER = "Listed here means the document is public — not that you are eligible to enroll."
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
SAMPLE_JOURNEY_LABEL = "Sample journey — fictional person and records. Plan rules come from the cited documents."

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
