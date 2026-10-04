/**
 * Copy namespace: PASSAGE, DRAWER, COMPASS — owner: web foundation + map agent (spec §13.1).
 * Append strings here only; `lib/copy.ts` re-exports this file. Every string must pass `python3 tools/advice_lint.py`:
 * state what the documents say, what the records say and what the arithmetic yields; never tell the user what to do; no em dashes.
 */
export const PASSAGE = {} as const satisfies Record<string, string | ((...a: never[]) => string)>;
export const DRAWER = {} as const satisfies Record<string, string | ((...a: never[]) => string)>;
export const COMPASS = {} as const satisfies Record<string, string | ((...a: never[]) => string)>;
