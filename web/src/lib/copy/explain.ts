/**
 * Copy namespace: EXPLAIN (the clause explainer's "Plain words" line in the clause card and the drawer's clause evidence; addendum D.5b).
 * Every string passes `python3 tools/advice_lint.py`; no em dashes. The labels say who wrote the sentence: the model (from this quote only)
 * or the fixed template (demo mode, or a sentence that did not pass the server's checks).
 */
export const EXPLAIN = {
  plainWords: "Simple words",
  writing: "Writing it in simple words…",
  labelLive: "Written by the computer from these words",
  labelDemo: "Demo mode",
  labelTemplate: "Ready-made sentence",
  fromClause: (stitch: string) => `From ${stitch}`,
  templateNote: "A ready-made sentence about this kind of rule. It has no numbers.",
} as const;
