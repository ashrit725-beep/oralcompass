/**
 * Copy namespace: ASSIST ("Ask about this step" composer, suggestions, answer card, demo-mode label, guard notice) — owner: web
 * upload-review + assistant agent. Append strings here only; `lib/copy.ts` re-exports this file. Every string must pass
 * `python3 tools/advice_lint.py`; no em dashes. The composer's aria-describedby sentence is information-only by construction.
 */
export const ASSIST = {} as const satisfies Record<string, string | ((...a: never[]) => string)>;
