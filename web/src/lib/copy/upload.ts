/**
 * Copy namespace: UPLOAD (upload wizard, redaction preview, extraction stages, review table, publish) — owner: web upload-review + assistant agent.
 * Append strings here only; `lib/copy.ts` re-exports this file. Every string must pass `python3 tools/advice_lint.py`; no em dashes.
 * The stage copy table lives in spec §7.3 step 3; the review footer and publish note in step 4.
 */
export const UPLOAD = {} as const satisfies Record<string, string | ((...a: never[]) => string)>;
