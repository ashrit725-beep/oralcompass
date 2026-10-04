/**
 * On-device identifier detection and redaction (client redaction design point 1). THIS FILE IS THE UI BRANCH'S CONTRACT STUB: the
 * detector branch (red/detector) owns the real implementation and replaces this file whole at integration. Only the exported API below
 * is relied on by the UI (components/upload/*, components/plan/TreatmentPlanReader.tsx, lib/upload.ts); keep every export's shape.
 *
 * Every pattern is linear-time (bounded repetitions, no nested open-ended runs), mirroring api/app/redaction.py (security-1). What the AI
 * needs is never matched: CDT codes, dollar amounts, percentages, plan dates without a birth label, frequency limits, waiting periods,
 * tooth numbers, carrier names and toll-free numbers. The count is DISTINCT identifiers (normalised value); occurrences are separate.
 */
export type IdentifierCategory = "name" | "address" | "member_id" | "group_number" | "claim_number" | "account_number" | "ssn" | "dob" | "phone" | "email";

export interface FoundIdentifier { id: string; category: IdentifierCategory; value: string; occurrences: number; pages: number[] }

export interface RedactionResult {
  pages: string[];
  identifiers: FoundIdentifier[];
  removed: FoundIdentifier[];
  total: number;
  byCategory: Partial<Record<IdentifierCategory, number>>;
  occurrences: number;
}

export const REDACTION_VERSION = 1;

const PLACEHOLDER: Record<IdentifierCategory, string> = {
  name: "[name removed]", address: "[address removed]", member_id: "[member ID removed]", group_number: "[group number removed]",
  claim_number: "[claim number removed]", account_number: "[account number removed]", ssn: "[SSN removed]", dob: "[date of birth removed]",
  phone: "[phone removed]", email: "[email removed]",
};

export function placeholder(c: IdentifierCategory): string {
  return PLACEHOLDER[c];
}

const COMPACT: ReadonlySet<IdentifierCategory> = new Set(["member_id", "group_number", "claim_number", "account_number", "ssn", "phone"]);
const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);
const STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
// words that end a captured name (a label or plan vocabulary), so "Member Services" or "Sam Rivera Member ID" never become names
const NAME_STOP = new Set(["member", "subscriber", "patient", "insured", "employee", "dependent", "policyholder", "primary", "name", "id", "group", "plan",
  "dental", "services", "service", "number", "date", "of", "birth", "dob", "address", "phone", "email", "claim", "account", "relationship", "coverage", "benefits",
  "statement", "the", "and", "self", "spouse", "child", "page", "effective", "card", "network", "in", "out"]);

function normalise(c: IdentifierCategory, v: string): string {
  const s = v.toLowerCase().replace(/\s+/g, " ").trim();
  return COMPACT.has(c) ? s.replace(/[^a-z0-9]/g, "") : s.replace(/[.,;:]+$/g, "");
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One value's occurrence pattern: case-insensitive; words separated by any whitespace (pdf.js line breaks); IDs and phones by any
 *  punctuation spacing. Bounded classes only, so the pattern stays linear. */
function valuePattern(c: IdentifierCategory, value: string): RegExp | null {
  if (COMPACT.has(c)) {
    const chars = value.replace(/[^A-Za-z0-9]/g, "");
    if (chars.length < 2) return null;
    return new RegExp(`(?<![A-Za-z0-9])${[...chars].map(escapeRe).join("[\\s().\\-]{0,3}")}(?![A-Za-z0-9])`, "gi");
  }
  const words = value.trim().split(/\s+/).filter(Boolean).map(escapeRe);
  if (!words.length || value.trim().length < 2) return null;
  return new RegExp(`(?<![\\w@])${words.join("\\s{1,4}")}(?![\\w@])`, "gi");
}

type Raw = { category: IdentifierCategory; value: string };

const DIGIT = /\d/;
const ID_VALUE = "([A-Z0-9][A-Z0-9-]{3,19})";
const PATTERNS: { category: IdentifierCategory; re: RegExp; group: number; accept?: (v: string, m: RegExpExecArray) => boolean }[] = [
  { category: "email", re: /(?<![\w.+-])[\w.+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,8}/g, group: 0 },
  { category: "ssn", re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, group: 0 },
  { category: "ssn", re: /\b(?:SSN|Social Security(?: No\.?| Number)?)[ \t]{0,4}[:#]?[ \t]{0,4}(\d{9}|\d{3}[ -]\d{2}[ -]\d{4})(?!\d)/gi, group: 1 },
  { category: "dob", re: /\b(?:DOB|D\.O\.B\.|Date of birth|Birth ?date)[ \t]{0,4}[:\-]?[ \t]{0,4}(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|[A-Z][a-z]{2,8}\.?[ \t]\d{1,2},?[ \t]\d{4})/gi, group: 1 },
  { category: "member_id", re: new RegExp(`\\b(?:Member|Subscriber|Identification|Policy)[ \\t]{0,4}(?:ID|No\\.?|Number|#)[ \\t]{0,4}[:#]?[ \\t]{0,4}${ID_VALUE}\\b`, "gi"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "member_id", re: new RegExp(`(?<![A-Za-z])ID[ \\t]{0,4}(?:No\\.?|Number|#)?[ \\t]{0,4}[:#][ \\t]{0,4}${ID_VALUE}\\b`, "g"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "group_number", re: new RegExp(`\\b(?:Group|Grp)[ \\t]{0,4}(?:No\\.?|Number|#|ID)?[ \\t]{0,4}[:#][ \\t]{0,4}${ID_VALUE}\\b`, "gi"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "group_number", re: new RegExp(`\\b(?:Group|Grp)[ \\t]{1,4}(?:No\\.?|Number|#)[ \\t]{0,4}${ID_VALUE}\\b`, "gi"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "claim_number", re: new RegExp(`\\bClaim[ \\t]{0,4}(?:No\\.?|Number|#|ID)[ \\t]{0,4}[:#]?[ \\t]{0,4}${ID_VALUE}\\b`, "gi"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "account_number", re: new RegExp(`\\b(?:Account|Acct\\.?)[ \\t]{0,4}(?:No\\.?|Number|#)?[ \\t]{0,4}[:#][ \\t]{0,4}${ID_VALUE}\\b`, "gi"), group: 1, accept: (v) => DIGIT.test(v) },
  { category: "phone", re: /(?<![\d-])(?:\+?1[ .\-]?)?\(?(\d{3})\)?[ .\-]?\d{3}[ .\-]\d{4}(?![\d-])/g, group: 0, accept: (_v, m) => !TOLL_FREE.has(m[1]) },
  { category: "address", re: /\b\d{1,6}[ \t]{1,3}(?:[A-Z][A-Za-z0-9.'\-]{0,30}[ \t]{1,3}){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Cir|Circle)\b\.?(?:,?[ \t]{1,3}(?:Apt|Suite|Ste|Unit|#)\.?[ \t]{0,2}[A-Z0-9\-]{1,8})?/g, group: 0 },
  { category: "address", re: /\b[A-Z][A-Za-z.'\-]{1,30}(?:[ \t][A-Z][A-Za-z.'\-]{1,30}){0,3},[ \t]{0,3}([A-Z]{2})[ \t]{1,3}\d{5}(?:-\d{4})?\b/g, group: 0, accept: (_v, m) => STATES.has(m[1]) },
];

const NAME_LABEL = /\b(?:Patient|Member|Subscriber|Insured|Employee|Dependent|Policyholder|Primary|Name|Dear|Attn)(?:[ \t]{1,3}(?:name|member))?[ \t]{0,3}[:,][ \t]{0,3}((?:[A-Z][A-Za-z'’\-]{0,30}\.?[ \t]{1,3}){1,4}[A-Z][A-Za-z'’\-]{0,30})/g;
const NAME_DEAR = /\b(?:Dear|Attn\.?)[ \t]{1,3}((?:[A-Z][A-Za-z'’\-]{0,30}\.?[ \t]{1,3}){1,4}[A-Z][A-Za-z'’\-]{0,30})/g;

function nameFrom(raw: string): string | null {
  const words = raw.trim().split(/[ \t]+/);
  const kept: string[] = [];
  for (const w of words) {
    if (NAME_STOP.has(w.replace(/[.'’]/g, "").toLowerCase())) break;
    kept.push(w);
  }
  return kept.length >= 2 && kept.length <= 5 ? kept.join(" ") : null;
}

function scan(pages: string[]): Raw[] {
  const out: Raw[] = [];
  for (const text of pages) {
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      for (let m = p.re.exec(text); m; m = p.re.exec(text)) {
        const v = (m[p.group] ?? "").trim();
        if (v && (!p.accept || p.accept(v, m))) out.push({ category: p.category, value: v });
        if (m[0].length === 0) p.re.lastIndex++;
      }
    }
    for (const re of [NAME_LABEL, NAME_DEAR]) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const n = nameFrom(m[1]);
        if (n) out.push({ category: "name", value: n });
      }
    }
  }
  return out;
}

function locate(pages: string[], c: IdentifierCategory, value: string): { occurrences: number; pages: number[] } {
  const re = valuePattern(c, value);
  if (!re) return { occurrences: 0, pages: [] };
  let occurrences = 0;
  const on: number[] = [];
  pages.forEach((text, i) => {
    const n = text.match(re)?.length ?? 0;
    if (n) { occurrences += n; on.push(i + 1); }
  });
  return { occurrences, pages: on };
}

export function detectIdentifiers(pages: string[]): FoundIdentifier[] {
  const seen = new Map<string, FoundIdentifier>();
  for (const r of scan(pages)) {
    const key = `${r.category}|${normalise(r.category, r.value)}`;
    if (seen.has(key)) continue;
    const where = locate(pages, r.category, r.value);
    if (!where.occurrences) continue;
    seen.set(key, { id: hash(key), category: r.category, value: r.value, ...where });
  }
  return [...seen.values()];
}

function matchesPattern(term: string): IdentifierCategory | null {
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const m = p.re.exec(term);
    if (m && m[p.group]?.trim() === term.trim() && (!p.accept || p.accept(term, m))) return p.category;
  }
  return null;
}

export function applyRedaction(pages: string[], found: FoundIdentifier[], keep: ReadonlySet<string>, extraTerms: readonly string[]): RedactionResult {
  // a term equal to a found value (loosely) removes that identifier even when it was switched to "Keep in text"
  const forced = new Set(found.filter((f) => extraTerms.some((t) => normalise("phone", t) !== "" && normalise("phone", t) === normalise("phone", f.value))).map((f) => f.id));
  const removed: FoundIdentifier[] = found.filter((f) => forced.has(f.id) || !keep.has(f.id));
  const loose = new Set(found.map((f) => normalise("phone", f.value)));
  for (const t of extraTerms) {
    const term = t.trim();
    if (term.length < 2 || term.length > 64) continue;
    const category = matchesPattern(term) ?? "name";
    const key = `${category}|${normalise(category, term)}`;
    if (loose.has(normalise("phone", term))) continue;
    const where = locate(pages, category, term);
    if (!where.occurrences) continue;
    loose.add(normalise("phone", term));
    removed.push({ id: hash(key), category, value: term, ...where });
  }
  // longer values first, so a name inside a longer address line is replaced as part of that line
  const order = [...removed].sort((a, b) => b.value.length - a.value.length);
  let occurrences = 0;
  const out = pages.map((text) => {
    let t = text;
    for (const f of order) {
      const re = valuePattern(f.category, f.value);
      if (!re) continue;
      t = t.replace(re, () => { occurrences++; return placeholder(f.category); });
    }
    return t;
  });
  const byCategory: Partial<Record<IdentifierCategory, number>> = {};
  for (const f of removed) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  return { pages: out, identifiers: found, removed, total: removed.length, byCategory, occurrences };
}

function maskWord(w: string): string {
  return w.length <= 1 ? "•" : w[0] + "•".repeat(Math.min(w.length - 1, 8));
}

export function maskValue(c: IdentifierCategory, v: string): string {
  const s = v.trim();
  switch (c) {
    case "email": { const at = s.indexOf("@"); return at > 0 ? `••••${s.slice(at)}` : "••••"; }
    case "dob": return "••/••/••••";
    case "name": case "address": return s.split(/\s+/).map(maskWord).join(" ");
    default: {
      const tail = s.replace(/[^A-Za-z0-9]/g, "").slice(-4);
      return tail.length >= 4 ? `•••• ${tail}` : "••••";
    }
  }
}
