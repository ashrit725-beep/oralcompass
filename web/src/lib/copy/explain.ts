/**
 * Copy namespace: EXPLAIN (the clause explainer's "Plain words" line in the clause card and the drawer's clause evidence; addendum D.5b).
 * Every string passes `python3 tools/advice_lint.py`; no em dashes. The labels say who wrote the sentence: the model (from this quote only)
 * or the fixed template (demo mode, or a sentence that did not pass the server's checks).
 */
export const EXPLAIN = {
  plainWords: "Plain words",
  writing: "Writing a plain sentence from this quote…",
  labelLive: "Written by the model from this quote",
  labelDemo: "Demo mode",
  labelTemplate: "Plain-words template",
  fromClause: (stitch: string) => `From ${stitch}`,
  templateNote: "A fixed sentence about this kind of clause, not about this quote's figures.",
} as const;
