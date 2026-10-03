import type { Cite, Clause, PlanFixture, Step, Stitch } from "./types";

const RULE_BY_FIELD: [RegExp, string, string][] = [
  [/^deductible_individual_out/, "D", "deductible"], [/^deductible_individual|^deductible_family|^deductible_waiver/, "D", "deductible"],
  [/^annual_max/, "M", "annual_max"], [/^benefit_year_start_month/, "Y", "dos"], [/^classes\[\d+\]\.plan_share/, "CO", "coinsurance"], [/^classes\[\d+\]\.cite/, "CLS", "coinsurance"],
  [/^class_of/, "CO", "coinsurance"], [/^allowed_amounts/, "N", "allowed"], [/^alternate_benefit/, "AB", "alternate_benefit"], [/^waiting_months/, "W", "waiting"],
  [/^frequency/, "F", "frequency"], [/^excluded/, "X", "exclusion"], [/^oon_rule/, "N", "network"], [/^dos_rule/, "DOS", "dos"], [/^premium_monthly/, "P", "premium"],
  [/^procedure_codes/, "CODE", "coinsurance"], [/^unsupported_rules/, "INFO", "exclusion"], [/^catalog/, "INFO", "plan"], [/^conflicts/, "CONFLICT", "plan"],
];
function classify(field: string): { rule: string; topic: string } {
  for (const [re, rule, topic] of RULE_BY_FIELD) if (re.test(field)) return { rule, topic };
  return { rule: "INFO", topic: "plan" };
}

/** Build stitches from the API's numbered clause list (all documents behind a preset; numbering is per document in page order). */
export function stitchesFromClauses(clauses: Clause[]): Stitch[] {
  const map = new Map<string, Stitch>();
  const counters = new Map<string, number>();
  const sorted = [...clauses].sort((a, b) => a.doc.localeCompare(b.doc) || (a.page ?? 0) - (b.page ?? 0) || a.quote.localeCompare(b.quote));
  for (const c of sorted) {
    const key = `${c.doc}|${c.page}|${c.quote}`;
    const { rule, topic } = classify(c.field);
    const existing = map.get(key);
    if (existing) { if (!existing.ruleCodes.includes(rule)) existing.ruleCodes.push(rule); continue; }
    const n = (counters.get(c.doc) ?? 0) + 1; counters.set(c.doc, n);
    map.set(key, { id: `${c.doc}#${n}`, doc: c.doc, n, page: c.page, quote: c.quote, topic, ruleCodes: [rule], pageNote: c.page_note ?? undefined });
  }
  return [...map.values()];
}

/** Build the stitch list for one plan document from the fixture itself (used when no API evidence list is loaded). */
export function buildStitches(plan: PlanFixture): Stitch[] {
  const doc = plan.source_document.version_label;
  const raw: { cite: Cite; topic: string; rule: string }[] = [];
  const push = (cite: Cite | null | undefined, topic: string, rule: string) => { if (cite && (cite.doc ?? doc) === doc) raw.push({ cite, topic, rule }); };
  push(plan.deductible_individual.cite, "deductible", "D");
  push(plan.deductible_family?.cite, "deductible", "D");
  push(plan.deductible_individual_out?.cite, "deductible", "D");
  push(plan.annual_max.cite, "annual_max", "M");
  push(plan.annual_max_out?.cite, "annual_max", "M");
  push(plan.benefit_year_start_month.cite, "dos", "Y");
  plan.classes.forEach((c) => { push(c.plan_share_bp_in.cite, "coinsurance", "CO"); push(c.plan_share_bp_out?.cite, "coinsurance", "CO"); push(c.cite, `class:${c.name}`, "CLS"); });
  Object.values(plan.class_of).forEach((v) => push(v.cite, "coinsurance", "CO"));
  Object.values(plan.allowed_amounts).forEach((v) => push(v.cite, "allowed", "N"));
  push(plan.alternate_benefit.cite, "alternate_benefit", "AB");
  push(plan.waiting_months.cite, "waiting", "W");
  plan.frequency.forEach((f) => push(f.cite, "frequency", "F"));
  Object.values(plan.excluded ?? {}).forEach((v) => push(v.cite, "exclusion", "X"));
  push(plan.oon_rule.cite, "network", "N");
  push(plan.dos_rule.cite, "dos", "DOS");
  Object.values(plan.premium_monthly).forEach((v) => push(v.cite, "premium", "P"));
  const map = new Map<string, Stitch>();
  for (const r of raw) {
    const key = `${r.cite.page}|${r.cite.quote}`;
    const existing = map.get(key);
    if (existing) { if (!existing.ruleCodes.includes(r.rule)) existing.ruleCodes.push(r.rule); continue; }
    map.set(key, { id: "", doc, n: 0, page: r.cite.page, quote: r.cite.quote, topic: r.topic, ruleCodes: [r.rule], pageNote: r.cite.page_note });
  }
  const list = [...map.values()].sort((a, b) => a.page - b.page || a.quote.localeCompare(b.quote));
  list.forEach((s, i) => { s.n = i + 1; s.id = `${doc}#${s.n}`; });
  return list;
}

/** Map a Ledger step to its stitch: the engine labels steps `${doc}#p${page}` plus a rule code; we pick the stitch on that page with that rule. */
export function stitchForStep(step: Step, stitches: Stitch[]): Stitch | undefined {
  if (!step.stitch) return undefined;
  const m = /^(.+)#p(\d+)$/.exec(step.stitch);
  if (!m) return undefined;
  const page = Number(m[2]);
  return stitches.find((s) => s.doc === m[1] && s.page === page && s.ruleCodes.includes(step.rule))
    ?? stitches.find((s) => s.doc === m[1] && s.page === page);
}
/** Same lookup for a raw stitch label (e.g. from the cost trail). */
export function stitchForLabel(label: string | null, rule: string, stitches: Stitch[]): Stitch | undefined {
  return label ? stitchForStep({ label: "", cents: 0, owner: "", rule, stitch: label }, stitches) : undefined;
}
export function stitchForCite(cite: Cite | null | undefined, stitches: Stitch[], defaultDoc: string): Stitch | undefined {
  if (!cite) return undefined;
  return stitches.find((s) => s.doc === (cite.doc ?? defaultDoc) && s.page === cite.page && s.quote === cite.quote);
}

export function formatStitch(s: Stitch): string { return `${s.doc} ${circled(s.n)}`; }
export function circled(n: number): string {
  const base = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
                "㉑", "㉒", "㉓", "㉔", "㉕", "㉖", "㉗", "㉘", "㉙", "㉚", "㉛", "㉜", "㉝", "㉞", "㉟", "㊱", "㊲", "㊳", "㊴", "㊵", "㊶", "㊷", "㊸", "㊹", "㊺", "㊻", "㊼", "㊽", "㊾", "㊿"];
  return base[n - 1] ?? `(${n})`;
}
export const money = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
export const signed = (c: number | null | undefined) => (c == null ? "—" : c < 0 ? `−${money(-c)}` : c === 0 ? "$0.00" : `+${money(c)}`);
