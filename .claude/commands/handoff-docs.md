---
description: Produce the handoff set from the master prompt §13 (TEST_RESULTS, ASSUMPTIONS, CALCULATION_RULES, DATA_DICTIONARY, judge walkthrough) and package the zip
---
1. Run `/run-checks` and write `docs/TEST_RESULTS.md` with the exact commands and actual outputs (never claim a test that did not run).
2. `docs/CALCULATION_RULES.md` from `engine/oralcompass_engine/ledger.py` (the baseline formula, caps, waiting, frequency, alternate benefit, OON, unlimited maximum, separate OON limits).
3. `docs/ASSUMPTIONS.md`: every ASSUMED/UNKNOWN handling, the dos_rule assumption, per-tooth clocks not enforced, demo-data labeling.
4. `docs/DATA_DICTIONARY.md` from `docs/ORALCOMPASS_DATA_MODEL.md` plus every fixture field.
5. `docs/JUDGE_WALKTHROUGH.md`: a 4-minute path (Alex sample → island → checkpoint attribution → lighthouse trail → stitch → Documents conflict → Compare → privacy delete).
6. `bash scripts/package.sh` → `OralCompass-codeLinc11.zip` (excludes node_modules, dist, caches, .env, user data).
