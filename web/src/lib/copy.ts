/**
 * All user-facing informational copy lives here so `npm run lint:copy` (tools/advice_lint.py) can check it.
 * Rule: state what the documents say, what your records say and what the arithmetic yields. Never tell the user what to do.
 * No patient information appears in decorative labels (island and landmark names are fixed, generic place names).
 */
export const FOOTER = "Information from your documents and your inputs. Not advice. Not the plan's determination.";
export const TAGLINE = "Your care journey. Your coverage. Clearly mapped.";

export const BADGE_LABEL: Record<string, string> = {
  DOC: "From the plan document", USER: "You entered", ASSUMED: "Hypothetical you entered", AMBIGUOUS: "Ambiguous in the document",
  UNKNOWN: "Not provided", CONFLICT: "Sources disagree",
};

/** Depth-1 sentences for concepts (≤ 20 words). Keyed by topic. */
export const PLAIN: Record<string, string> = {
  deductible: "The first dollars of covered care each benefit year that you pay before the plan pays its share.",
  annual_max: "The most the plan pays for your care in a benefit year. It limits what the plan pays, not what you can owe.",
  coinsurance: "The percentage split of the allowed amount after the deductible: the plan pays one share, you pay the rest.",
  alternate_benefit: "When a less costly alternative exists, the plan pays on that alternative's allowance; the difference is your share.",
  network: "In-network dentists accept the plan's allowed amount; out-of-network dentists may bill you the difference.",
  waiting: "A period after joining the plan during which some services are not covered.",
  frequency: "How often a service is covered, counted per benefit year or measured from the last time you had it.",
  exclusion: "A service the plan does not pay for, or pays for only under stated conditions.",
  dos: "For multi-visit procedures, which date the plan uses decides which benefit year the service falls in.",
  premium: "What is paid to keep the plan, usually from each paycheck; it is not part of any procedure estimate.",
  allowed: "The amount the plan uses as the basis for its payment; in-network dentists accept it as payment in full.",
  plan: "Who insures the plan, where it applies, when it is in effect, and which document these rules come from.",
  cost: "From the dentist's fee to what you pay, one rule at a time; every step is tied to the clause that produced it.",
};

export const NAV = { journey: "My journey", plan: "My plan", compare: "Compare", documents: "Documents" } as const;

export const LANDMARKS = [
  { id: "harbor", term: "Your plan", place: "The harbor", topic: "plan" },
  { id: "bridge", term: "Deductible", place: "The bridge", topic: "deductible" },
  { id: "cove", term: "Coverage", place: "The cove", topic: "coinsurance" },
  { id: "lookout", term: "Annual maximum", place: "The lookout", topic: "annual_max" },
  { id: "lighthouse", term: "Cost breakdown", place: "The lighthouse", topic: "cost" },
] as const;
export type LandmarkId = (typeof LANDMARKS)[number]["id"];

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completed", current: "Current", upcoming: "Upcoming", awaiting_info: "Awaiting information",
};
export const ATTRIBUTION = {
  user: "Marked by you", dental_team: "Confirmed by your dental team", document: "From a document", benefit_statement: "From a benefit statement",
} as Record<string, string>;

export const UI = {
  appName: "OralCompass",
  ledgerTitle: "Estimated patient payment",
  planPays: "Estimated plan payment",
  unresolved: "Unresolved. Not provided for this plan:",
  rangeBecause: (lo: string, hi: string, cause: string) => `Between ${lo} and ${hi}, because ${cause} was not provided.`,
  openOnPage: "Open on page",
  showInDocuments: "Open in Documents",
  openSource: "Open the official document",
  showInLedger: "Show in cost breakdown",
  depth: ["Plain words", "Your numbers", "Exact wording"],
  usageNotFromPlan: "Not from the plan document",
  availabilityBanner: "Listed here means the document is public, not that you are eligible to enroll.",
  comparisonNote: "Columns are in the order you selected. Inputs are entered for each plan separately; nothing is copied between plans.",
  fictional: "Fictional demonstration plan",
  sampleRibbon: "Sample journey: fictional person and records",
  upperBound: "Plan payment shown is an upper bound: the alternate allowance is not stated in this document.",
  couldChange: "Claims already submitted but not yet processed, services since your statement date, and the plan's own determination can change these amounts. This is an estimate, not the plan's decision.",
  progressNote: "Completion describes recorded activity (documents added, information viewed, dates entered). It is not a statement about treatment or healing.",
  nextCheckpoint: "Go to the next checkpoint",
  nextNote: "Moving to the next checkpoint only changes what is shown. It does not record anything and does not mean the step is complete.",
  noDate: "No date recorded",
  noInstructions: "No instructions have been supplied by the dental team. OralCompass does not generate instructions.",
  instructionsAsWritten: "Shown as written by the dental team",
  overview: "Overview list",
  mapView: "Map view",
  checkpointsOf: (done: number, total: number) => `${done} of ${total} checkpoints completed`,
  newUserTitle: "Starting point",
  newUserBody: "No documents yet. The journey is drawn from your plan documents, your dentist's treatment plan and the dates you or your dental team record.",
  loadSample: "Open a labeled sample journey",
  processing: "Reading your records and the plan document…",
  missingTitle: "This estimate is waiting for information",
  missingIntro: "The document and your records do not yet support a complete amount. Each missing input is listed with where it comes from.",
  notStated: "Not stated in this document",
  reconcileWarn: "Amounts do not reconcile in this view. The engine ledger is authoritative; the receipt below lists every step.",
  reconciles: "Amounts reconcile: dentist's fee minus adjustments equals the plan share plus your share.",
  errorTitle: "The records could not be loaded",
  retry: "Try again",
  privacyTitle: "Your data",
  privacyBody: "Personal records are stored only in your own space and read through owner checks on the server. Documents are never placed in public storage or logs. Fictional sample data is labeled.",
  exportData: "Download a copy of my data",
  deleteData: "Delete all my data",
  deleteHold: "Hold to delete all my data",
  deleteTap: "Keep holding to delete. This cannot be undone.",
  deleting: "Deleting…",
  exportFailed: (why: string) => `The copy of your data could not be downloaded (${why}). Nothing was changed.`,
  deleteFailed: (why: string) => `Your data could not be deleted (${why}). Nothing was removed; the records are still stored.`,
  auditFailed: (why: string) => `The access log could not be loaded (${why}).`,
  deleteConfirm: "Delete every private record (benefits, treatment items, estimates, journeys, documents)? This cannot be undone.",
  auditTitle: "Access log (ids only)",
  sourcesTitle: "Where the plan rules come from",
  benchmarkTitle: "Published reference rates",
  benchmarkNote: "Reference rates carry their payer, geography, date and purpose. They are not your dentist's fee and not your plan's allowed amount; they do not enter an estimate unless you type one in as a hypothetical.",
  allowedNote: "Dentist's fee and allowed amount are kept separate. When the plan document prints no fee schedule, the allowed amount comes from your pre-treatment estimate or EOB, with its source.",
  conflictTitle: "Where sources disagree",
  evidenceTitle: "Clauses behind these numbers",
  realPlan: "Public plan document",
  outdated: "Possibly outdated for this plan year",
  reviewCode: "code mapping shown with alternatives",
  codesNote: "Codes appear only as printed in the cited documents; a code on your own estimate takes precedence.",
  renderingDocument: "Rendering the plan document pages…",
  skipToContent: "Skip to content",
  viewsLabel: "Views",
  addJourney: "Add",
  showChosen: "Show",
  surfaceDefault: "This part of OralCompass",
  surfaceFailed: (what: string) => `${what} could not be shown.`,
  surfaceChunk: "Part of the app could not be downloaded; the connection may be offline.",
  reloadPage: "Reload the page",
};

/** Cost-trail step titles, in the fixed order of the trail. */
export const TRAIL = {
  fee: "Dentist's fee", allowed: "Allowed amount", deductible: "Deductible", share: "Plan share", max: "Annual maximum adjustment", you: "You pay",
  excluded: "Not covered by this plan", waiting: "Waiting period", frequency: "Frequency limit", alternate: "Alternate benefit", network: "Network",
  listed: "Listed on your estimate",
};

/** Day-1 copy namespaces (spec §13.2): each lives in its own file under lib/copy/ with a header naming its owner agent. */
export { PASSAGE } from "./copy/passage";
export { DRAWER } from "./copy/drawer";
export { COMPASS } from "./copy/compass";
export { PLAN } from "./copy/plan";
export { UPLOAD } from "./copy/upload";
export { ASSIST } from "./copy/assistant";
