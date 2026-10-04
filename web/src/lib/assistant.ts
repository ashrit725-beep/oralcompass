/**
 * Grounded-assistant helpers (spec §8, component plan N8). Pure; tested in lib/assistant.test.ts.
 * - `{{ref:n}}` placeholders are resolved against the estimate / plan / benefits / rules / treatment-item payloads the client already holds:
 *   the server never writes an amount into `text` (api/app/assistant.py MONEY_IN_TEXT); `hasBareMoney` mirrors that rejection on the client;
 * - the frozen `AssistBlock` / `AssistResponse` types are widened here (additive) for the API's `ribbon`, template `key: "out_of_scope"`,
 *   template `label`, clarify `text` and the `tools_used` id strings (foundation notes §2.3 / §3.1).
 */
import { ASSIST } from "./copy/assistant";
import { BADGE_LABEL } from "./copy";
import { PROCEDURE_NAMES } from "./clauses";
import { plainNote, stitchForLabel } from "./stitches";
import type { AssistRef, AssistResponse, AssistScope, Benefits, CoverageRule, Evidence, LedgerLine, PlanFixture, SavedEstimate, Step, Stitch, TreatmentItem, VJson } from "./types";

/** `kind: "simple"` marks the plain-words lead block (the simple-terms contract: block 1 of every answer is 1–2 short everyday sentences,
 *  figures as `{{ref:n}}`). The API may send it as a sentence or template block carrying `kind`, or as its own `type: "simple"`; both read
 *  the same here. Blocks without `kind` are the detailed blocks shown under "Show the details". */
export type AssistBlockX =
  | { type: "sentence"; text: string; refs: AssistRef[]; kind?: string }
  | { type: "simple"; text: string; refs?: AssistRef[]; kind?: string }
  | { type: "clarify"; text?: string; options: { label: string; scope_patch: Partial<AssistScope> }[]; kind?: string }
  | { type: "template"; key: "advice_question" | "out_of_scope" | string; label?: string; text: string; kind?: string };

/** The plain-words register the question is asked in (AssistIn.style): "plain" (default) or "simpler" (one even plainer sentence). */
export type AssistStyle = "plain" | "simpler";

/** One plain-words sentence ready to render: text with `{{ref:n}}` placeholders and the refs they point at. */
export interface SimpleBlock { text: string; refs: AssistRef[]; label?: string }

export const isSimpleBlock = (b: AssistBlockX): boolean => b.kind === "simple" || b.type === "simple";

/** Split an answer into its plain-words lead (every block marked simple, in order) and the detailed blocks behind "Show the details". */
export function splitAnswer(blocks: AssistBlockX[]): { simple: SimpleBlock[]; details: AssistBlockX[] } {
  const simple: SimpleBlock[] = [];
  const details: AssistBlockX[] = [];
  for (const b of blocks) {
    if (!isSimpleBlock(b)) { details.push(b); continue; }
    if (b.type === "sentence" || b.type === "simple") simple.push({ text: b.text, refs: b.refs ?? [] });
    else if (b.type === "template") simple.push({ text: b.text, refs: [], label: b.label });
    else if (b.type === "clarify") { if (b.text) simple.push({ text: b.text, refs: [] }); details.push(b); }
  }
  return { simple, details };
}

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

/** What the app shell provides once (AssistDataProvider): the payloads it already holds for the selected plan. */
export interface AssistProvided extends Partial<AssistData> { planRef?: string }

/** web-correctness-34: the shell's payloads answer only questions about the same plan (a Compare clause asks about another plan), and its
 *  estimate only questions about the same estimate id; anything else is left for the lazy fetch. Items are the user's own records and
 *  apply to every plan. */
export function scopedProvided(ctx: AssistProvided | null, scope: Pick<AssistScope, "plan_ref" | "estimate_id">): Partial<AssistData> {
  if (!ctx) return {};
  const { planRef, ...data } = ctx;
  if (planRef !== undefined && planRef !== scope.plan_ref) return data.items ? { items: data.items } : {};
  const out: Partial<AssistData> = { ...data };
  if (!scope.estimate_id || data.estimate?.id !== scope.estimate_id) delete out.estimate;
  return out;
}

/** Identical to api/app/assistant.py MONEY_IN_TEXT / ISO_DATE / PLACEHOLDER: currency signs and codes, percent, comma thousands, decimals,
 *  any 3+ digit number and spelled-out numbers next to dollars/percent/cents; ISO dates are removed first. */
const SPELLED = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)";
export const MONEY_IN_TEXT = new RegExp(
  "\\$\\s?\\d|\\d\\s?%|\\d\\s*(?:dollars|percent|cents)\\b|\\b(?:dollars|percent|cents)\\s*\\d|\\b(?:USD|US\\$|EUR|GBP)\\s?\\d" +
  "|\\d{1,3}(?:,\\d{3})+|\\b\\d+\\.\\d{1,2}\\b|\\b\\d{3,}\\b|\\b" + SPELLED + "[\\s-]+(?:dollars|percent|cents)\\b", "i");
export const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
export const PLACEHOLDER = /\{\{ref:(\d+)\}\}/g;

/** True when the sentence states an amount outside a placeholder (the server drops such sentences; the client never renders one). */
export function hasBareMoney(text: string): boolean {
  return MONEY_IN_TEXT.test(text.replace(PLACEHOLDER, " ").replace(ISO_DATE, " "));
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
  | { kind: "money"; cents: number | null; evidence: Evidence; label: string; /** an engine total: "Calculated from the clauses cited" */ calc?: boolean }
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
    // a line's you-pay / plan-pays is an engine result: it reads "calculated" (a total built on an assumption keeps its ASSUMED badge)
    return calcMoney(cents, cents === null ? "UNKNOWN" : lineEvidence(line), ref.which === "patient" ? ASSIST.refPatientTotal : ASSIST.refPlanTotal);
  }
  if (ref.kind === "estimate_total") {
    // the journey's totals (the facts line "you pay $902.00 · plan $1,098.00"): engine sums of the lines, labelled "calculated"
    return resolveRef({ kind: "field", path: ref.which === "patient" ? "estimate.ledger.patient_total_cents" : "estimate.ledger.plan_total_cents" }, data, scope);
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
    // journey totals (journey_total intent): engine sums of the lines, so they read "calculated" rather than a single source badge
    case "estimate.ledger.patient_total_cents":
    case "estimate.ledger.plan_total_cents": {
      const ledger = data.estimate?.ledger;
      const cents = path.endsWith("patient_total_cents") ? ledger?.patient_total_cents ?? null : ledger?.plan_total_cents ?? null;
      const ev: Evidence = cents === null ? "UNKNOWN" : ledger?.lines.some((l) => l.steps.some((s) => s.stitch)) ? "DOC" : "USER";
      return { kind: "money", cents, evidence: ev, label, calc: cents !== null };
    }
  }
  const lt = /^estimate\.ledger\.lines\[(\d+)\]\.(patient_cents|plan_cents)$/.exec(path);
  if (lt) {
    const line = lines[Number(lt[1])];
    const cents = lt[2] === "patient_cents" ? line?.patient_cents ?? null : line?.plan_cents ?? null;
    return calcMoney(cents, cents === null ? "UNKNOWN" : lineEvidence(line), label);
  }
  const ra = /^estimate\.ledger\.lines\[(\d+)\]\.remaining_after\.(deductible_cents|annual_max_cents)$/.exec(path);
  if (ra) {
    const line = lines[Number(ra[1])];
    const cents = line?.remaining_after?.[ra[2] as "deductible_cents" | "annual_max_cents"] ?? null;
    const fromRecords = !!data.estimate?.inputs?.benefits_snapshot;
    // what remains after this line is computed from the records/document and the lines before it: "calculated", like the soundings on the map
    return calcMoney(cents, cents === null ? "UNKNOWN" : fromRecords ? "USER" : "DOC", label);
  }
  const fl = /^estimate\.ledger\.lines\[(\d+)\]\.flags$/.exec(path);
  if (fl) { const line = lines[Number(fl[1])]; return { kind: "text", text: line?.flags.length ? line.flags.map(plainNote).join(" ") : ASSIST.none, evidence: "AMBIGUOUS", label }; }
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

/** An engine-calculated amount (CLAUDE.md rule 2 + orchestrator note 27): shown with "Calculated from the clauses cited", never a bare DOC badge.
 * A figure that rests on an assumption keeps its ASSUMED badge so the assumption stays visible. */
function calcMoney(cents: number | null, evidence: Evidence, label: string): Resolved {
  return { kind: "money", cents, evidence, label, calc: cents !== null && evidence !== "ASSUMED" };
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

/** demo-19: one tool id in plain words, resolved against the estimate the client holds (`get_estimate_line(line 1)` → "Crown (tooth 19):
 *  estimate line"; `explain_step(line 0, step 2)` → "Root canal (tooth 19): plan share step"). Step names come from the rule code, never
 *  the step label, so no amount appears; lines and steps count from 1 when no name is known. */
export function lookupLabel(tool: string, data?: Pick<AssistData, "estimate"> | null): string {
  const m = /^([a-z_]+)(?:\((.*)\))?$/.exec(tool.trim());
  if (!m) return tool;
  const arg = (m[2] ?? "").trim();
  const lines = data?.estimate?.ledger.lines ?? [];
  const lineName = (i: number) => lines[i]?.label || ASSIST.lookupLineN(i + 1);
  switch (m[1]) {
    case "get_benefits": return ASSIST.lookupBenefits(arg);
    case "get_estimate_line": { const i = Number(/(\d+)/.exec(arg)?.[1]); return Number.isFinite(i) ? ASSIST.lookupLine(lineName(i)) : toolLabel(tool); }
    case "explain_step": {
      const nums = arg.match(/\d+/g)?.map(Number) ?? [];
      if (nums.length < 2) return toolLabel(tool);
      const [li, si] = nums;
      const step = lines[li]?.steps[si];
      const rule = step && ASSIST.stepRule[step.rule];
      return rule ? ASSIST.lookupStep(lineName(li), rule) : ASSIST.lookupStepUnnamed(lineName(li), si + 1);
    }
    case "get_plan_rules": return ASSIST.lookupRules(PROCEDURE_NAMES[arg] ?? arg.replace(/_/g, " "));
    case "get_clause": return ASSIST.lookupClause(arg);
    case "resolve_procedure": return ASSIST.lookupProcedures;
    default: return toolLabel(tool);
  }
}

/** The answer's lookups, in plain words, each listed once. */
export const lookupLabels = (tools: string[], data?: Pick<AssistData, "estimate"> | null): string[] => [...new Set(tools.map((t) => lookupLabel(t, data)))];

/** Client-side mirror of the server's amount check: a sentence that still carries a bare amount is not rendered and counted as dropped. */
export function clientGuard(blocks: AssistBlockX[]): { blocks: AssistBlockX[]; dropped: number } {
  let dropped = 0;
  const kept = blocks.filter((b) => { if ((b.type === "sentence" || b.type === "simple") && hasBareMoney(b.text)) { dropped++; return false; } return true; });
  return { blocks: kept, dropped };
}

export type AskTab = "journey" | "plan" | "compare" | "documents";

/** The journey's planned procedures in everyday words, most you-pay first (resolved lines only; a name is listed once). */
function journeyProcedureNames(data: Pick<AssistData, "estimate" | "items">): string[] {
  const lines = data.estimate?.ledger.lines ?? [];
  const ids = data.estimate?.inputs?.treatment_item_ids ?? [];
  const named = lines.map((l, i) => {
    const key = l.procedure_key ?? data.items.find((it) => it.id === ids[i] || it.seed_id === ids[i])?.procedure_key;
    return { name: key ? ASSIST.everydayName[key] : undefined, cents: l.patient_cents };
  }).filter((x): x is { name: string; cents: number } => !!x.name && typeof x.cents === "number");
  named.sort((a, b) => b.cents - a.cents);
  const seen = new Set<string>();
  return named.filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true))).map((x) => x.name);
}

/** The AskBox chips for a tab, in everyday words. On My journey the second chip is built from the journey's real procedures: "Why does
 *  the crown cost more than the root canal?" names the two planned procedures with the largest you-pay figures (only when the higher one
 *  really is higher), one procedure gives "What do I pay for the crown?", none gives a plain definition question. */
export function boxSuggestions(tab: AskTab, data: Pick<AssistData, "estimate" | "items">): string[] {
  const base = ASSIST.boxChips[tab] ?? ASSIST.boxChips.plan;
  if (tab !== "journey") return base;
  const names = journeyProcedureNames(data);
  let chip: string = ASSIST.chipFallback;
  if (names.length >= 2) chip = ASSIST.chipWhyMore(names[0], names[1]);
  else if (names.length === 1) chip = ASSIST.chipWhatFor(names[0]);
  return [base[0], chip, ...base.slice(1)];
}

/** Plain text of a plain-words block for the screen-reader announcement: figures as "$902.00 (calculated from the clauses cited)" /
 *  "$0.00 (From the plan document)", clause refs by their label. Visible text renders the same refs through <Money> with the badge. */
export function plainText(block: SimpleBlock, data: AssistData, scope?: AssistScope): string {
  return splitPlaceholders(block.text, block.refs).map((s) => {
    if (s.type === "text") return s.text;
    if (!s.ref) return ASSIST.notLoaded;
    const r = resolveRef(s.ref, data, scope);
    switch (r.kind) {
      case "money": return r.cents === null ? ASSIST.notProvided : `${moneyWords(r.cents)} (${r.calc ? ASSIST.calcWords : BADGE_LABEL[r.evidence] ?? r.evidence})`;
      case "percent": return r.pct === null ? ASSIST.notStated : `${r.pct}%`;
      case "text": return r.text;
      case "clause": return r.label;
    }
  }).join("").replace(/\s+/g, " ").trim();
}

const moneyWords = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


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

const normRef = (r: string) => (r.startsWith("upload:") ? r : r.toUpperCase());

/** The AskBox scope (journey level, no line): the selected plan, the journey's estimate when it belongs to that plan (the API locks an
 *  estimate to its plan and answers 404 otherwise, e.g. for the moment between a plan switch and the new estimate), and the journey. */
export function askBoxScope(planRef: string, estimate: Pick<SavedEstimate, "id" | "plan_code"> | null | undefined, journeyId?: string | null, compare?: readonly string[] | null): AssistScope | null {
  if (!planRef) return null;
  const est = estimate && (!estimate.plan_code || normRef(estimate.plan_code) === normRef(planRef)) ? { estimate_id: estimate.id } : {};
  const cmp = compareScope(compare);
  return { plan_ref: planRef, ...est, ...(journeyId ? { journey_id: journeyId } : {}), ...(cmp ? { compare: cmp } : {}) };
}

/** The Compare tab's scope.compare: the plans currently compared, deduplicated, at most three (the API accepts 1–3); none gives undefined. */
export function compareScope(refs: readonly string[] | null | undefined): string[] | undefined {
  const seen = new Set<string>();
  const out = (refs ?? []).filter((r) => typeof r === "string" && r.length > 0 && (seen.has(normRef(r)) ? false : (seen.add(normRef(r)), true))).slice(0, 3);
  return out.length ? out : undefined;
}
