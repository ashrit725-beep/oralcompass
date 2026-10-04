/**
 * On-device redaction (owner's feature request; design point 1). Runs in the browser on the pdf.js text layer BEFORE anything is uploaded.
 *
 * Two stages, both deterministic and linear in the input length:
 * 1. `detectIdentifiers` finds personal identifiers with label-anchored and shape patterns (names after a Patient/Member/... label, street
 *    and "City, ST 12345" lines, member/group/claim/account numbers, SSNs, dates of birth, personal phone numbers, emails). Every pattern
 *    uses bounded repetitions only and starts on a word boundary, so a hostile page cannot make it backtrack quadratically (the same rule as
 *    api/app/redaction.py, security-1). Identifier values that would carry plan meaning are refused: CDT codes, dollar amounts, percentages,
 *    plan dates without a birth label, toll-free carrier numbers, carrier prose ("Member Services", "group dental plan").
 * 2. `applyRedaction` removes every occurrence of every confirmed identifier (the ones the person did not mark "Keep in text", plus the
 *    terms they added) with a token matcher: case-insensitive, whitespace/line-break-insensitive and punctuation-insensitive, so a member ID
 *    printed "HB26-4471-902" in the header and "HB26 4471 902" in a table is one identifier removed in two places. Names only match where
 *    every word is capitalised, so a name made of ordinary words ("Will Park") never removes the lowercase prose words.
 *
 * The COUNT is distinct identifiers (de-duplicated by normalised value); occurrences are tracked separately.
 */

export type IdentifierCategory =
  | "name" | "address" | "member_id" | "group_number" | "claim_number" | "account_number" | "ssn" | "dob" | "phone" | "email";

export interface FoundIdentifier {
  /** Stable hash of category + normalised value (the same identifier on another visit has the same id). */
  id: string;
  category: IdentifierCategory;
  /** The value as printed (first occurrence; a value broken across lines is joined). */
  value: string;
  /** How many places it is (or would be) removed from. */
  occurrences: number;
  /** 1-based page numbers where it occurs, ascending. */
  pages: number[];
}

export interface RedactionResult {
  /** The page texts with every removed identifier replaced by its placeholder. */
  pages: string[];
  /** Every known identifier: the detected ones (kept ones included) followed by the person's added terms. */
  identifiers: FoundIdentifier[];
  /** The identifiers actually removed from `pages` (not kept, found at least once). */
  removed: FoundIdentifier[];
  /** Distinct identifiers removed (= removed.length). */
  total: number;
  byCategory: Partial<Record<IdentifierCategory, number>>;
  /** Places replaced in `pages`. */
  occurrences: number;
}

export const REDACTION_VERSION = 1;

export const IDENTIFIER_CATEGORIES: readonly IdentifierCategory[] = [
  "name", "address", "member_id", "group_number", "claim_number", "account_number", "ssn", "dob", "phone", "email",
];

const PLACEHOLDERS: Record<IdentifierCategory, string> = {
  name: "[name removed]",
  address: "[address removed]",
  member_id: "[member ID removed]",
  group_number: "[group number removed]",
  claim_number: "[claim number removed]",
  account_number: "[account number removed]",
  ssn: "[SSN removed]",
  dob: "[date of birth removed]",
  phone: "[phone removed]",
  email: "[email removed]",
};

export function placeholder(c: IdentifierCategory): string {
  return PLACEHOLDERS[c];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pattern building blocks. All patterns use the `u` flag; every repetition is bounded.
// ---------------------------------------------------------------------------------------------------------------------------------

const SP = "[ \\t]";
/** Word start: the previous character is not a letter or digit. */
const WS = "(?<![\\p{L}\\p{N}])";
/** Word end. */
const WE = "(?![\\p{L}\\p{N}])";
/** Title, UPPER and lower spellings of a label word ("Member", "MEMBER", "member"). */
const v = (w: string) => {
  const forms = new Set([w, w.toUpperCase(), w.toLowerCase(), w[0].toUpperCase() + w.slice(1).toLowerCase()]);
  return `(?:${[...forms].join("|")})`;
};
const words = (...ws: string[]) => ws.map(v).join("|");
/** Between a label and its value: spaces, up to two of ":#.-", and at most one line break (a value printed on the next line). */
const SEP = `${SP}{0,3}(?:[:#.\\-–]${SP}{0,3}){0,2}(?:\\r?\\n${SP}{0,3})?`;
/** "Number", "No.", "Num.", "#", "ID". */
const NUM_KW = `(?:${v("Number")}|${v("Num")}\\.?|${v("No")}\\.?|#|${v("ID")}|I\\.D\\.?)`;
/** An identifier value: 5–20 of [A-Za-z0-9-] containing a digit; one "-<line break>" continuation is allowed (a value wrapped at a hyphen). */
const ID_VALUE = `((?=[A-Za-z0-9\\-\\r\\n]{0,24}[0-9])[A-Za-z0-9](?:[A-Za-z0-9]|-(?:\\r?\\n)?){4,22})(?![A-Za-z0-9\\-])`;

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sept", "Sep", "Oct", "Nov", "Dec"];
const MONTH = `(?:${[...MONTHS_LONG, ...MONTHS_SHORT].map(v).join("|")})`;
const DATE =
  `(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-](?:\\d{4}|\\d{2})` +
  `|\\d{4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,2}` +
  `|${MONTH}\\.?${SP}{1,3}\\d{1,2}(?:st|nd|rd|th)?,?${SP}{1,3}\\d{4}` +
  `|\\d{1,2}(?:st|nd|rd|th)?${SP}{1,3}${MONTH}\\.?,?${SP}{1,3}\\d{4})(?![0-9])`;

const STREET_SUFFIXES = [
  "Street", "St", "Avenue", "Ave", "Road", "Rd", "Boulevard", "Blvd", "Drive", "Dr", "Lane", "Ln", "Court", "Ct", "Way", "Place", "Pl",
  "Parkway", "Pkwy", "Terrace", "Ter", "Circle", "Cir", "Highway", "Hwy", "Trail", "Trl", "Loop", "Square", "Sq", "Run", "Pike",
];
const SUFFIX = `(?:${STREET_SUFFIXES.flatMap((s) => [s, s.toUpperCase()]).join("|")})`;
const DIRECTION = "(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West|NORTH|SOUTH|EAST|WEST)";
const UNIT = `(?:Apt|APT|Apartment|APARTMENT|Suite|SUITE|Ste|STE|Unit|UNIT|#)`;
const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA",
  "WA", "WV", "WI", "WY", "DC", "PR", "VI", "GU", "AS", "MP",
];
const STATE = `(?:${STATES.join("|")})`;

/** A capitalised name word: "Avery", "O'Neil", "Mary-Kate", "AVERY", or an initial "J.". */
const NW = "\\p{Lu}(?:\\.|[\\p{L}'’\\-]{0,24}\\.?)";
const NAME_WORDS = `(${NW}(?:,?${SP}{1,3}${NW}){0,5})`;
const NAME_WORDS_NO_COMMA = `(${NW}(?:${SP}{1,3}${NW}){0,5})`;
const HONORIFIC = `(?:(?:Mr|Ms|Mrs|Mx|Dr|Miss|MR|MS|MRS|MX|DR|MISS)\\.?${SP}{1,3})?`;
const PERSON_ROLE = `(?:${words("Patient", "Member", "Subscriber", "Insured", "Employee", "Dependents", "Dependent", "Policyholder", "Enrollee", "Spouse", "Beneficiary", "Guarantor")}|${v("Policy")}${SP}{1,3}${v("Holder")}|${v("Responsible")}${SP}{1,3}${v("Party")})`;
/** "Name" preceded by one of these words names a plan, carrier or provider, never a person. */
const NOT_PERSON_NAME = [
  "Plan", "Group", "Carrier", "Company", "Employer", "Network", "Product", "Program", "Provider", "Dentist", "Doctor", "Facility", "Office",
  "Practice", "Business", "Clinic", "Document", "File", "Procedure", "Benefit", "Policy", "Insurer", "Payer", "Payor", "Agent", "Broker",
  "Organization", "Sponsor", "Account", "Bank", "Service", "Brand", "Contact", "Representative", "Code", "Field", "User", "Form", "Drug", "Test",
  "Last", "First", "Middle", "Family", "Given", "Sur", "Nick",
];
const NOT_PERSON_LOOKBEHIND = `(?<!(?:${NOT_PERSON_NAME.flatMap((w) => [w, w.toUpperCase(), w.toLowerCase()]).join("|")})${SP}{1,3})`;
const NAME_LABEL =
  `${WS}(?:(?:${v("Primary")}${SP}{1,3})?${PERSON_ROLE}(?:'s|’s)?(?:${SP}{1,3}${v("Name")})?` +
  `|${NOT_PERSON_LOOKBEHIND}${v("Name")}(?:${SP}{1,3}${v("of")}${SP}{1,3}${PERSON_ROLE})?)` +
  `${SP}{0,3}:${SP}{0,3}(?:\\r?\\n${SP}{0,3})?${HONORIFIC}${NAME_WORDS}`;

/** Per-page detection state shared by the checks: where institutional (carrier/office) addresses ended. */
interface PageState { institutionalEnds: number[] }

/** A checked value span; `ignore` = an institutional value: masked so later rules skip it, but not an identifier. */
interface Checked { start: number; end: number; ignore?: boolean }

interface Rule {
  category: IdentifierCategory;
  re: RegExp;
  /** Minimum name words (names only). */
  minWords?: number;
  /** Post-check on the value; return the (possibly trimmed) value span or null to drop. */
  check?: (value: string, page: string, start: number, state: PageState) => Checked | null;
}

const rx = (source: string) => new RegExp(source, "gu");

// Phone numbers: a separated 10-digit number (consistent "." or "-", or "(919) 555-0142"); bare 10 digits only after a phone label.
const AREA = "[2-9][0-9]{2}";
const PHONE_SHAPED =
  `(?:\\+?1[ .\\-]?)?(?:\\(${AREA}\\)${SP}?[0-9]{3}[ .\\-][0-9]{4}|${AREA}(?<sep>[.\\-])[0-9]{3}\\k<sep>[0-9]{4})`;
const PHONE_LABELED = `(?:\\+?1[ .\\-]?)?\\(?${AREA}\\)?[ .\\-]?[0-9]{3}[ .\\-]?[0-9]{4}`;
const PHONE_LABEL = `${WS}(?:${words("Phone", "Telephone", "Tel", "Mobile", "Cell", "Fax", "Home", "Work", "Daytime", "Evening")})(?:${SP}{1,3}(?:${words("Phone", "Number", "No")})\\.?)?${SEP}`;
const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

/** Wording just before a phone number or email that marks it as the carrier's or the dentist's, not the person's. */
const INSTITUTIONAL_CONTEXT =
  /(?:member|customer|provider|client|claims?|dental|benefits?|patient)\s{1,3}(?:services?|care|support|line|center|centre|department|office|unit|relations)|claims?\s{1,3}(?:fax|phone|address|mailing)|call\s{1,3}us|contact\s{1,3}us|write\s{1,3}to\s{1,3}us|email\s{1,3}us|e-mail\s{1,3}us|\bTTY\b|\bTDD\b|\bTTD\b|hearing\s{1,3}impaired|hours\s{1,3}of\s{1,3}operation|monday|weekdays|website|www\./iu;

const ROLE_EMAIL_LOCAL =
  /^(?:info|support|help|service|services|claims?|members?|memberservices|customerservice|customer|contact|noreply|no-reply|admin|benefits?|enroll(?:ment)?|appeals?|dental|care|questions?|privacy|compliance|hr|billing|office|frontdesk|appointments?)$/iu;

/**
 * The clause right before a value: the same line, back to the last field or sentence boundary (". ", ", ", "; ", "|", a tab or a run of
 * spaces between columns), at most 60 characters. "Member Services 1-800-555-0199. Your phone: (910) 555-0142" gives "Your phone: ".
 */
function clauseBefore(page: string, start: number): string {
  const line = lineBefore(page, start, 60);
  let cut = 0;
  for (const m of line.matchAll(/[.,;|•][ \t]+|\t|[ ]{2,}/gu)) cut = (m.index ?? 0) + m[0].length;
  return line.slice(cut);
}

function institutionalBefore(page: string, start: number): boolean {
  return INSTITUTIONAL_CONTEXT.test(clauseBefore(page, start));
}

function phoneCheck(value: string, page: string, start: number) {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  if (TOLL_FREE.has(ten.slice(0, 3))) return null;
  if (/^(\d)\1{9}$/.test(ten)) return null;
  if (institutionalBefore(page, start)) return null;
  return { start, end: start + value.length };
}

const CDT_CODE = /^D\d{4}$/iu;
const DATE_LIKE = /^(?:\d{1,2}-\d{1,2}-\d{2,4}|\d{4}-\d{1,2}-\d{1,2})$/u;

function idCheck(value: string, _page: string, start: number) {
  let v0 = value;
  while (v0.endsWith("-") || v0.endsWith("\n") || v0.endsWith("\r")) v0 = v0.slice(0, -1);
  const compact = v0.replace(/[^A-Za-z0-9]/g, "");
  if (compact.length < 5 || !/\d/.test(compact)) return null;
  if (CDT_CODE.test(compact) || DATE_LIKE.test(v0.replace(/\r?\n/g, ""))) return null;
  return { start, end: start + v0.length };
}

/** Words that end a name (labels, function words, generic roles). Lowercased; compared without a trailing period. */
const NAME_STOP = new Set([
  "member", "members", "subscriber", "subscribers", "patient", "patients", "insured", "employee", "employees", "dependent", "dependents",
  "policyholder", "primary", "name", "names", "id", "i.d", "group", "grp", "number", "no", "num", "date", "dob", "d.o.b", "birth", "born",
  "address", "phone", "tel", "telephone", "mobile", "cell", "fax", "email", "e-mail", "claim", "claims", "account", "acct", "relationship",
  "gender", "sex", "policy", "provider", "dentist", "coverage", "effective", "service", "services", "statement", "page", "card", "ssn",
  "social", "security", "city", "state", "zip", "street", "home", "work", "age", "status", "type", "total", "amount", "amounts", "deductible",
  "maximum", "procedure", "code", "tooth", "paid", "billed", "allowed", "period", "year", "issued", "issue", "information", "identification",
  "certificate", "enrollee", "attn", "attention", "dear", "thank", "thanks", "summary", "details", "detail", "explanation", "notice",
  "a", "an", "any", "the", "this", "that", "these", "those", "each", "every", "all", "your", "you", "our", "we", "us", "my", "his", "her",
  "their", "its", "he", "she", "they", "it", "who", "whom", "which", "means", "mean", "includes", "include", "refers", "is", "are", "be", "as",
  "if", "when", "or", "and", "in", "on", "at", "by", "with", "from", "see", "under", "per", "not", "none", "n/a", "na", "tbd", "unknown",
  "same", "above", "below", "other", "self", "spouse", "child", "children", "son", "daughter", "domestic", "partner", "sir", "madam",
  "customer", "customers", "valued", "friend", "friends", "participant", "participants", "colleague", "colleagues", "doctor", "parent",
  "parents", "guardian", "applicant", "beneficiary", "team", "everyone", "family", "holder", "mr", "ms", "mrs", "mx", "dr", "miss",
  "for", "to", "of", "plan", "plans", "eligible", "eligibility", "benefit", "benefits", "class", "network", "frequency", "limit", "limits",
  "waiting", "copay", "coinsurance", "annual", "lifetime", "orthodontic", "orthodontia", "preventive", "basic", "major", "exclusions",
  "exclusion", "contact", "questions", "call", "visit", "please", "note", "important", "yes", "true", "false", "male", "female",
  "first", "last", "middle", "given", "surname", "legal", "teeth", "employer", "tier", "birthdate", "birthday",
]);

/** Words that mark an organisation (a plan, carrier, employer, office); a name candidate that runs into one is not a person. */
const ORG_WORDS = new Set([
  "dental", "dentistry", "insurance", "company", "co", "inc", "llc", "llp", "ltd", "corp", "corporation", "benefits", "plan", "network",
  "association", "services", "department", "office", "center", "centre", "clinic", "trust", "fund", "county", "university", "college",
  "school", "hospital", "health", "healthcare", "care", "life", "mutual", "financial", "administrators", "administration", "ppo", "hmo",
  "dhmo", "epo", "pos", "delta", "metlife", "cigna", "aetna", "guardian", "humana", "unitedhealthcare", "anthem", "ameritas", "principal",
  "blue", "cross", "shield", "medicaid", "medicare", "fedvip", "opm", "federal", "government", "employees", "retirement",
  "partners", "associates", "practice", "orthodontics", "smiles", "smile", "fictional", "demonstration",
]);

const SUFFIX_WORDS = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** A one-word name ("Dear May,") that is also a calendar word would remove dates the AI needs ("May 1, 2026"); such a name is not taken. */
const CALENDAR_WORDS = new Set([
  ...MONTHS_LONG, ...MONTHS_SHORT, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
].map((w) => w.toLowerCase()));

function nameCheck(minWords: number) {
  return (value: string, page: string, start: number): Checked | null => {
    const re = /[^\s,]+/gu;
    let m: RegExpExecArray | null;
    let kept = 0;
    let end = start;
    let prevEnd = 0;
    while ((m = re.exec(value))) {
      const raw = m[0];
      const initial = /^\p{Lu}\.$/u.test(raw);
      const key = raw.replace(/[.'’]+$/u, "").toLowerCase();
      if (!initial && ORG_WORDS.has(key)) return null;
      if (!initial && NAME_STOP.has(key)) break;
      // A capitalised word directly followed by ":" is the next field's label ("Avery Rowan Employer: ..."), not part of the name.
      if (kept > 0 && /^[ \t]{0,2}:/u.test(page.slice(start + m.index + raw.length, start + m.index + raw.length + 3))) break;
      // A comma is allowed once, right after the first word ("Rowan, Avery"); anywhere else it ends the name.
      if (kept > 1 && value.slice(prevEnd, m.index).includes(",")) break;
      prevEnd = m.index + raw.length;
      kept += 1;
      let e = m.index + raw.length;
      // "Rowan." ends a sentence: the period is not part of the name and nothing after it is (initials and "Jr." keep theirs).
      const sentenceEnd = raw.endsWith(".") && !initial && !SUFFIX_WORDS.has(key);
      if (sentenceEnd) e -= 1;
      end = start + e;
      if (kept === 5 || sentenceEnd) break;
    }
    if (kept < minWords) return null;
    if (kept === 1 && CALENDAR_WORDS.has(value.slice(0, end - start).replace(/[.'’]+$/u, "").toLowerCase())) return null;
    return { start, end };
  };
}

/** The words right before an address on its line name an organisation ("Delta Dental Insurance Company 1130 ...", "Northside Dental Group, 12 Main St"). */
const ORG_BEFORE =
  /(?<![\p{L}\p{N}])(?:Company|Co\.|Insurance|Inc\.?|LLC|L\.L\.C\.|Corporation|Corp\.?|Dental(?:\s{1,3}of(?:\s{1,3}\p{Lu}[\p{L}.]{1,20}){1,3})?|Dentistry|Orthodontics|Benefits|Administrators?|Department|Dept\.?|Office|Clinic|Hospital|University|College|Association|Center|Centre|Group|Plan|Program|Services|Attn:?\s{0,3}Claims|by)[\s,:;–-]{0,4}$/u;

function lineBefore(page: string, start: number, max = 60): string {
  const from = Math.max(0, start - max);
  const chunk = page.slice(from, start);
  const nl = chunk.lastIndexOf("\n");
  return nl >= 0 ? chunk.slice(nl + 1) : chunk;
}

/** The largest value in an ascending list that is ≤ x, or -1 (binary search: a page full of carrier addresses stays linear). */
function lastAtOrBefore(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) { best = sorted[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

function cityCheck(value: string, page: string, start: number, state: PageState): Checked | null {
  // Drop leading words that are labels/function words ("Address Raleigh, NC" keeps "Raleigh, NC ...").
  let s = 0;
  const re = /[^\s,]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    const key = m[0].replace(/[.'’]+$/u, "").toLowerCase();
    if (NAME_STOP.has(key) || ORG_WORDS.has(key)) { s = m.index + m[0].length; continue; }
    break;
  }
  const rest = value.slice(s).replace(/^[\s,]+/u, "");
  const offset = value.length - rest.length;
  if (!/^\p{Lu}/u.test(rest) || /^\p{Lu}{2}\s/u.test(rest) && STATES.includes(rest.slice(0, 2))) return null;
  if (!/,?\s{1,3}[A-Z]{2}\s{1,3}\d{5}/u.test(rest)) return null;
  const s0 = start + offset;
  const end = start + value.length;
  // The city line of an institutional street address, or one written right after an organisation's name or a P.O. Box, is the carrier's.
  const e = lastAtOrBefore(state.institutionalEnds, s0);
  const gapAfterInstitution = e >= 0 && s0 - e <= 4 && /^[\s,]*$/u.test(page.slice(e, s0));
  if (gapAfterInstitution || ORG_BEFORE.test(lineBefore(page, s0)) || /(?:P\.?\s?O\.?|Post\s+Office)\s*Box\b/iu.test(page.slice(Math.max(0, s0 - 40), s0))) {
    return { start: s0, end, ignore: true };
  }
  return { start: s0, end };
}

function streetCheck(value: string, page: string, start: number, state: PageState): Checked | null {
  const end = start + value.length;
  if (ORG_BEFORE.test(lineBefore(page, start))) {
    state.institutionalEnds.push(end);
    return { start, end, ignore: true };
  }
  return { start, end };
}

function dobCheck(value: string, _page: string, start: number) {
  return { start, end: start + value.length };
}

function emailCheck(value: string, page: string, start: number) {
  const local = value.split("@")[0];
  if (ROLE_EMAIL_LOCAL.test(local)) return null;
  if (institutionalBefore(page, start)) return null;
  let end = start + value.length;
  while (end > start && page[end - 1] === ".") end -= 1;
  return { start, end };
}

/** Detection rules in priority order: an earlier rule's value is masked before later rules run, so values never overlap. */
const RULES: Rule[] = [
  { category: "email", re: rx(`(?<![\\p{L}\\p{N}._%+\\-])([A-Za-z0-9._%+\\-]{1,64}@[A-Za-z0-9\\-]{1,63}(?:\\.[A-Za-z0-9\\-]{1,63}){0,7}\\.[A-Za-z]{2,24})${WE}`), check: emailCheck },
  {
    category: "ssn",
    re: rx(`${WS}(?:${v("SSN")}|${v("Social")}${SP}{1,3}${v("Security")}(?:${SP}{1,3}${NUM_KW})?)${SEP}([0-9]{3}[\\- ]?[0-9]{2}[\\- ]?[0-9]{4}|[Xx*•]{3}-?[Xx*•]{2}-?[0-9]{4})(?![0-9\\-])`),
  },
  { category: "ssn", re: rx(`(?<![\\p{L}\\p{N}\\-$.,/])((?!000|666)[0-9]{3}-(?!00)[0-9]{2}-(?!0000)[0-9]{4})(?![0-9\\-])`) },
  {
    category: "dob",
    re: rx(`${WS}(?:${v("DOB")}|D\\.O\\.B\\.?|${v("Date")}${SP}{1,3}${v("of")}${SP}{1,3}${v("Birth")}|${v("Birth")}${SP}{0,3}${v("Date")}|${v("Birthdate")}|(?:${v("Birthday")}|${v("Born")}(?:${SP}{1,3}${v("on")})?)(?=${SP}{0,3}:))(?:${SP}{0,3}\\((?:MM|mm)[/\\-](?:DD|dd)[/\\-](?:YYYY|yyyy|YY|yy)\\))?${SEP}(${DATE})`),
    check: dobCheck,
  },
  { category: "phone", re: rx(`${PHONE_LABEL}(${PHONE_LABELED})(?![0-9])`), check: phoneCheck },
  { category: "phone", re: rx(`(?<![\\p{L}\\p{N}$.,/\\-])(${PHONE_SHAPED})(?![\\p{L}\\p{N}\\-])`), check: phoneCheck },
  {
    category: "group_number",
    re: rx(`${WS}(?:${v("Group")}|${v("Grp")}\\.?)(?:(?:${SP}{1,3}(?:${v("Policy")}|${v("Plan")}))?${SP}{0,3}${NUM_KW}${SEP}|${SP}{0,3}:${SEP})${ID_VALUE}`),
    check: idCheck,
  },
  {
    category: "claim_number",
    re: rx(`${WS}${v("Claim")}${SP}{0,3}(?:${v("Control")}${SP}{1,3})?${NUM_KW}${SEP}${ID_VALUE}`),
    check: idCheck,
  },
  {
    category: "account_number",
    re: rx(`${WS}(?:${v("Account")}|${v("Acct")}\\.?)(?:${SP}{0,3}${NUM_KW}${SEP}|${SP}{0,3}[:#]${SEP})${ID_VALUE}`),
    check: idCheck,
  },
  {
    category: "member_id",
    re: rx(
      `${WS}(?:(?:${words("Member", "Subscriber", "Policyholder", "Insured", "Enrollee", "Patient", "Identification")})${SP}{0,3}${NUM_KW}(?:${SP}{0,3}(?:${v("Number")}|${v("No")}\\.?|#))?` +
      `|${v("Policy")}${SP}{0,3}(?:${v("ID")}|I\\.D\\.?)(?:${SP}{0,3}(?:${v("Number")}|${v("No")}\\.?|#))?` +
      `|(?<!(?:${["Tax", "Plan", "Provider", "NPI", "Employer", "Payer", "Payor", "Federal", "Group", "Claim", "Account", "Network", "Carrier", "Dentist", "Office", "Facility", "Transaction", "Document", "Request", "Confirmation", "Reference", "Tracking"].flatMap((w) => [w, w.toUpperCase(), w.toLowerCase()]).join("|")})${SP}{1,3})(?:ID|I\\.D\\.?|Id)(?:${SP}{0,3}(?:${v("Number")}|${v("No")}\\.?|#))?)` +
      `${SEP}${ID_VALUE}`,
    ),
    check: idCheck,
  },
  {
    category: "address",
    re: rx(
      `(?<![\\p{L}\\p{N}$.,#/\\-])([0-9]{1,6}[A-Za-z]?(?:${SP}{1,3}${DIRECTION}\\.?)?(?:${SP}{1,3}[A-Z0-9][A-Za-z0-9'’.\\-]{0,24}){1,4}${SP}{1,3}${SUFFIX}\\.?` +
      `(?:,?${SP}{1,3}${DIRECTION}\\.?)?(?:,?${SP}{1,3}${UNIT}\\.?${SP}{0,3}#?${SP}{0,2}[A-Za-z0-9\\-]{1,8})?)(?![\\p{L}\\p{N}])`,
    ),
    check: streetCheck,
  },
  {
    category: "address",
    re: rx(`${WS}(\\p{Lu}[\\p{L}.'’\\-]{1,24}(?:${SP}{1,2}\\p{Lu}[\\p{L}.'’\\-]{1,24}){0,3},?${SP}{1,3}${STATE}${SP}{1,3}[0-9]{5}(?:-[0-9]{4})?)(?![\\p{L}\\p{N}\\-])`),
    check: cityCheck,
  },
  { category: "name", re: rx(NAME_LABEL), minWords: 2 },
  { category: "name", re: rx(`${WS}(?:${words("First", "Last", "Given", "Family", "Middle", "Sur")})${SP}{0,3}${v("Name")}${SP}{0,3}:${SP}{0,3}(?:\\r?\\n${SP}{0,3})?${NAME_WORDS_NO_COMMA}`), minWords: 1 },
  { category: "name", re: rx(`${WS}(?:Dear|DEAR|Hello|HELLO)${SP}{1,3}${HONORIFIC}${NAME_WORDS_NO_COMMA}(?=${SP}{0,3}(?:[,:!]|\\r?\\n|$))`), minWords: 1 },
  { category: "name", re: rx(`${WS}(?:Attn|ATTN|Attention|ATTENTION)\\.?${SP}{0,3}:?${SP}{0,3}${HONORIFIC}${NAME_WORDS_NO_COMMA}`), minWords: 2 },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Normalisation, ids, matching
// ---------------------------------------------------------------------------------------------------------------------------------

const COMPACT_CATEGORIES = new Set<IdentifierCategory>(["member_id", "group_number", "claim_number", "account_number", "ssn", "phone"]);
const MAX_KEY_TOKENS = 24;
const MAX_COMPACT_LEN = 24;
const ALNUM_RE = /[\p{L}\p{N}]/u;
const UPPER_RE = /\p{Lu}/u;

/** Letters and digits (any script); a token is a maximal run of them. ASCII is decided without a regex. */
function isAlnum(page: string, i: number): boolean {
  const c = page.charCodeAt(i);
  if (c < 128) return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  return ALNUM_RE.test(page[i]);
}

function isUpperAt(page: string, i: number): boolean {
  const c = page.charCodeAt(i);
  if (c < 128) return c >= 65 && c <= 90;
  return UPPER_RE.test(page[i]);
}

/** A page's tokens as parallel arrays of primitives (no per-token objects): start, end, normalised form, lowercased raw form, capitalised. */
interface Tokens { start: number[]; end: number[]; norm: string[]; lower: string[]; upper: boolean[]; length: number }

function tokenize(page: string): Tokens {
  const t: Tokens = { start: [], end: [], norm: [], lower: [], upper: [], length: 0 };
  const n = page.length;
  let i = 0;
  while (i < n) {
    if (!isAlnum(page, i)) { i += 1; continue; }
    const s0 = i;
    let digits = true;
    while (i < n && isAlnum(page, i)) {
      const c = page.charCodeAt(i);
      if (c < 48 || c > 57) digits = false;
      i += 1;
    }
    const lower = page.slice(s0, i).toLowerCase();
    t.start.push(s0);
    t.end.push(i);
    t.lower.push(lower);
    t.norm.push(digits ? lower.replace(/^0+(?=[0-9])/u, "") : lower);
    t.upper.push(isUpperAt(page, s0));
  }
  t.length = t.start.length;
  return t;
}

function tokensOf(s: string): string[] {
  return tokenize(s).norm;
}

function compactOf(category: IdentifierCategory, value: string): string {
  const c = tokenize(value).lower.join("");
  if (category === "phone" && c.length === 11 && c.startsWith("1")) return c.slice(1);
  return c;
}

/** The normalised value: compact (punctuation-free) for numbers, space-joined tokens for words. */
function normalise(category: IdentifierCategory, value: string): string {
  return COMPACT_CATEGORIES.has(category) ? compactOf(category, value) : tokensOf(value).join(" ");
}

function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function idFor(category: IdentifierCategory, norm: string): string {
  const s = `${category}\u0000${norm}`;
  return `rid-${fnv1a(s, 0x811c9dc5).toString(16).padStart(8, "0")}${fnv1a(s, 0x01234567).toString(16).padStart(8, "0")}`;
}

interface Entry {
  id: string;
  category: IdentifierCategory;
  value: string;
  key: string;
  /** Names detected on the page only match capitalised words; terms the person typed match any case. */
  caseSensitiveName: boolean;
}

interface Span { start: number; end: number; entry: number }

interface TrieNode { next: Map<string, TrieNode>; entry: number }

const newNode = (): TrieNode => ({ next: new Map(), entry: -1 });

/** Gap allowed between the tokens of one word-like identifier: 1–4 non-alphanumerics (spaces, a line break, ", ", ". ", "@"), never a placeholder bracket. */
function wordGapOk(page: string, from: number, to: number): boolean {
  if (to - from < 1 || to - from > 4) return false;
  for (let k = from; k < to; k++) {
    const c = page.charCodeAt(k);
    if (c === 91 || c === 93) return false;
  }
  return true;
}

/** Gap allowed inside a number-like identifier: up to 3 of space, tab, line break, "-", ".", "(", ")", "/", "#" (never "," or "$"). */
function numGapOk(page: string, from: number, to: number): boolean {
  if (to - from < 1 || to - from > 3) return false;
  for (let k = from; k < to; k++) {
    const c = page.charCodeAt(k);
    // space, tab, LF, CR, no-break space, "#", "(", ")", "-", ".", "/"
    if (!(c === 32 || c === 9 || c === 10 || c === 13 || c === 160 || c === 35 || c === 40 || c === 41 || c === 45 || c === 46 || c === 47)) return false;
  }
  return true;
}

const isDigitAt = (page: string, i: number) => {
  const c = page.charCodeAt(i);
  return c >= 48 && c <= 57;
};
/** A number-like match never starts inside an amount: not after "$", and not after the "," or "." of a grouped number ("1,500.00"). */
function numberStartOk(page: string, s: number): boolean {
  const p = page.charCodeAt(s - 1);
  if (p === 36) return false;
  return !((p === 44 || p === 46) && isDigitAt(page, s - 2));
}
/** ...and never ends before "%" or before the "," or "." of a longer number. */
function numberEndOk(page: string, e: number): boolean {
  const c = page.charCodeAt(e);
  if (c === 37) return false;
  return !((c === 44 || c === 46) && isDigitAt(page, e + 1));
}

class Matcher {
  private trie = newNode();
  private compact = new Map<string, number>();
  private maxCompact = 0;
  private entries: Entry[];
  constructor(entries: Entry[]) {
    this.entries = entries;
    entries.forEach((e, i) => {
      if (COMPACT_CATEGORIES.has(e.category)) {
        if (e.key.length === 0) return;
        if (!this.compact.has(e.key)) this.compact.set(e.key, i);
        this.maxCompact = Math.min(MAX_COMPACT_LEN, Math.max(this.maxCompact, e.key.length));
      } else {
        const toks = e.key.split(" ").filter(Boolean).slice(0, MAX_KEY_TOKENS);
        if (toks.length === 0) return;
        let node = this.trie;
        for (const t of toks) {
          let nx = node.next.get(t);
          if (!nx) { nx = newNode(); node.next.set(t, nx); }
          node = nx;
        }
        if (node.entry < 0) node.entry = i;
      }
    });
  }

  /** Every match on one page, overlaps resolved (earliest start, then longest). Linear: each token walks a bounded distance. */
  spans(page: string): Span[] {
    const tk = tokenize(page);
    const { start, end, norm, lower, upper } = tk;
    const n = tk.length;
    const hasWords = this.trie.next.size > 0;
    const hasNumbers = this.compact.size > 0;
    const found: Span[] = [];
    for (let i = 0; i < n; i++) {
      // word-like identifiers (names, addresses, dates of birth, emails, added terms)
      if (hasWords) {
        let node: TrieNode | undefined = this.trie;
        let bestEnd = -1;
        let bestEntry = -1;
        let allUpper = true;
        for (let j = i; j < n && j - i < MAX_KEY_TOKENS; j++) {
          if (j > i && !wordGapOk(page, end[j - 1], start[j])) break;
          node = node.next.get(norm[j]);
          if (!node) break;
          allUpper = allUpper && upper[j];
          if (node.entry >= 0 && (allUpper || !this.entries[node.entry].caseSensitiveName)) {
            bestEnd = end[j];
            bestEntry = node.entry;
          }
        }
        if (bestEntry >= 0) found.push({ start: start[i], end: bestEnd, entry: bestEntry });
      }
      // number-like identifiers, punctuation-insensitive; never a dollar amount or a percentage
      if (hasNumbers && numberStartOk(page, start[i])) {
        let acc = "";
        let bestEnd = -1;
        let bestEntry = -1;
        for (let j = i; j < n; j++) {
          if (j > i && !numGapOk(page, end[j - 1], start[j])) break;
          acc += lower[j];
          if (acc.length > this.maxCompact) break;
          const hit = this.compact.get(acc);
          if (hit !== undefined && numberEndOk(page, end[j])) {
            bestEnd = end[j];
            bestEntry = hit;
          }
        }
        if (bestEntry >= 0) found.push(this.widenPhone(page, { start: start[i], end: bestEnd, entry: bestEntry }));
      }
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const out: Span[] = [];
    let last = -1;
    for (const s of found) {
      if (s.start >= last) { out.push(s); last = s.end; }
    }
    return out;
  }

  /** "(919) 555-0142" and "+1 919 555 0142": the opening parenthesis and the country code go with the number. */
  private widenPhone(page: string, s: Span): Span {
    if (this.entries[s.entry].category !== "phone") return s;
    let start = s.start;
    if (page[start - 1] === "(") start -= 1;
    const pre = page.slice(Math.max(0, start - 3), start);
    const m = /(?:\+?1[ .-]?)$/u.exec(pre);
    if (m && !(start - m[0].length - 1 >= 0 && isAlnum(page, start - m[0].length - 1))) start -= m[0].length;
    return { ...s, start };
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------------------------------------------------------------

interface Candidate { category: IdentifierCategory; value: string; page: number; start: number; priority: number }

function cleanValue(category: IdentifierCategory, raw: string): string {
  if (COMPACT_CATEGORIES.has(category)) return raw.replace(/-?\r?\n/gu, (m) => (m.startsWith("-") ? "-" : "")).trim();
  return raw.replace(/\s+/gu, " ").trim();
}

function detectOnPage(page: string, pageIndex: number, out: Candidate[]) {
  let working = page;
  const state: PageState = { institutionalEnds: [] };
  RULES.forEach((rule, priority) => {
    rule.re.lastIndex = 0;
    const masks: [number, number][] = [];
    for (const m of working.matchAll(rule.re)) {
      const value = pickValue(m);
      if (!value) continue;
      // Every rule ends with its value group (only zero-width assertions follow it).
      const vStart = (m.index ?? 0) + m[0].length - value.length;
      const check: NonNullable<Rule["check"]> = rule.check ?? (rule.category === "name" ? nameCheck(rule.minWords ?? 2) : (_v: string, _p: string, s: number): Checked => ({ start: s, end: s + value.length }));
      const span = check(value, working, vStart, state);
      if (!span || span.end <= span.start) continue;
      if (span.ignore) {
        masks.push([span.start, span.end]);
        continue;
      }
      const printed = page.slice(span.start, span.end);
      const cleaned = cleanValue(rule.category, printed);
      if (cleaned.length < 2) continue;
      out.push({ category: rule.category, value: cleaned, page: pageIndex, start: span.start, priority });
      masks.push([span.start, span.end]);
    }
    if (masks.length) working = mask(working, masks);
  });
}

/** The value is the last capturing group that matched (phone patterns carry an inner back-reference group). */
function pickValue(m: RegExpMatchArray): string | undefined {
  for (let i = m.length - 1; i >= 1; i--) {
    const g = m[i];
    if (g !== undefined && g.length > 1) return g;
  }
  return undefined;
}

function mask(s: string, ranges: [number, number][]): string {
  const parts: string[] = [];
  let at = 0;
  for (const [a, b] of ranges) {
    if (a < at) continue;
    parts.push(s.slice(at, a), s.slice(a, b).replace(/[^\n]/gu, " "));
    at = b;
  }
  parts.push(s.slice(at));
  return parts.join("");
}

function entriesFrom(candidates: Candidate[]): Entry[] {
  const byKey = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = normalise(c.category, c.value);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || c.priority < prev.priority) byKey.set(key, c);
  }
  return [...byKey.entries()].map(([key, c]) => ({
    id: idFor(c.category, key), category: c.category, value: c.value, key, caseSensitiveName: c.category === "name",
  }));
}

interface Applied { pages: string[]; occurrences: number[]; pagesOf: number[][]; first: number[]; total: number }

function run(pages: readonly string[], entries: Entry[], replace: boolean): Applied {
  const matcher = new Matcher(entries);
  const occurrences = entries.map(() => 0);
  const pagesOf: Set<number>[] = entries.map(() => new Set());
  const first = entries.map(() => Number.POSITIVE_INFINITY);
  const outPages: string[] = [];
  let total = 0;
  pages.forEach((page, p) => {
    const spans = entries.length ? matcher.spans(page) : [];
    const parts: string[] = [];
    let at = 0;
    for (const s of spans) {
      occurrences[s.entry] += 1;
      pagesOf[s.entry].add(p + 1);
      first[s.entry] = Math.min(first[s.entry], p * 1e9 + s.start);
      total += 1;
      if (replace) {
        parts.push(page.slice(at, s.start), placeholder(entries[s.entry].category));
        at = s.end;
      }
    }
    if (replace) {
      parts.push(page.slice(at));
      outPages.push(parts.join(""));
    }
  });
  return { pages: outPages, occurrences, pagesOf: pagesOf.map((s) => [...s].sort((a, b) => a - b)), first, total };
}

function toFound(e: Entry, occurrences: number, pages: number[]): FoundIdentifier {
  return { id: e.id, category: e.category, value: e.value, occurrences, pages };
}

/**
 * Find the personal identifiers in the page texts (one string per page, ideally with its line breaks; see `pageTextFromItems`).
 * Returns distinct identifiers in reading order, each with how many places it occurs and on which pages.
 */
export function detectIdentifiers(pages: string[]): FoundIdentifier[] {
  const candidates: Candidate[] = [];
  pages.forEach((page, i) => detectOnPage(typeof page === "string" ? page : "", i, candidates));
  const entries = entriesFrom(candidates);
  const applied = run(pages.map((p) => (typeof p === "string" ? p : "")), entries, false);
  return entries
    .map((e, i) => ({ e, i }))
    .filter(({ i }) => applied.occurrences[i] > 0)
    .sort((a, b) => applied.first[a.i] - applied.first[b.i])
    .map(({ e, i }) => toFound(e, applied.occurrences[i], applied.pagesOf[i]));
}

// Full-string shapes used to classify a term the person typed ("unless they match a pattern").
const FULL = {
  email: /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,7}\.[A-Za-z]{2,24}$/u,
  ssn: /^[0-9]{3}-[0-9]{2}-[0-9]{4}$/u,
  phone: new RegExp(`^${PHONE_LABELED}$`, "u"),
  dob: new RegExp(`^${DATE}$`, "u"),
  idLike: /^(?=[A-Za-z0-9 -]*[0-9])[A-Za-z0-9](?:[A-Za-z0-9]|[ -](?=[A-Za-z0-9])){4,23}$/u,
};
const STREET_FULL = new RegExp(`^[0-9]{1,6}[A-Za-z]?(?:\\s{1,3}\\S{1,25}){1,6}\\s{1,3}${SUFFIX}\\.?(?:,?\\s.{1,20})?$`, "iu");
const CITY_FULL = new RegExp(`^\\p{L}[\\p{L}.'’ -]{1,60},?\\s{1,3}${STATE}\\s{1,3}[0-9]{5}(?:-[0-9]{4})?$`, "u");

/** The category of a term the person added: a recognisable shape keeps its category; anything else counts as a name. */
export function classifyTerm(term: string): IdentifierCategory {
  const t = term.replace(/\s+/gu, " ").trim();
  if (FULL.email.test(t)) return "email";
  if (FULL.ssn.test(t)) return "ssn";
  if (FULL.dob.test(t)) return "dob";
  if (FULL.phone.test(t) && t.replace(/\D/gu, "").length >= 10) return "phone";
  if (STREET_FULL.test(t) || CITY_FULL.test(t)) return "address";
  if (FULL.idLike.test(t)) return "member_id";
  return "name";
}

/**
 * Remove every identifier except the ones in `keep` (ids the person marked "Keep in text"), plus every added term.
 * A term that equals a detected identifier (same normalised value) removes that identifier even if it was kept; a term with no letters or
 * digits, shorter than 2 or longer than 64 characters is ignored. Pure: the same inputs always give the same result.
 */
export function applyRedaction(pages: string[], found: FoundIdentifier[], keep: ReadonlySet<string>, extraTerms: readonly string[]): RedactionResult {
  const texts = pages.map((p) => (typeof p === "string" ? p : ""));
  const known = new Map<string, Entry>();
  /** Every known identifier by its letters and digits only, so a typed "hb26 4471 902" finds the detected "HB26-4471-902". */
  const byCompact = new Map<string, Entry>();
  const order: Entry[] = [];
  const forced = new Set<string>();
  const remember = (e: Entry) => {
    known.set(`${COMPACT_CATEGORIES.has(e.category) ? "c" : "w"}:${e.key}`, e);
    const c = compactOf(e.category, e.value);
    if (c && !byCompact.has(c)) byCompact.set(c, e);
  };
  for (const f of found) {
    const key = normalise(f.category, f.value);
    if (!key || known.has(`${COMPACT_CATEGORIES.has(f.category) ? "c" : "w"}:${key}`)) continue;
    const e: Entry = { id: f.id, category: f.category, value: f.value, key, caseSensitiveName: f.category === "name" };
    remember(e);
    order.push(e);
  }
  const added: Entry[] = [];
  for (const raw of extraTerms) {
    if (typeof raw !== "string") continue;
    const term = raw.replace(/\s+/gu, " ").trim();
    if (term.length < 2 || term.length > 64 || !/[\p{L}\p{N}]/u.test(term)) continue;
    const category = classifyTerm(term);
    const key = normalise(category, term);
    if (!key) continue;
    const slot = `${COMPACT_CATEGORIES.has(category) ? "c" : "w"}:${key}`;
    const existing = known.get(slot) ?? byCompact.get(compactOf(category, term));
    if (existing) {
      forced.add(existing.id);
      continue;
    }
    const e: Entry = { id: idFor(category, key), category, value: term, key, caseSensitiveName: false };
    remember(e);
    added.push(e);
  }
  const all = [...order, ...added];
  const active = all.filter((e) => forced.has(e.id) || !keep.has(e.id));
  const applied = run(texts, active, true);
  const activeIndex = new Map(active.map((e, i) => [e.id, i]));
  const foundById = new Map(found.map((f) => [f.id, f]));
  const identifiers = all.map((e) => {
    const i = activeIndex.get(e.id);
    if (i !== undefined) return toFound(e, applied.occurrences[i], applied.pagesOf[i]);
    const f = foundById.get(e.id);
    return toFound(e, f?.occurrences ?? 0, f?.pages ?? []);
  });
  const removed = identifiers.filter((f) => activeIndex.has(f.id) && f.occurrences > 0);
  const byCategory: Partial<Record<IdentifierCategory, number>> = {};
  for (const r of removed) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  return { pages: applied.pages, identifiers, removed, total: removed.length, byCategory, occurrences: applied.total };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------------------------------------------------------------

const DOT = "•";
const STREET_WORDS = new Set([...STREET_SUFFIXES, "Apt", "Apartment", "Suite", "Ste", "Unit"].map((s) => s.toLowerCase()));

const maskWord = (w: string) => {
  const chars = [...w];
  return chars.length <= 1 ? chars.join("") : chars[0] + DOT.repeat(chars.length - 1);
};

/** A masked form for the review list: "A•••• R••••", "•••• 1902", "••••@example.com", "••/••/••••". */
export function maskValue(c: IdentifierCategory, v: string): string {
  const value = v.replace(/\s+/gu, " ").trim();
  switch (c) {
    case "name":
      return value.split(" ").map((w) => w.replace(/[\p{L}][\p{L}'’-]*/gu, (m) => maskWord(m))).join(" ");
    case "email": {
      const at = value.lastIndexOf("@");
      return at > 0 ? `${DOT.repeat(4)}${value.slice(at)}` : DOT.repeat(4);
    }
    case "dob":
      return value.replace(/[\p{L}\p{N}]/gu, DOT);
    case "address":
      return value.replace(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu, (w) => {
        const bare = w.replace(/\.$/u, "");
        if (STREET_WORDS.has(bare.toLowerCase()) || STATES.includes(bare)) return w;
        if (/^[0-9]+$/u.test(bare)) return DOT.repeat(bare.length) + w.slice(bare.length);
        return maskWord(w);
      });
    default: {
      const compact = value.replace(/[^\p{L}\p{N}]/gu, "");
      return compact.length <= 4 ? DOT.repeat(4) : `${DOT.repeat(4)} ${compact.slice(-4)}`;
    }
  }
}

/**
 * Page text from pdf.js `getTextContent().items`, keeping line breaks (items with `hasEOL` end a line). The detector reads label/value pairs
 * line by line ("Member: Avery Rowan" ends at the line end), so this gives it better text than a whitespace-collapsed page.
 */
export function pageTextFromItems(items: ReadonlyArray<{ str?: string; hasEOL?: boolean } | object>): string {
  let out = "";
  for (const it of items) {
    const item = it as { str?: unknown; hasEOL?: unknown };
    const s = typeof item.str === "string" ? item.str : "";
    if (s) {
      if (out && !out.endsWith("\n") && !out.endsWith(" ") && !s.startsWith(" ")) out += " ";
      out += s;
    }
    if (item.hasEOL === true) out = out.replace(/[ \t]+$/u, "") + "\n";
  }
  return out.replace(/[ \t]{2,}/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}
