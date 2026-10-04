/**
 * Copy namespace: COMPASS (the Benefits compass: headline question, meters, restrictions, strip); owner: web foundation + map agent.
 * Imported directly from "@/lib/copy/compass" (lib/copy.ts still re-exports the empty placeholder of the same name from copy/passage.ts).
 * Every string must pass `python3 tools/advice_lint.py`; no em dashes. The headline is the question the panel answers, filled from fields
 * (addendum B2/B3 graft): the amounts are rendered by <Money>, so the sentence is split around them.
 */
export const COMPASS = {
  title: "Benefits compass",
  // headline question parts (the figure sits between `qBefore` and the chosen tail)
  qBefore: "How much of the",
  qAfterPlanned: "maximum remains after the planned work?",
  qRemaining: "maximum remains?",
  qUnlimited: "Is there a dollar maximum? The document states none.",
  qUnknownMax: "What is the annual maximum? Not stated in this document.",
  qUnresolved: "How much of the maximum remains after the planned work? Waiting for information.",
  // quadrants
  deductible: "Deductible",
  annualMax: "Annual maximum",
  coverage: "Coverage",
  restrictions: "Restrictions",
  // meter labels
  limit: "limit",
  met: "met",
  used: "paid by the plan",
  remaining: "remaining",
  afterPlanned: "after the planned work",
  notProvided: "Not provided",
  notStated: "Not stated in this document",
  unlimited: "Unlimited (no dollar maximum)",
  noMaxApplies: "no maximum applies",
  waiting: "Waiting for information",
  derivedNote: "Remaining amounts are derived: the document's limit minus the figures on your statement.",
  planPays: (pct: string) => `plan pays ${pct}%`,
  outOfNetwork: (pct: string) => `out-of-network ${pct}%`,
  shareNotStated: "plan share not stated",
  noClasses: "The pages read name no coverage classes.",
  // restrictions (each line opens the Coverage landmark at exact wording)
  frequency: (n: number) => `Frequency limits · ${n} listed`,
  exclusions: (n: number) => `Exclusions · ${n} named in the pages read`,
  waitingNone: "Waiting periods · none stated",
  waitingFor: (months: number, what: string) => `Waiting periods · ${months} months for ${what}`,
  waitingNotStated: "Waiting periods · not stated",
  waitingAmbiguous: "Waiting periods · ambiguous in the document",
  altPresent: "Alternate benefit · clause present",
  altNotStated: "Alternate benefit · not stated",
  unsupported: (n: number) => `Rules quoted but not applied · ${n}`,
  opensCove: "opens Coverage at exact wording",
  // compact strip (drawer header) and accessible names
  stripDeductible: "Deductible remaining",
  stripMax: "Annual maximum remaining",
  panelLabel: (title: string, ded: string, max: string) => `Benefits compass for ${title}: deductible ${ded} remaining, annual maximum ${max} remaining.`,
  meterName: (what: string, used: string, total: string) => `${what}: ${used} of ${total}`,
  tableCaption: "Benefits compass figures",
  colFigure: "Figure",
  colAmount: "Amount",
  colEvidence: "Evidence",
} as const satisfies Record<string, string | ((...a: never[]) => string)>;
