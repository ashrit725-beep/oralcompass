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
