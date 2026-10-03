"""Server-side user-facing strings and templates. Linted by tools/advice_lint.py (information only)."""
FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination."
PRESET_BANNER = "Listed here means the document is public — not that you are eligible to enroll."
COMPARISON_BANNER = "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans."

def advice_question_response(facts_by_scenario: dict[str, str], differences: list[str], not_provided: list[str]) -> str:
    """Fixed neutral template for questions that ask the app to decide — a comparison of facts; the user decides."""
    parts = ["FinePrint provides information, not a choice. Here is what the supplied documents and inputs show."]
    for name, facts in facts_by_scenario.items():
        parts.append(f"{name}: {facts}")
    if differences:
        parts.append("Differences: " + " ".join(differences))
    if not_provided:
        parts.append("Not provided: " + ", ".join(not_provided) + ".")
    return " ".join(parts)
