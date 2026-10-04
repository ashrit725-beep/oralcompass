/**
 * All user-facing informational copy lives here so `npm run lint:copy` (tools/advice_lint.py) can check it.
 * Rule: state what the documents say, what your records say and what the arithmetic yields. Never tell the user what to do.
 * No patient information appears in decorative labels (island and landmark names are fixed, generic place names).
 */
export const FOOTER = "These numbers come from your papers and what you typed. Your plan makes the final call.";
export const TAGLINE = "What you pay. What insurance pays. Made simple.";

export const BADGE_LABEL: Record<string, string> = {
  DOC: "From your plan papers", USER: "You typed this", ASSUMED: "Our guess", AMBIGUOUS: "Papers are not clear",
  UNKNOWN: "Missing", CONFLICT: "Papers disagree",
};

/** Depth-1 sentences for concepts (≤ 20 words). Keyed by topic. */
export const PLAIN: Record<string, string> = {
  deductible: "The part you pay first each year. Then insurance starts to help.",
  annual_max: "The most insurance pays in a year. After that, you pay it all.",
  coinsurance: "Insurance pays part of the bill. You pay the rest.",
  alternate_benefit: "Insurance pays for the cheaper fix instead. You pay the difference.",
  network: "Dentists on your plan's list take the plan's price. Others can charge you more.",
  waiting: "How long before insurance helps with this.",
  frequency: "How often insurance pays for it.",
  exclusion: "Something insurance does not pay for.",
  dos: "For care over many visits, one date picks which year it counts in.",
  premium: "What it costs to have the plan. It is not in these numbers.",
  allowed: "The price your plan agreed to with the dentist.",
  plan: "Who runs your plan, when it works, and which papers we read.",
  cost: "From the dentist's price to what you pay, one step at a time.",
};

export const NAV = { journey: "My journey", plan: "My plan", documents: "Documents" } as const;

export const LANDMARKS = [
  { id: "harbor", term: "Your plan", place: "The harbor", topic: "plan" },
  { id: "bridge", term: "Pay first part", place: "The bridge", topic: "deductible" },
  { id: "cove", term: "Who pays what", place: "The cove", topic: "coinsurance" },
  { id: "lookout", term: "Yearly limit", place: "The lookout", topic: "annual_max" },
  { id: "lighthouse", term: "You pay", place: "The lighthouse", topic: "cost" },
] as const;
export type LandmarkId = (typeof LANDMARKS)[number]["id"];

export const STATUS_LABEL: Record<string, string> = {
  completed: "Completed", current: "Current", upcoming: "Upcoming", awaiting_info: "Waiting on info",
};
export const ATTRIBUTION = {
  user: "You marked this", dental_team: "Your dentist's office said so", document: "From your papers", benefit_statement: "From your insurance letter",
} as Record<string, string>;

export const UI = {
  appName: "OralCompass",
  ledgerTitle: "You pay",
  planPays: "Insurance pays",
  unresolved: "We can't tell yet. This is missing:",
  rangeBecause: (lo: string, hi: string, cause: string) => `Somewhere from ${lo} to ${hi}. We do not know ${cause} yet.`,
  openOnPage: "See it in the papers",
  showInDocuments: "See it in your papers",
  openSource: "See the real plan papers",
  showInLedger: "See the money steps",
  depth: ["Simple words", "Your numbers", "The exact words"],
  usageNotFromPlan: "Not from your plan papers",
  availabilityBanner: "Listed here means the document is public, not that you are eligible to enroll.",
  fictional: "Pretend plan for showing how it works",
  sampleRibbon: "Pretend example: not a real person",
  upperBound: "Insurance may pay less than this. The papers don't say the cheaper fix's price.",
  couldChange: "These numbers can change. Bills still being handled can change them. Your plan makes the final call.",
  progressNote: "Done means papers added or dates typed. It says nothing about your teeth.",
  nextCheckpoint: "Next stop",
  nextNote: "This only changes what you see. Nothing is written down.",
  noDate: "No date yet",
  noInstructions: "Your dentist's office gave no notes here. OralCompass never writes notes.",
  instructionsAsWritten: "Just as your dentist's office wrote it",
  overview: "List",
  mapView: "Map",
  checkpointsOf: (done: number, total: number) => `${done} of ${total} stops done`,
  newUserTitle: "Start here",
  newUserBody: "No papers yet. Your map comes from your plan papers and your dentist's plan.",
  loadSample: "See a pretend example",
  processing: "Reading your papers…",
  missingTitle: "We need more info for this number",
  missingIntro: "Some numbers are missing. Here is each one and where it comes from.",
  notStated: "The papers don't say",
  reconcileWarn: "These numbers don't add up here. The steps below are the right ones.",
  reconciles: "It adds up: insurance pays plus you pay equals the price.",
  errorTitle: "We couldn't load your papers",
  retry: "Try again",
  privacyTitle: "Your stuff",
  privacyBody: "Your papers are kept just for you. Nobody else can see them. Pretend examples say they are pretend.",
  exportData: "Get a copy of my stuff",
  deleteData: "Erase all my stuff",
  deleteHold: "Hold to erase all my stuff",
  deleteTap: "Keep holding to erase. It can't come back.",
  deleting: "Erasing…",
  exportFailed: (why: string) => `We couldn't get your copy (${why}). Nothing changed.`,
  deleteFailed: (why: string) => `We couldn't erase your stuff (${why}). Everything is still here.`,
  auditFailed: (why: string) => `We couldn't load the list of who looked (${why}).`,
  deleteConfirm: "Erase all your papers and numbers? They can't come back.",
  auditTitle: "Who looked (ID numbers only)",
  sourcesTitle: "Where the rules come from",
  benchmarkTitle: "Prices other places list",
  benchmarkNote: "These are prices other places list. They are not your dentist's price. They are not in your numbers unless you type one in.",
  allowedNote: "The dentist's price and the price your plan agreed to are kept apart. If the papers list no prices, we use your insurance letter.",
  conflictTitle: "Where papers disagree",
  evidenceTitle: "Words behind these numbers",
  realPlan: "Real plan papers anyone can see",
  outdated: "Might be old for this year",
  reviewCode: "other matching codes shown too",
  codesNote: "Codes are shown just as the papers print them. A code on your own letter wins.",
  renderingDocument: "Drawing the plan pages…",
  skipToContent: "Skip to content",
  viewsLabel: "Views",
  addJourney: "Add",
  showChosen: "Show",
  surfaceDefault: "This part of the app",
  surfaceFailed: (what: string) => `We couldn't show ${what}.`,
  surfaceChunk: "Part of the app didn't load. The internet may be off.",
  reloadPage: "Reload the page",
};

/** Cost-trail step titles, in the fixed order of the trail. */
export const TRAIL = {
  fee: "Dentist's price", allowed: "Price your plan agreed to", deductible: "Part you pay first", share: "Insurance pays", max: "Yearly limit cut", you: "You pay",
  excluded: "Insurance doesn't pay for this", waiting: "Wait before insurance helps", frequency: "How often insurance pays", alternate: "Insurance pays for the cheaper fix", network: "On your plan's list?",
  listed: "On your insurance letter",
};

/** Day-1 copy namespaces (spec §13.2): each lives in its own file under lib/copy/ with a header naming its owner agent. */
export { PASSAGE } from "./copy/passage";
export { DRAWER } from "./copy/drawer";
export { COMPASS } from "./copy/compass";
export { PLAN } from "./copy/plan";
export { UPLOAD } from "./copy/upload";
export { ASSIST } from "./copy/assistant";
export { OFFLINE } from "./copy/offline";
