---
description: Lint any text for advisory or steering language and rewrite violations as information-only statements
---
Lint the text or files given as $ARGUMENTS with `python3 tools/advice_lint.py` (use `--text "..."` for inline text).
For every violation, propose a rewrite that states what the document says or what the arithmetic yields, with no recommendation, ranking, urgency or
"savings" framing. Examples:
- "Confirm your remaining maximum first." → "Remaining annual maximum changes these figures by up to $1,160; it is not in your plan document (it appears on your EOB or member portal)."
- "Schedule the crown in January to save $410." → "If this crown's completion date falls in 2027, the plan's share under these rules is $525 instead of $115.50; under carriers that use the preparation date, both dates fall in 2026."
Apply the rewrites to the files, re-run the linter, and report the before/after counts.
