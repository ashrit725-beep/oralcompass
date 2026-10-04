/**
 * View helpers for the on-device redaction review (components/upload/RedactionSummary.tsx). Pure and tested (redaction-view.test.ts).
 * They depend only on the contract exports of lib/redact.ts (`placeholder`, `maskValue`, the types), so they keep working when the
 * detector branch replaces the stub.
 */
import { placeholder, type FoundIdentifier, type IdentifierCategory, type RedactionResult } from "./redact";

/** The fixed display order of categories (chips and list). */
export const CATEGORY_ORDER: readonly IdentifierCategory[] = ["name", "address", "member_id", "group_number", "claim_number", "account_number", "ssn", "dob", "phone", "email"];

/** 1-based page numbers → "1–3, 5" (an en dash for a run of three or more; "1, 2" for a pair). */
export function pageRanges(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) out.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k++) out.push(String(sorted[k]));
    i = j + 1;
  }
  return out.join(", ");
}

/** The characters a masked value still shows ("A••• R•••••" → "A R"), for the screen-reader "masked" description. */
export function maskedVisible(masked: string): string {
  return masked.replace(/[••*]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Categories present in a result, in display order, with their distinct counts. */
export function categoryCounts(byCategory: RedactionResult["byCategory"]): { category: IdentifierCategory; count: number }[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const count = byCategory[category] ?? 0;
    return count > 0 ? [{ category, count }] : [];
  });
}

/** Found identifiers sorted for the list: category order, then first page, then value. */
export function sortIdentifiers(found: readonly FoundIdentifier[]): FoundIdentifier[] {
  const rank = (c: IdentifierCategory) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i; };
  return [...found].sort((a, b) => rank(a.category) - rank(b.category) || (a.pages[0] ?? 0) - (b.pages[0] ?? 0) || a.value.localeCompare(b.value));
}

export type Segment = { text: string } | { token: IdentifierCategory; text: string };

const TOKEN_RE = (() => {
  const alternatives = CATEGORY_ORDER.map((c) => placeholder(c).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(alternatives.join("|"), "g");
})();
const BY_PLACEHOLDER = new Map(CATEGORY_ORDER.map((c) => [placeholder(c), c]));

/** Split redacted text into plain runs and placeholder tokens ("[name removed]" → a token of category "name", text "name removed"). */
export function tokenize(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m; m = TOKEN_RE.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const category = BY_PLACEHOLDER.get(m[0]);
    if (category) out.push({ token: category, text: m[0].replace(/^\[|\]$/g, "") });
    else out.push({ text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The pages shown in the preview within a character budget: every page up to the budget, the last one cut at a line end when possible. */
export function previewPages(pages: readonly string[], budget: number): { pages: { page: number; text: string }[]; shown: number; total: number } {
  const total = pages.reduce((n, p) => n + p.length, 0);
  const out: { page: number; text: string }[] = [];
  let shown = 0;
  for (let i = 0; i < pages.length && shown < budget; i++) {
    const room = budget - shown;
    let text = pages[i];
    if (text.length > room) {
      const cut = text.lastIndexOf("\n", room);
      text = text.slice(0, cut > room * 0.5 ? cut : room);
    }
    if (!text.trim()) continue;
    out.push({ page: i + 1, text });
    shown += text.length;
  }
  return { pages: out, shown: Math.min(shown, total), total };
}

/** Where one of the person's own terms landed in a result: its occurrences, or null when it is not in the text. */
export function termOccurrences(result: Pick<RedactionResult, "removed">, term: string): number | null {
  // compared without case, spacing or punctuation, so "919-555-0142" finds the phone the detector printed as "(919) 555-0142"
  const loose = (v: string) => v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const t = loose(term);
  if (!t) return null;
  const hit = result.removed.find((f) => loose(f.value) === t);
  return hit && hit.occurrences > 0 ? hit.occurrences : null;
}
