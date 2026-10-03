import type { Cite, PlanFixture, Step, Stitch } from "./types";

/** Build the stitch list for one plan document: every cited sentence, numbered in page order, scoped by document label. */
export function buildStitches(plan: PlanFixture): Stitch[] {
  const doc = plan.source_document.version_label;
  const raw: { cite: Cite; topic: string; rule: string }[] = [];
  const push = (cite: Cite | null | undefined, topic: string, rule: string) => { if (cite && (cite.doc ?? doc) === doc) raw.push({ cite, topic, rule }); };
  push(plan.deductible_individual.cite, "deductible", "D");
  push(plan.annual_max.cite, "annual_max", "M");
  push(plan.benefit_year_start_month.cite, "dos", "Y");
  plan.classes.forEach((c) => { push(c.plan_share_bp_in.cite, "coinsurance", "CO"); push(c.cite, `class:${c.name}`, "CLS"); });
  Object.values(plan.class_of).forEach((v) => push(v.cite, "coinsurance", "CO"));
  Object.values(plan.allowed_amounts).forEach((v) => push(v.cite, "allowed", "N"));
  push(plan.alternate_benefit.cite, "alternate_benefit", "AB");
  push(plan.waiting_months.cite, "waiting", "W");
  plan.frequency.forEach((f) => push(f.cite, "frequency", "F"));
  push(plan.oon_rule.cite, "network", "N");
  push(plan.dos_rule.cite, "dos", "DOS");
  Object.values(plan.premium_monthly).forEach((v) => push(v.cite, "premium", "P"));
  // dedupe identical (page, quote); keep all rule codes
  const map = new Map<string, Stitch>();
  for (const r of raw) {
    const key = `${r.cite.page}|${r.cite.quote}`;
    const existing = map.get(key);
    if (existing) { if (!existing.ruleCodes.includes(r.rule)) existing.ruleCodes.push(r.rule); continue; }
    map.set(key, { id: "", doc, n: 0, page: r.cite.page, quote: r.cite.quote, topic: r.topic, ruleCodes: [r.rule] });
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

export function formatStitch(s: Stitch): string { return `${s.doc} ${circled(s.n)}`; }
export function circled(n: number): string {
  const base = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return base[n - 1] ?? `(${n})`;
}
export const money = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
