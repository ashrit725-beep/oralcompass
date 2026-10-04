/**
 * Copy namespace: COMPASS (the Benefits compass: headline question, meters, restrictions, strip); owner: web foundation + map agent.
 * Imported directly from "@/lib/copy/compass" (lib/copy.ts still re-exports the empty placeholder of the same name from copy/passage.ts).
 * Every string must pass `python3 tools/advice_lint.py`; no em dashes. The headline is the question the panel answers, filled from fields
 * (addendum B2/B3 graft): the amounts are rendered by <Money>, so the sentence is split around them.
 */
export const COMPASS = {
  title: "Your money map",
  // headline question parts (the figure sits between `qBefore` and the chosen tail)
  qBefore: "How much of the",
  qAfterPlanned: "yearly limit is left after this care?",
  afterCalculated: "We did the math: the limit, minus what was used, minus this care.",
  qRemaining: "yearly limit is left?",
  qUnlimited: "Is there a yearly limit? The papers say no.",
  qUnknownMax: "What is the yearly limit? The papers don't say.",
  qUnresolved: "How much of the yearly limit is left? We need more info.",
  // quadrants
  deductible: "Part you pay first",
  annualMax: "Most insurance pays a year",
  coverage: "Who pays what",
  restrictions: "Rules",
  // meter labels
  limit: "limit",
  met: "met",
  used: "paid by insurance",
  remaining: "left",
  afterPlanned: "after this care",
  notProvided: "Missing",
  notStated: "The papers don't say",
  unlimited: "No limit",
  noMaxApplies: "no limit",
  waiting: "We need more info",
  derivedNote: "Left = the limit minus what your insurance letter says was used.",
  planPays: (pct: string) => `insurance pays ${pct}%`,
  outOfNetwork: (pct: string) => `dentist outside your plan's list ${pct}%`,
  shareNotStated: "insurance part not given",
  noClasses: "The papers list no groups of care.",
  // restrictions (each line opens the Coverage landmark at exact wording)
  frequency: (n: number) => `How often insurance pays · ${n} rules`,
  exclusions: (n: number) => `Things insurance won't pay for · ${n}`,
  waitingNone: "Time before insurance helps · none",
  waitingFor: (months: number, what: string) => `Time before insurance helps · ${months} months for ${what}`,
  waitingNotStated: "Time before insurance helps · papers don't say",
  waitingAmbiguous: "Time before insurance helps · papers not clear",
  altPresent: "Insurance pays for the cheaper fix · yes",
  altNotStated: "Insurance pays for the cheaper fix · papers don't say",
  unsupported: (n: number) => `Rules we show but don't use · ${n}`,
  opensCove: "shows the exact words",
  // compact strip (drawer header) and accessible names
  stripDeductible: "Pay-first part left",
  stripMax: "Yearly limit left",
  // info-only-12: each figure reads on its own ("deductible remaining: not provided"), never "deductible Not provided remaining"
  panelLabel: (title: string, ded: string, max: string) => {
    const low = (v: string) => (/^[A-Z][a-z]/.test(v) ? v[0].toLowerCase() + v.slice(1) : v);
    return `Money map for ${title}: pay-first part left: ${low(ded)}; yearly limit left: ${low(max)}.`;
  },
  meterName: (what: string, used: string, total: string) => `${what}: ${used} of ${total}`,
  tableCaption: "Money map numbers",
  colFigure: "What",
  colAmount: "How much",
  colEvidence: "Where it's from",
} as const satisfies Record<string, string | ((...a: never[]) => string)>;
