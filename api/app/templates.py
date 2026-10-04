"""Server-side user-facing strings and templates. Linted by tools/advice_lint.py (information only)."""
FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination."
PRESET_BANNER = "Listed here means the document is public — not that you are eligible to enroll."
COMPARISON_BANNER = "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans."

def advice_question_response(facts_by_scenario: dict[str, str], differences: list[str], not_provided: list[str]) -> str:
    """Fixed neutral template for questions that ask the app to decide — a comparison of facts; the user decides."""
    parts = ["OralCompass provides information, not a choice. Here is what the supplied documents and inputs show."]
    for name, facts in facts_by_scenario.items():
        parts.append(f"{name}: {facts}")
    if differences:
        parts.append("Differences: " + " ".join(differences))
    if not_provided:
        parts.append("Not provided: " + ", ".join(not_provided) + ".")
    return " ".join(parts)
BENCHMARK_NOTE = ("Published reference rates are shown with their payer, geography, date and purpose. They are not your dentist's fee, not your plan's allowed amount "
                  "and not a commercial price. An estimate uses them only if you enter one yourself as a hypothetical, and then labels it as such.")
JOURNEY_NOTE = ("Completion describes recorded activity (documents added, information viewed, dates entered). It is not a statement about treatment or healing. "
                "Items you mark are labeled as marked by you; items the dental team confirmed are labeled as confirmed, with the date they gave.")
SAMPLE_JOURNEY_LABEL = "Sample journey — fictional person and records. Plan rules come from the cited documents."

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
