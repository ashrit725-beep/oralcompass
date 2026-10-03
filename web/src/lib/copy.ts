/**
 * All user-facing informational copy lives here so `npm run lint:copy` (tools/advice_lint.py) can check it.
 * Rule: state what the documents say and what the arithmetic yields. Never tell the user what to do.
 */
export const FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination.";

export const BADGE_LABEL: Record<string, string> = {
  DOC: "From your plan", USER: "You entered", ASSUMED: "Assumed (hypothetical you entered)", AMBIGUOUS: "Ambiguous",
  UNKNOWN: "Not provided", CONFLICT: "Sources disagree",
};
export const BADGE_ICON: Record<string, string> = { DOC: "📄", USER: "✎", ASSUMED: "~", AMBIGUOUS: "?", UNKNOWN: "∅", CONFLICT: "⇄" };

/** Depth-1 sentences for concepts (≤ 20 words). Keyed by topic. */
export const PLAIN: Record<string, string> = {
  deductible: "The first dollars of covered care each benefit year that you pay before the plan pays its share.",
  annual_max: "The most the plan pays for your care in a benefit year. It limits what the plan pays, not what you can owe.",
  coinsurance: "The percentages split of the allowed amount after the deductible: the plan pays one share, you pay the rest.",
  alternate_benefit: "When a less costly alternative exists, the plan pays on that alternative's allowance; the difference is your share.",
  network: "In-network dentists accept the plan's allowed amount; out-of-network dentists may bill you the difference.",
  waiting: "A period after joining the plan during which some services are not covered.",
  frequency: "How often a service is covered, counted per benefit year or measured from the last time you had it.",
  exclusion: "A service the plan does not pay for, or pays for only under stated conditions.",
  dos: "For multi-visit procedures, which date the plan uses decides which benefit year the service falls in.",
  premium: "What is paid to keep the plan, usually from each paycheck; it is not part of any procedure estimate.",
};

export const UI = {
  appName: "FinePrint",
  ledgerTitle: "Estimated patient payment",
  planPays: "Estimated plan payment",
  unresolved: "Unresolved — not provided for this plan:",
  rangeBecause: (lo: string, hi: string, cause: string) => `Between ${lo} and ${hi} — because ${cause} was not provided.`,
  changedBecause: (stitch: string) => `changed because ${stitch}`,
  openOnPage: "Open on page",
  showInLedger: "Show in Ledger",
  depth: ["Plain words", "Your numbers", "Exact wording"],
  usageNotFromPlan: "Not from the plan document",
  availabilityBanner: "Listed here means the document is public — not that you are eligible to enroll.",
  comparisonNote: "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans.",
  fictional: "Fictional demonstration plan",
  upperBound: "Plan payment shown is an upper bound: the alternate allowance is not stated in this document.",
  couldChange: "Claims already submitted but not yet processed, services since your statement date, and the plan's own determination can change these amounts. This is an estimate, not the plan's decision.",
  hypotheticalHint: (ref: string) => `Reference value from the document: ${ref}. Nothing is pre-filled.`,
};
