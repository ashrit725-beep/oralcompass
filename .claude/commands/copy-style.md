---
description: Apply the master prompt's copy style — no em dashes in user-facing copy, no decorative quoted slogans — and add the rule to the linter
---
1. In `web/src/lib/copy.ts` and `api/app/templates.py` rewrite every user-facing em dash ("—") as a period, comma or colon without changing meaning; keep code comments as they are.
2. Remove display phrases wrapped in decorative quotation marks (quotes around document excerpts are fine — they are citations).
3. Add rule 5 to `tools/advice_lint.py`: flag "—" in string literals of the two copy files; keep exit code 1 on violations. Run the linter and the screenshot walk.
