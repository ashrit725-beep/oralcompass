"""The information-only linter (tools/advice_lint.py): owner rule "no advice for anything at all". Allowed sentences state numbers
and where they come from; denied sentences tell someone what to do, ask, call, check, wait for, schedule or pick."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
from advice_lint import lint_text  # noqa: E402

ALLOWED = [
    "You pay $120. Insurance pays $480.",
    "The deductible is the part you pay first, before insurance starts to help.",
    "This number comes from your plan papers.",
    "OralCompass only shows costs. It does not pick for you. Here is what the costs are.",
    "OralCompass only shows costs, not health answers.",
    "Your plan pays for one cleaning every 6 months.",
    "Some details are missing, so there is no number yet.",
    "The plan's rule book says the year starts in January.",
    "Waiting for the papers to be read.",
    "Your plan does not pay for this, so you pay all of it.",
]

DENIED = [
    "Ask your dentist about this.",
    "Please ask your dentist; OralCompass only explains your plan.",
    "You can talk to your plan about it.",
    "Call the plan to find out more.",
    "Contact your insurer for the missing number.",
    "Check with your dentist before the visit.",
    "Make sure you have your card with you.",
    "Remember to bring your benefit statement.",
    "Don't forget your benefits reset in January.",
    "You may want to look at the other plan.",
    "It's a good idea to get a second quote.",
    "This crown is worth it this year.",
    "Consider waiting until next year.",
    "We recommend the second plan.",
    "You should get the filling first.",
    "This is the best plan for you.",
    "Wait until January for the crown.",
    "Schedule the crown in January to keep more money.",
    "You could schedule it after the deductible resets.",
]


@pytest.mark.parametrize("text", ALLOWED)
def test_allowed_sentences_pass(text):
    assert lint_text(text) == [], lint_text(text)


@pytest.mark.parametrize("text", DENIED)
def test_denied_sentences_are_caught(text):
    assert lint_text(text), text
