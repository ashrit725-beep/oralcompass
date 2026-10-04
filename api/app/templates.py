"""Server-side user-facing strings and templates. Linted by tools/advice_lint.py (information only)."""
FOOTER = "These numbers come from your plan papers and what you typed. The plan makes the final call on what it pays."
PRESET_BANNER = "This plan is here because its papers are public. It does not mean you can join it."
COMPARISON_BANNER = "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans."

ADVICE_INTRO = "OralCompass only shows costs. It does not pick for you. Here is what the costs are."
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
    "queued": "Getting ready",
    "reading_text": "Reading the words in your papers",
    "redacting": "Hiding your name and private facts",
    "identifying_fields": "Finding the plan's numbers",
    "matching_rules": "Finding the rule for each kind of dental work",
    "verifying_quotes": "Checking each quote is really on the page",
    "ready": "All done reading",
}
EXTRACTION_FAILED_SCANNED = "this is a picture of a page, so there are no words to read"
EXTRACTION_FAILED_MODEL = "the reading helper is not working right now"
EXTRACTION_FAILED_UNREADABLE = "the papers could not be read"
REDACTION_NOTE = "OralCompass only reads the words in your papers. It never does what they say."
DEMO_EXTRACTION_RIBBON = "Practice mode: these numbers come from a stored copy of these same papers."
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
ASSIST_RIBBON_DEMO = "Practice mode: these answers are built from your numbers, not by an AI helper."
LIVE_AI_PROVIDER_LIMIT = "Live AI is unavailable right now (provider limit reached); showing fixed explanations."
ASSIST_RIBBON_LIVE_FALLBACK = "The AI helper took too long, so a ready-made answer is shown."

# ---------- live-AI cost guard (api/app/llm_guard.py): shown when a per-visitor or daily limit refuses a live call ----------
LLM_LIMIT_RIBBON = "The AI helper is used up for today, so a ready-made answer is shown."
LLM_LIMIT_EXTRACTION_RIBBON = "The live model limit for today has been reached. Fields from a known fixture document are shown; others can be entered by hand."
ASSIST_GUARD_REMOVED = "{n} sentence(s) were removed by the information-only check."
ASSIST_NOTHING_SURVIVED = "The answer had words that pick for you, so it was taken out. The rule and the step are shown instead."
ASSIST_RATE_LIMITED = "That was a lot of questions at once. The question box opens again in a moment."

# ---------- informational reminders (master prompt section 19): fact statements only, every figure from the engine or the user's records ----------
REMINDER_BENEFIT_YEAR_END = "Your plan document states the benefit year ends {end}. As of your statement dated {date}, {remaining} of the {maximum} annual maximum had not been used."
REMINDER_BENEFIT_YEAR_END_NO_USAGE = "Your plan document states the benefit year ends {end}. The amount of the annual maximum used this year is not provided in your records."
REMINDER_BENEFIT_YEAR_END_NO_MAX = "Your plan document states the benefit year ends {end}. The pages read do not state an annual maximum."
REMINDER_BENEFIT_YEAR_UNKNOWN = "Your papers do not say when the plan's year starts, so there is no end date here."
REMINDER_INTERVAL = "Your plan document limits {name} to one every {months} months. Your records list a service on {last}; the first date that satisfies the interval is {next}."
REMINDER_CALENDAR_COUNT = "Your plan document limits {name} to {n} per {period}. Your records list {k} in the current benefit year; the count resets on {reset}."
REMINDER_DOCUMENT_AWAITING = "Papers you added ({label}) have numbers that are waiting for you to look at."
PUSH_TEST_BODY = "A date you are following is coming up. The app has the details."

# ---------- AI treatment-plan reader (addendum D.5a): line items as written; mapping only to the 16 fixed identifiers ----------
READER_STAGE_LABELS = {
    "reading": "Reading your papers",
    "redacting": "Removing personal details",
    "reading_lines": "Finding each line of dental work",
    "matching": "Finding what kind of work each line is",
    "ready": "Ready for you to look at",
}
READER_RIBBON_LIVE = "Read by the model from the redacted text. Every line, tooth, fee and code is shown as written; nothing is added until you confirm."
READER_RIBBON_LIVE_IMAGE = ("Read by the model from the image. A photo cannot be redacted before reading, so personal details in it reach the model; "
                            "the server removes them from the model's answer. Nothing is added until you confirm.")
READER_RIBBON_DEMO = "Demo mode: this text matches a stored fictional estimate, so its lines come from the stored record, not from a model."
READER_DEMO_CANNOT_READ = ("Demo mode cannot read new documents. No model is configured here; only the two stored fictional estimates are recognized. "
                           "Lines can still be added one at a time below.")
READER_LIMIT_NOTE = "The reading limit for this session or for today has been reached, so the model was not called."
READER_PROVIDER_LIMIT = "Live AI is unavailable right now (provider limit reached), so the document was not read."
READER_MODEL_FAILED = "The reading helper took too long, so the papers were not read."
READER_SCANNED_PDF = "This PDF is a picture of a page, so there are no words to read."
READER_IMAGE_NOTICE = ("This image is sent to the model as is; names, member IDs and dates on it are not removed. Pasting the text instead lets "
                       "OralCompass remove them first. Photo metadata (camera, time, location) is removed before sending. Nothing is sent until you confirm.")
READER_NO_LINES = "No lines of dental work were found here."
READER_CONFIRM_SOURCE = "treatment plan read by OralCompass, confirmed by you on {date}"
READER_MATCH_CODE = "Found by the code on the paper ({code})."
READER_MATCH_DESCRIPTOR = "Matched by the wording, against the procedure names and the descriptors printed in the cited public documents."
READER_MATCH_AMBIGUOUS = "These words fit more than one kind of work. Each one is in the list."
READER_NOT_MATCHED = "No match: these words do not fit any kind of work OralCompass knows."
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
