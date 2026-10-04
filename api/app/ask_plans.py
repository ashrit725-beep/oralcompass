"""The prompt box plan dropdown (owner request): three choices, each one Delta Dental PPO-family plan in the catalog.

Mirrors web/src/lib/ask-plans.ts. The label the person picks ("Plan A") maps to one plan code; one plan per answer, never side by side.
"""

ASK_PLANS = {"A": "DD24", "B": "DD24L", "C": "FD26H"}
ASK_PLAN_LABELS = {"A": "Plan A", "B": "Plan B", "C": "Plan C"}


def plan_code(choice):
    """'A' | 'B' | 'C' (or 'Plan A') to a plan code; anything else is None."""
    if not isinstance(choice, str):
        return None
    c = choice.strip().upper().replace("PLAN", "").strip()
    return ASK_PLANS.get(c)
