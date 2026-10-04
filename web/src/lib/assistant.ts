/**
 * Grounded-assistant helpers (spec §8, component plan N8). Pure; tested in lib/assistant.test.ts.
 * - `{{ref:n}}` placeholders are resolved against the estimate / plan / benefits / rules / treatment-item payloads the client already holds:
 *   the server never writes an amount into `text` (api/app/assistant.py MONEY_IN_TEXT); `hasBareMoney` mirrors that rejection on the client;
 * - the frozen `AssistBlock` / `AssistResponse` types are widened here (additive) for the API's `ribbon`, template `key: "out_of_scope"`,
 *   template `label`, clarify `text` and the `tools_used` id strings (foundation notes §2.3 / §3.1).
 */
import { ASSIST } from "./copy/assistant";
import { stitchForLabel } from "./stitches";
import type { AssistRef, AssistResponse, AssistScope, Benefits, CoverageRule, Evidence, LedgerLine, PlanFixture, SavedEstimate, Step, Stitch, TreatmentItem, VJson } from "./types";

export type AssistBlockX =
  | { type: "sentence"; text: string; refs: AssistRef[] }
  | { type: "clarify"; text?: string; options: { label: string; scope_patch: Partial<AssistScope> }[] }
  | { type: "template"; key: "advice_question" | "out_of_scope" | string; label?: string; text: string };

export interface AssistResponseX extends Omit<AssistResponse, "blocks"> {
  blocks: AssistBlockX[];
  ribbon?: string | null;
  model?: string;
}

/** What the client holds to render refs. Every field is optional at the call site; a missing payload renders "figure not loaded". */
export interface AssistData {
  estimate: SavedEstimate | null;
  plan: PlanFixture | null;
  benefits: Benefits | null;
  rules: CoverageRule[];
  items: TreatmentItem[];
  stitches: Stitch[];
}
export const EMPTY_DATA: AssistData = { estimate: null, plan: null, benefits: null, rules: [], items: [], stitches: [] };

/** Identical to api/app/assistant.py MONEY_IN_TEXT / PLACEHOLDER. */
export const MONEY_IN_TEXT = /\$\s?\d|\d\s?%|\d\s*(?:dollars|percent)\b|\b(?:dollars|percent)\s*\d/i;
export const PLACEHOLDER = /\{\{ref:(\d+)\}\}/g;

/** True when the sentence states an amount outside a placeholder (the server drops such sentences; the client never renders one). */
export function hasBareMoney(text: string): boolean {
  return MONEY_IN_TEXT.test(text.replace(PLACEHOLDER, " "));
}

export type Segment = { type: "text"; text: string } | { type: "ref"; index: number; ref: AssistRef | null };

export function splitPlaceholders(text: string, refs: AssistRef[]): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    const index = Number(m[1]);
    out.push({ type: "ref", index, ref: refs[index] ?? null });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Refs the sentence did not inline (listed as chips after the sentence). */
export function trailingRefs(text: string, refs: AssistRef[]): AssistRef[] {
  const inlined = new Set([...text.matchAll(PLACEHOLDER)].map((m) => Number(m[1])));
  return refs.filter((_, i) => !inlined.has(i));
}

export type Resolved =
  | { kind: "money"; cents: number | null; evidence: Evidence; label: string }
  | { kind: "percent"; pct: number | null; evidence: Evidence; label: string }
  | { kind: "text"; text: string; evidence: Evidence; label: string }
  | { kind: "clause"; stitch: Stitch | undefined; raw: string; rule?: string; label: string };

/** Evidence of one engine step: stitched → DOC; the dentist's fee, the network/allowed step and listed items come from the user's estimate → USER. */
export function stepEvidence(step: Step | undefined): Evidence {
  if (!step) return "UNKNOWN";
  if (step.stitch) return "DOC";
  return step.rule === "fee" || step.rule === "N" || step.rule === "X" ? "USER" : "DOC";
}

/** Evidence of a line total: DOC when at least one step is stitched to the document, USER when the line is built from inputs only, UNKNOWN when unresolved. */
export function lineEvidence(line: LedgerLine | undefined): Evidence {
  if (!line || line.status === "unresolved") return "UNKNOWN";
  return line.steps.some((s) => s.stitch) ? "DOC" : "USER";
}

const vj = (v: VJson<unknown> | undefined | null) => ({ value: v?.value ?? null, evidence: (v?.status ?? "UNKNOWN") as Evidence, unlimited: !!v?.unlimited });

function itemForScope(data: AssistData, lineIndex: number | undefined): TreatmentItem | undefined {
  const ids = data.estimate?.inputs?.treatment_item_ids ?? [];
  if (lineIndex === undefined || lineIndex >= ids.length) return data.items[0];
  const id = ids[lineIndex];
  return data.items.find((it) => it.id === id || it.seed_id === id);
}

function ruleForScope(data: AssistData, item: TreatmentItem | undefined): CoverageRule | undefined {
  if (!item) return data.rules[0];
  return data.rules.find((r) => r.procedure_key === item.procedure_key) ?? data.rules[0];
}

export function fieldLabel(path: string): string {
  const known = ASSIST.refField[path];
  if (known) return known;
  const ra = /^estimate\.ledger\.lines\[(\d+)\]\.remaining_after\.(deductible_cents|annual_max_cents)$/.exec(path);
  if (ra) return ASSIST.refRemainingAfter(Number(ra[1]), ra[2]);
  const fl = /^estimate\.ledger\.lines\[(\d+)\]\.flags$/.exec(path);
  if (fl) return ASSIST.refFlags(Number(fl[1]));
  return path;
}

/** Resolve one ref against the payloads. Cents come back as numbers so the caller renders them through <Money>; never a formatted string. */
export function resolveRef(ref: AssistRef, data: AssistData, scope?: AssistScope): Resolved {
  const lines = data.estimate?.ledger.lines ?? [];
  if (ref.kind === "step") {
    const line = lines[ref.line_index];
    const step = line?.steps[ref.step_index];
    return { kind: "money", cents: step?.cents ?? null, evidence: step ? stepEvidence(step) : "UNKNOWN", label: ASSIST.refStep(step?.label || ref.label) };
  }
  if (ref.kind === "line_total") {
    const line = lines[ref.line_index];
    const cents = ref.which === "patient" ? line?.patient_cents ?? null : line?.plan_cents ?? null;
    return { kind: "money", cents, evidence: cents === null ? "UNKNOWN" : lineEvidence(line), label: ref.which === "patient" ? ASSIST.refPatientTotal : ASSIST.refPlanTotal };
  }
  if (ref.kind === "clause") {
    return { kind: "clause", stitch: stitchForLabel(ref.stitch, ref.rule ?? "", data.stitches), raw: ref.stitch, rule: ref.rule, label: ASSIST.refClause(ref.stitch) };
  }
  // field refs
  const path = ref.path;
  const label = fieldLabel(path);
  const plan = data.plan;
  const b = data.benefits;
  switch (path) {
    case "plan.deductible_individual": { const v = vj(plan?.deductible_individual); return { kind: "money", cents: typeof v.value === "number" ? v.value : null, evidence: plan ? v.evidence : "UNKNOWN", label }; }
    case "plan.annual_max": {
      const v = vj(plan?.annual_max);
      if (v.unlimited) return { kind: "text", text: ASSIST.unlimited, evidence: v.evidence, label };
      return { kind: "money", cents: typeof v.value === "number" ? v.value : null, evidence: plan ? v.evidence : "UNKNOWN", label };
    }
    case "plan.annual_max_unlimited": { const v = vj(plan?.annual_max); return { kind: "text", text: v.unlimited ? ASSIST.unlimited : v.value === null ? ASSIST.notStated : ASSIST.no, evidence: plan ? v.evidence : "UNKNOWN", label }; }
    case "plan.benefit_year_start_month": {
      const v = vj(plan?.benefit_year_start_month);
      const n = typeof v.value === "number" ? v.value : null;
      const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return { kind: "text", text: n && n >= 1 && n <= 12 ? names[n - 1] : ASSIST.notStated, evidence: plan ? v.evidence : "UNKNOWN", label };
    }
    case "benefits.remaining_deductible_cents": return moneyField(b?.remaining_deductible_cents, b ? "USER" : "UNKNOWN", label);
    case "benefits.remaining_max_cents": return moneyField(b?.remaining_max_cents, b ? "USER" : "UNKNOWN", label);
    case "benefits.deductible_met_cents": return moneyField(b?.deductible_met_cents, b ? "USER" : "UNKNOWN", label);
    case "benefits.benefits_used_cents": return moneyField(b?.benefits_used_cents, b ? "USER" : "UNKNOWN", label);
    case "estimate.inputs.hypotheticals": {
      const h = data.estimate?.inputs?.hypotheticals ?? {};
      const keys = Object.keys(h);
      return { kind: "text", text: keys.length ? keys.join(", ") : ASSIST.none, evidence: keys.length ? "ASSUMED" : "USER", label };
    }
    case "estimate.missing_inputs": { const m = data.estimate?.missing_inputs ?? []; return { kind: "text", text: m.length ? m.map((x) => x.input).join(", ") : ASSIST.none, evidence: "UNKNOWN", label }; }
    case "estimate.ledger.not_provided": { const m = data.estimate?.ledger.not_provided ?? []; return { kind: "text", text: m.length ? m.join(", ") : ASSIST.none, evidence: "UNKNOWN", label }; }
  }
  const ra = /^estimate\.ledger\.lines\[(\d+)\]\.remaining_after\.(deductible_cents|annual_max_cents)$/.exec(path);
  if (ra) {
    const line = lines[Number(ra[1])];
    const cents = line?.remaining_after?.[ra[2] as "deductible_cents" | "annual_max_cents"] ?? null;
    const fromRecords = !!data.estimate?.inputs?.benefits_snapshot;
    return { kind: "money", cents, evidence: cents === null ? "UNKNOWN" : fromRecords ? "USER" : "DOC", label };
  }
  const fl = /^estimate\.ledger\.lines\[(\d+)\]\.flags$/.exec(path);
  if (fl) { const line = lines[Number(fl[1])]; return { kind: "text", text: line?.flags.length ? line.flags.join(" ") : ASSIST.none, evidence: "AMBIGUOUS", label }; }
  if (path.startsWith("treatment_item.")) {
    const item = scope?.treatment_item_id ? data.items.find((it) => it.id === scope.treatment_item_id) ?? itemForScope(data, scope.line_index) : itemForScope(data, scope?.line_index);
    if (path === "treatment_item.dentist_fee_cents") return moneyField(item?.dentist_fee_cents, item ? "USER" : "UNKNOWN", label);
    if (path === "treatment_item.allowed_cents") return moneyField(item?.allowed_cents, item ? ((item.allowed_status as Evidence) || "USER") : "UNKNOWN", label);
  }
  if (path.startsWith("rules.")) {
    const item = scope?.treatment_item_id ? data.items.find((it) => it.id === scope.treatment_item_id) ?? itemForScope(data, scope.line_index) : itemForScope(data, scope?.line_index);
    const rule = ruleForScope(data, item);
    const ev: Evidence = rule?.status ?? (rule?.coverage_cite ? "DOC" : "UNKNOWN");
    if (!rule) return { kind: "text", text: ASSIST.notLoaded, evidence: "UNKNOWN", label };
    switch (path) {
      case "rules.plan_pays_pct": return { kind: "percent", pct: rule.plan_pays_pct, evidence: rule.plan_pays_pct === null ? "UNKNOWN" : ev, label };
      case "rules.you_pay_pct": return { kind: "percent", pct: rule.you_pay_pct, evidence: rule.you_pay_pct === null ? "UNKNOWN" : ev, label };
      case "rules.category": return { kind: "text", text: rule.category ?? ASSIST.notStated, evidence: rule.category_status ?? (rule.category ? "DOC" : "UNKNOWN"), label };
      case "rules.deductible_applies": return { kind: "text", text: rule.deductible_applies === null || rule.deductible_applies === undefined ? ASSIST.notStated : rule.deductible_applies ? ASSIST.yes : ASSIST.no, evidence: rule.deductible_cite ? "DOC" : "UNKNOWN", label };
      case "rules.covered": return { kind: "text", text: rule.covered === null || rule.covered === undefined ? ASSIST.notStated : rule.covered ? ASSIST.yes : ASSIST.no, evidence: ev, label };
      case "rules.waiting": return { kind: "text", text: rule.waiting?.months != null ? `${rule.waiting.months} months` : ASSIST.notStated, evidence: rule.waiting?.status ?? "UNKNOWN", label };
      case "rules.alternate_benefit": return { kind: "text", text: rule.alternate_benefit?.status ?? "UNKNOWN", evidence: rule.alternate_benefit?.status ?? "UNKNOWN", label };
      case "rules.frequency": return { kind: "text", text: rule.frequency?.length ? rule.frequency.map((f) => `${f.n} per ${f.clock.replace(/_/g, " ")}`).join("; ") : ASSIST.notStated, evidence: rule.frequency?.length ? "DOC" : "UNKNOWN", label };
    }
  }
  return { kind: "text", text: ASSIST.notLoaded, evidence: "UNKNOWN", label };
}

function moneyField(cents: number | null | undefined, evidence: Evidence, label: string): Resolved {
  return { kind: "money", cents: cents ?? null, evidence: cents == null ? "UNKNOWN" : evidence, label };
}

/** Mirrors assistant_templates.RULE_FROM_STEP_KEY so the first suggestions match what the server will send back. */
export const RULE_FROM_STEP_KEY: Record<string, string> = {
  fee: "fee", allowed: "N", alternate: "AB", deductible: "D", share: "CO", max: "M", you: "total", total: "total",
  N: "N", AB: "AB", D: "D", CO: "CO", M: "M", X: "X", W: "W", F: "F",
};

export function suggestionKey(scope: AssistScope): string {
  if (scope.stitch) return "clause";
  const key = scope.step_key ?? scope.checkpoint_key;
  const rule = key ? RULE_FROM_STEP_KEY[key] : undefined;
  return rule && ASSIST.suggestions[rule] ? rule : "default";
}

export const initialSuggestions = (scope: AssistScope): string[] => ASSIST.suggestions[suggestionKey(scope)] ?? ASSIST.suggestions.default;

export type ScopeChoice = "step" | "procedure" | "plan" | "clause";

/** The scope selector's options: a clause scope offers clause / plan; a step scope offers step / procedure / plan. */
export function scopeChoices(scope: AssistScope): { value: ScopeChoice; label: string }[] {
  if (scope.stitch) return [{ value: "clause", label: ASSIST.scopeClause }, { value: "plan", label: ASSIST.scopePlan }];
  const out: { value: ScopeChoice; label: string }[] = [];
  if (scope.step_key || scope.checkpoint_key) out.push({ value: "step", label: ASSIST.scopeStep });
  if (scope.line_index !== undefined || scope.treatment_item_id) out.push({ value: "procedure", label: ASSIST.scopeProcedure });
  out.push({ value: "plan", label: ASSIST.scopePlan });
  return out;
}

/** Narrow or widen the scope the question is sent with. The plan ref and estimate id always stay (scope lock is server-side). */
export function applyScopeChoice(scope: AssistScope, choice: ScopeChoice): AssistScope {
  const { plan_ref, estimate_id, journey_id } = scope;
  switch (choice) {
    case "plan": return { plan_ref, ...(estimate_id ? { estimate_id } : {}), ...(journey_id ? { journey_id } : {}) };
    case "procedure": { const { step_key: _s, checkpoint_key: _c, stitch: _t, ...rest } = scope; return rest; }
    case "clause": { const { step_key: _s, checkpoint_key: _c, ...rest } = scope; return rest; }
    default: return scope;
  }
}

export type RibbonTone = "demo" | "template" | "fallback" | "live";

/** The answer card's label: the server's ribbon is authoritative; on a live server a template-only intent says "fixed template" (BUILD_FOLLOWUPS 3). */
export function ribbonFor(resp: Pick<AssistResponseX, "mode" | "ribbon" | "intent" | "model">, serverMode: "demo" | "live" | null): { text: string; tone: RibbonTone } | null {
  if (resp.ribbon === ASSIST.liveFallback) return { text: resp.ribbon, tone: "fallback" };
  const templateIntent = resp.intent === "advice_request" || resp.intent === "out_of_scope" || resp.intent === "clarify";
  if (resp.ribbon) {
    if (templateIntent && serverMode === "live") return { text: ASSIST.fixedTemplate, tone: "template" };
    return { text: resp.ribbon, tone: "demo" };
  }
  if (resp.mode === "live") {
    if (templateIntent) return { text: ASSIST.fixedTemplate, tone: "template" };
    return resp.model ? { text: ASSIST.liveLabel(resp.model), tone: "live" } : null;
  }
  return { text: ASSIST.demoRibbon, tone: "demo" };
}

/** `get_clause(ML26#p25)` → "clause ML26#p25" (ids only; the server never puts amounts in these strings). */
export function toolLabel(tool: string): string {
  const m = /^([a-z_]+)(?:\((.*)\))?$/.exec(tool.trim());
  if (!m) return tool;
  const name = ASSIST.toolName[m[1]] ?? m[1].replace(/_/g, " ");
  return m[2] ? `${name} ${m[2]}` : name;
}

/** Client-side mirror of the server's amount check: a sentence that still carries a bare amount is not rendered and counted as dropped. */
export function clientGuard(blocks: AssistBlockX[]): { blocks: AssistBlockX[]; dropped: number } {
  let dropped = 0;
  const kept = blocks.filter((b) => { if (b.type === "sentence" && hasBareMoney(b.text)) { dropped++; return false; } return true; });
  return { blocks: kept, dropped };
}

export const isTemplateBlock = (b: AssistBlockX): b is Extract<AssistBlockX, { type: "template" }> => b.type === "template";

export function templateLabel(b: Extract<AssistBlockX, { type: "template" }>): string {
  if (b.key === "advice_question") return b.label ?? ASSIST.adviceLabel;
  if (b.key === "out_of_scope") return ASSIST.outOfScopeLabel;
  return b.label ?? ASSIST.whatIfLabel;
}

/** Latest-request gate (web-correctness-14): a response is applied only when no newer question was sent and the scope did not change
 *  since it was sent. `begin()` returns the request's ticket; `invalidate()` (scope change) makes every in-flight ticket stale. */
export function createRequestGate(): { begin: () => number; isCurrent: (ticket: number) => boolean; invalidate: () => void } {
  let current = 0;
  return { begin: () => ++current, isCurrent: (ticket) => ticket === current, invalidate: () => { current++; } };
}
