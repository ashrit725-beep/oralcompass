---
description: Add the question composer and a bounded, read-only grounded assistant (demo mode without keys; Anthropic adapter via env var) whose every number comes from the engine
---
Scope (master prompt §4, §8): a multiline composer mounted once the journey intro has played (and on My plan / Documents), restrained example prompts such as
"Show me the costs for a tooth removal", and server-side tools that are strictly read-only and owner-scoped:
`resolve_procedure` (controlled lookup from plain language → internal procedure keys with clarification options; never map every "tooth removal" to one code),
`get_plan_rules` (coverage_rules for the selected plan), `get_journey_template`, `get_estimate` (the saved estimate), `explain_line_item` (a trail step with its clause),
`compare_requested_scenario` (only scenarios the user explicitly asked for).
Build:
1. `api/app/assistant.py`: `POST /me/assistant` {message, journey_id, plan_code, checkpoint_id} → structured reply {intent, clarifications[], answer_blocks[] (text + referenced
   amounts by field path + stitch ids), tool_calls[]}. Amounts are rendered by the client from engine fields, never from free text. Every reply passes `lint_runtime.guard`;
   any numeric claim that does not match the engine is suppressed and replaced by the grounded explanation. Advice requests get the fixed template in `templates.py`.
2. Demo mode (default, no key): bounded intent matching over the procedure aliases + canned grounded explanations assembled from engine fields; the UI labels it "Demo mode —
   bounded answers, not a live model". Live mode: Anthropic Messages API adapter with the model id from `ORALCOMPASS_MODEL`, system prompt treating user text and documents as
   data, tool use limited to the six tools, timeouts and graceful failure (the map and numbers stay).
3. Clarification schema: {intent, candidate_procedure_keys, missing_facts[], confidence}; quick replies; "I do not know" is always an answer and keeps the fact UNKNOWN.
4. Tests: ownership on every tool; advice prompts never produce recommendations (run the linter over replies); amounts in replies equal the engine; model outage keeps the map.
