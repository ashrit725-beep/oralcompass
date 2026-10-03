---
description: Generate the pitch's numbers and talking points from the tested fixture so slides never drift from the engine
---
1. Run `cd engine && python3 - <<'EOF'` style script that imports `oralcompass_engine`, loads `load_fixture_set()`, computes: Harborview in-network / out-of-network /
   premolar / deductible-unknown range; the three-plan comparison with Sam's inputs only; Delta and MetLife with the hypotheticals in `tests/test_fixture.py`;
   and writes `docs/pitch_numbers.json` plus `docs/PITCH_NUMBERS.md` (a table of every number that may appear on a slide, with its evidence badge and stitch).
2. Produce `docs/PITCH_SCRIPT.md` from `docs/CODELINC_DENTAL_BUILD_BRIEF.md` §14 and the spec §7, substituting ONLY numbers from `pitch_numbers.json`.
3. Run `python3 tools/advice_lint.py docs/PITCH_SCRIPT.md` — 0 violations. The pitch may say "the user decides"; it may not say "save", "best" or "should".
4. State on the trust slide: engine tests count, extraction score from `docs/M0_RESULT.md`, what is synthetic (member, dentist, Harborview) and what is public (Delta MSU 2024 EOC; NCFlex 2026 guide), and that nothing is a guarantee of payment.
