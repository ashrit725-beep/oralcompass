/**
 * Data → map mapping (design spec §3, addendum §B). Pure functions, unit-tested against the Alex and Sam fixtures.
 *
 * `buildPassage(inputs)` turns the API payloads into a `PassageVM`: START, procedure islands (one per planned treatment item, in ledger
 * order), insurance checkpoints (the `buildTrail` steps in fixed slot order, zero-change rules kept as pass-through markers), visited
 * islands (completed items deduped against the benefit statement's claims), marginal islands (consultation-mentioned items, rules
 * only), fog (unresolved lines, named missing inputs), closed channels (not-covered lines) and soundings (`remaining_after`).
 * The UI never computes an amount: the only arithmetic is the display sums `buildTrail` already reconciles against the engine.
 *
 * `smoothRoute(points)` draws the phone passage's inked route through stops measured from the HTML (mobile-only app: the 1000 × 600
 * desktop chart layout and its collision solver were removed with the desktop layout).
 */
import { checkpointEvidence } from "./checkpoints";
import { stitchForCheckpoint } from "./drawer";
import { CHECKPOINT_PLACE, CHECKPOINT_TERM, CLOSED_SUFFIX, GLYPH_FOR_RULE, LIGHT_PLACE, SLOT_ORDER, START_PLACE, categoryOf, placeName } from "./islands";
import { PASSAGE } from "./copy/passage";
import { plainNote, stepContextFor, stitchForLabel, type StepContext } from "./stitches";
import { buildTrail, type TrailStep } from "./trail";
import { isUpload } from "./types";
import type {
  Benefits, CheckpointRule, Claim, CoverageRule, Evidence, InsuranceCheckpointVM, IslandVM, JourneyView, LedgerLine, MissingInput, PassageVM, PlanFixture,
  PlanRef, Procedure, SavedEstimate, Stitch, TreatmentItem,
} from "./types";

// ---------------------------------------------------------------------------------------------------------------------------------
// buildPassage
// ---------------------------------------------------------------------------------------------------------------------------------

export interface PassageInputs {
  items: TreatmentItem[];
  estimate: SavedEstimate | null;
  benefits: Benefits | null;
  journey: JourneyView | null;
  rules: CoverageRule[];
  plan: PlanFixture | null;
  procedures: Procedure[];
  stitches: Stitch[];
  planRef: PlanRef;
}

const PLANNED = new Set(["planned", "scheduled"]);
const networkWord = (n: string | null | undefined) => (n === "in" ? PASSAGE.inNetwork : n === "out" ? PASSAGE.outOfNetwork : PASSAGE.networkNotProvided);
export const itemRef = (i: TreatmentItem) => i.seed_id ?? i.id;

/** The plan code people read: a preset's code (ML26), or an uploaded plan's version label (UP1), never the internal
 *  "upload:<content hash>" ref. Until the uploaded plan's model has loaded the words "your uploaded document" stand in. */
export function planDisplayCode(planRef: PlanRef, plan: PlanFixture | null): string {
  if (!planRef) return "—";
  if (!isUpload(planRef)) return planRef;
  return plan?.source_document?.document_type === "uploaded_plan_document" && plan.source_document.version_label ? plan.source_document.version_label : PASSAGE.uploadedPlan;
}

/** The engine's own label for an item (records.py `lines_from_items`), used to verify the index fallback. */
export function expectedLineLabel(item: TreatmentItem, procedures: Procedure[]): string {
  const name = item.procedure_name || procedures.find((p) => p.key === item.procedure_key)?.name || item.procedure_key;
  return item.tooth ? `${name} (tooth ${item.tooth})` : name;
}

/** Match a ledger line to an item: by `treatment_item_id`, else by index when the engine's label matches (addendum B3). */
export function matchLine(lines: LedgerLine[], item: TreatmentItem, index: number, procedures: Procedure[]): { line: LedgerLine; lineIndex: number } | { mismatch: true } | null {
  const byId = lines.findIndex((l) => l.treatment_item_id === item.id);
  if (byId >= 0) return { line: lines[byId], lineIndex: byId };
  const byIndex = lines[index];
  if (!byIndex) return null;
  if (byIndex.treatment_item_id && byIndex.treatment_item_id !== item.id) return { mismatch: true };
  return byIndex.label === expectedLineLabel(item, procedures) ? { line: byIndex, lineIndex: index } : { mismatch: true };
}

const RULE_FLAG_WORDS: Partial<Record<CheckpointRule, RegExp>> = {
  N: /allowed amount|network/i, AB: /alternate/i, D: /deductible/i, CO: /class of|share/i, M: /annual maximum|maximum/i, W: /waiting/i,
};

/** Insurance checkpoints for one line: the trail steps in fixed slot order; Fee, Allowed, Deductible, Share, Maximum, You pay always present on an estimate line. */
export function checkpointsFor(line: LedgerLine, islandId: string, stitches: Stitch[], item: TreatmentItem | undefined, benefits: Benefits | null, missing: MissingInput[], row?: CoverageRule, plan?: PlanFixture | null, ctx?: StepContext): InsuranceCheckpointVM[] {
  const trail = buildTrail(line);
  // the clause behind a step: the coverage rule's exact cite first (as the drawer's pipeline resolves it), then the engine's step label
  const resolve = (rule: CheckpointRule, label: string | null, engineRule: string): Stitch | undefined =>
    (plan ? stitchForCheckpoint(rule, label, row, plan, stitches) : undefined) ?? stitchForLabel(label, engineRule, stitches, ctx);
  const mk = (rule: CheckpointRule, s: Partial<InsuranceCheckpointVM>): InsuranceCheckpointVM => ({
    key: `${islandId}:${rule}`, rule, term: CHECKPOINT_TERM[rule], place: CHECKPOINT_PLACE[rule], glyph: GLYPH_FOR_RULE[rule],
    amountIn: null, change: null, amountOut: null, owner: "info", explanation: "", stitchLabel: null, badge: "UNKNOWN", stepIndexes: [], flags: [],
    ...s,
  });
  if (line.status === "unresolved") {
    return [mk("missing", { owner: "info", explanation: missing.length ? missing.map((m) => plainNote(m.input)).join("; ") : line.flags.map(plainNote).join(" "), flags: line.flags.map(plainNote) })];
  }
  if (line.status === "not_covered") {
    const x = line.steps[0];
    const rule: CheckpointRule = x?.rule === "W" ? "W" : x?.rule === "F" ? "F" : "X";
    const st = resolve(rule, x?.stitch ?? null, x?.rule ?? "X");
    return [
      mk("fee", { amountOut: trail.fee, owner: "info", explanation: PASSAGE.feeExplanation, badge: "USER" }),
      mk(rule, { amountIn: trail.fee, change: 0, amountOut: line.patient_cents, owner: "patient", explanation: x?.label ?? "", stitchLabel: x?.stitch ?? null, stitch: st, badge: st ? "DOC" : "UNKNOWN", stepIndexes: x ? [0] : [], flags: line.flags }),
    ];
  }
  const byKey = new Map(trail.steps.map((s) => [s.key, s] as const));
  const shareStep = byKey.get("share");
  const shareStitch = !!(shareStep && resolve("CO", shareStep.stitch, shareStep.rule));
  const listed = line.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.rule === "X" && /^Listed on your estimate/i.test(s.label));
  const out: InsuranceCheckpointVM[] = [];
  for (const rule of SLOT_ORDER) {
    const key = rule === "fee" ? "fee" : rule === "N" ? "allowed" : rule === "AB" ? "alternate" : rule === "D" ? "deductible" : rule === "CO" ? "share" : rule === "M" ? "max" : rule === "total" ? "you" : "listed";
    if (rule === "L") {
      if (!listed.length) continue;
      const sum = listed.reduce((a, { s }) => a + s.cents, 0);
      out.push(mk("L", { amountIn: null, change: sum, amountOut: null, owner: "patient", explanation: listed.map(({ s }) => s.label).join("; "), badge: "USER", stepIndexes: listed.map(({ i }) => i) }));
      continue;
    }
    const step = byKey.get(key);
    if (!step) continue;                      // AB only when the engine produced one
    const stepIndexes = line.steps.map((s, i) => ({ s, i })).filter(({ s }) => (rule === "N" && s.rule === "N") || (rule === "AB" && s.rule === "AB") || (rule === "D" && s.rule === "D") || (rule === "CO" && s.rule === "CO") || (rule === "M" && s.rule === "M")).map(({ i }) => i);
    const st = resolve(rule, step.stitch, step.rule);
    const flags = line.flags.filter((f) => RULE_FLAG_WORDS[rule]?.test(f));
    out.push(mk(rule, {
      amountIn: step.amountIn, change: step.change == null ? null : step.change || 0, amountOut: step.amountOut, owner: step.owner, explanation: step.explanation, stitchLabel: step.stitch, stitch: st,
      badge: checkpointEvidence(rule, st, { item, benefits, shareHasStitch: shareStitch }), stepIndexes, flags, split: step.split,
    }));
  }
  return out;
}

export function buildPassage(inp: PassageInputs): PassageVM {
  const { items, estimate, benefits, journey, rules, plan, procedures, stitches, planRef } = inp;
  const lines = estimate?.ledger.lines ?? [];
  const stages = journey?.journey.stages ?? [];
  const procName = (key: string) => procedures.find((p) => p.key === key)?.name ?? key.replace(/_/g, " ");
  const hintOf = (key: string) => procedures.find((p) => p.key === key)?.category_hint ?? null;
  const stagesFor = (item: TreatmentItem) => stages.filter((s) => (s.linked_treatment_items ?? []).includes(itemRef(item)) || (s.linked_treatment_items ?? []).includes(item.id)).map((s) => s.id);
  const seen = new Map<string, number>();
  const unlimited = !!(plan?.annual_max.unlimited || benefits?.annual_max_unlimited);

  // ---- route islands (§3.2) ----
  const plannedIds = estimate ? estimate.inputs.treatment_item_ids : items.filter((i) => PLANNED.has(i.status)).map((i) => i.id);
  const routeItems = plannedIds.map((id) => items.find((i) => i.id === id)).filter((i): i is TreatmentItem => !!i);
  const globalMissing = estimate?.missing_inputs ?? [];
  const islands: IslandVM[] = routeItems.map((item, i) => {
    const id = `island:${item.id}`;
    const category = categoryOf(hintOf(item.procedure_key));
    const matched = estimate ? matchLine(lines, item, i, procedures) : null;
    const line = matched && "line" in matched ? matched.line : undefined;
    const lineIndex = matched && "line" in matched ? matched.lineIndex : undefined;
    const mismatch = !!(matched && "mismatch" in matched);
    const missing = line ? globalMissing.filter((m) => !m.line || m.line === line.label) : estimate ? globalMissing.filter((m) => !m.line) : [];
    const state: IslandVM["state"] = !estimate ? "pending" : !line ? "unresolved" : line.status;
    const notices = [...(line?.flags ?? [])];
    if (mismatch) notices.unshift(PASSAGE.lineMismatch);
    if (i === 0 && estimate?.ledger.order_note && /changes|change a line|would change/i.test(estimate.ledger.order_note) && !/does not change/i.test(estimate.ledger.order_note)) notices.unshift(estimate.ledger.order_note);
    const base = placeName(category, seen);
    const title = item.procedure_name || procName(item.procedure_key);
    const subtitle = [item.tooth ? `${PASSAGE.tooth} ${item.tooth}` : null, item.status.replace(/_/g, " ")].filter(Boolean).join(" · ");
    return {
      id, kind: "procedure", state, order: i + 1, place: state === "not_covered" ? `${base}${CLOSED_SUFFIX}` : base, title, subtitle, category,
      itemId: item.id, item, line, lineIndex,
      checkpoints: line ? checkpointsFor(line, id, stitches, item, benefits, missing, rules.find((r) => r.procedure_key === item.procedure_key), plan, stepContextFor(line, rules)) : [],
      youPay: line?.status === "estimate" || line?.status === "not_covered" ? line.patient_cents : null,
      planPays: line?.status === "estimate" ? line.plan_cents : line?.status === "not_covered" ? line.plan_cents : null,
      upperBound: !!line?.plan_is_upper_bound, missing, notices,
      soundingsAfter: line && line.status !== "unresolved" ? { deductible: line.remaining_after?.deductible_cents ?? null, annualMax: line.remaining_after?.annual_max_cents ?? null, unlimited } : null,
      stageIds: stagesFor(item),
    };
  });

  // ---- visited (completed items ∪ unmatched claims; addendum B2 graft: one visit is one islet) ----
  const claims: Claim[] = (benefits?.claims ?? []) as Claim[];
  const usedClaims = new Set<string>();
  const visitedRaw: { date: string; island: IslandVM }[] = [];
  for (const item of items.filter((i) => i.status === "completed")) {
    const claim = claims.find((c) => !usedClaims.has(c.id) && c.procedure_key === item.procedure_key && (!item.appointment_date || c.date === item.appointment_date));
    if (claim) usedClaims.add(claim.id);
    const date = claim?.date ?? item.appointment_date ?? "";
    const title = item.procedure_name || procName(item.procedure_key);
    visitedRaw.push({ date, island: {
      id: `visited:${item.id}`, kind: "visited", state: "visited", order: 0, place: PLACE_NAME_SAFE(categoryOf(hintOf(item.procedure_key))), title,
      subtitle: [item.tooth ? `${PASSAGE.tooth} ${item.tooth}` : null, date || null].filter(Boolean).join(" · ") || null, category: categoryOf(hintOf(item.procedure_key)),
      itemId: item.id, item, checkpoints: [], youPay: claim?.patient_paid_cents ?? null, planPays: claim?.plan_paid_cents ?? null, upperBound: false, missing: [],
      notices: claim ? [] : [PASSAGE.planPaidNotProvided], soundingsAfter: null, claim, stageIds: stagesFor(item),
    } });
  }
  for (const claim of claims.filter((c) => !usedClaims.has(c.id))) {
    const title = procName(claim.procedure_key);
    visitedRaw.push({ date: claim.date, island: {
      id: `visited:${claim.id}`, kind: "visited", state: "visited", order: 0, place: PLACE_NAME_SAFE(categoryOf(hintOf(claim.procedure_key))), title,
      subtitle: [claim.tooth ? `${PASSAGE.tooth} ${claim.tooth}` : null, claim.date].filter(Boolean).join(" · "), category: categoryOf(hintOf(claim.procedure_key)),
      checkpoints: [], youPay: claim.patient_paid_cents ?? null, planPays: claim.plan_paid_cents, upperBound: false, missing: [], notices: [], soundingsAfter: null, claim, stageIds: [],
    } });
  }
  visitedRaw.sort((a, b) => a.date.localeCompare(b.date));
  const visited = visitedRaw.map((v, j) => ({ ...v.island, order: j + 1 }));

  // ---- marginal (consultation-mentioned; rules only, never an amount) ----
  const marginal: IslandVM[] = items.filter((i) => i.status === "consultation_mentioned").map((item, j) => {
    const rule = rules.find((r) => r.procedure_key === item.procedure_key);
    const category = categoryOf(hintOf(item.procedure_key));
    const id = `marginal:${item.id}`;
    const title = item.procedure_name || procName(item.procedure_key);
    const closed = rule?.covered === false;
    const st = closed ? stitchForCiteLike(rule?.exclusion?.cite ?? null, stitches) : undefined;
    const checkpoints: InsuranceCheckpointVM[] = closed ? [{
      key: `${id}:X`, rule: "X", term: PASSAGE.notCoveredExcluded, place: CHECKPOINT_PLACE.X, glyph: "closed", amountIn: null, change: null, amountOut: null, owner: "info",
      explanation: rule?.exclusion?.text ?? "", stitchLabel: st ? `${st.doc}#p${st.page}` : null, stitch: st, badge: st ? "DOC" : rule ? "DOC" : "UNKNOWN", stepIndexes: [], flags: [],
    }] : [];
    return {
      id, kind: "marginal", state: "mentioned", order: j + 1, place: PLACE_NAME_SAFE(category), title, subtitle: item.tooth ? `${PASSAGE.tooth} ${item.tooth}` : null, category,
      itemId: item.id, item, checkpoints, youPay: null, planPays: null, upperBound: false, missing: [],
      notices: [closed ? PASSAGE.marginalClosed : PASSAGE.marginalOpen], soundingsAfter: null, stageIds: stagesFor(item),
    };
  });

  // ---- START and destination (§3.4) ----
  const planStage = stages.find((s) => s.finance?.kind === "plan_details");
  const noLines = !!estimate && lines.length === 0;
  const networkStatus = estimate?.inputs.network_status;
  const startNotices: string[] = [];
  if (noLines) startNotices.push(PASSAGE.waiting);
  if (estimate && networkStatus === "UNKNOWN") startNotices.push(PASSAGE.networkUnknown);
  const start: IslandVM = {
    id: "start", kind: "start", state: "frame", order: 0, place: planStage?.island ?? START_PLACE, title: planStage?.title ?? PASSAGE.startTitle,
    subtitle: `${planDisplayCode(planRef, plan)} · ${networkWord(estimate?.inputs.network ?? (benefits as { network_default?: string } | null)?.network_default)}`, category: null,
    checkpoints: [], youPay: null, planPays: null, upperBound: false, missing: noLines ? globalMissing : [], notices: startNotices,
    soundingsAfter: benefits ? { deductible: benefits.remaining_deductible_cents ?? null, annualMax: benefits.remaining_max_cents ?? null, unlimited } : null,
    stageIds: planStage ? [planStage.id] : [],
  };
  const lastLinked = (() => { let k = -1; stages.forEach((s, i) => { if ((s.linked_treatment_items ?? []).some((ref) => routeItems.some((it) => itemRef(it) === ref || it.id === ref))) k = i; }); return k; })();
  const afterIds = stages.filter((_, i) => i > lastLinked).map((s) => s.id);
  const lastStage = stages[stages.length - 1];
  if (lastStage && !afterIds.includes(lastStage.id)) afterIds.push(lastStage.id);
  const lastLine = [...lines].reverse().find((l) => l.status !== "unresolved");
  const destination: IslandVM = {
    id: "destination", kind: "destination", state: estimate?.status === "unresolved" ? "unresolved" : "frame", order: islands.length + 1, place: LIGHT_PLACE, title: PASSAGE.lightTitle,
    subtitle: lastStage ? `${lastStage.title} · ${lastStage.island}` : null, category: null, checkpoints: [],
    youPay: estimate?.status === "estimate" ? estimate.user_estimated_payment_cents : null, planPays: estimate?.status === "estimate" ? estimate.insurer_estimated_payment_cents : null,
    upperBound: !!estimate?.plan_payment_is_upper_bound, missing: estimate?.status === "unresolved" ? globalMissing : [],
    notices: [estimate?.ledger.order_note, estimate?.status === "unresolved" ? PASSAGE.waiting : null].filter((x): x is string => !!x),
    soundingsAfter: lastLine ? { deductible: lastLine.remaining_after?.deductible_cents ?? null, annualMax: lastLine.remaining_after?.annual_max_cents ?? null, unlimited } : null,
    stageIds: afterIds,
  };

  const status: PassageVM["status"] = !estimate ? (routeItems.length ? "pending" : "empty") : estimate.status;
  return {
    status, start, islands, visited, marginal, destination,
    totals: { youPay: destination.youPay, planPays: destination.planPays, upperBound: destination.upperBound, range: estimate?.movers?.range ?? null },
    stepsCited: lines.flatMap((l) => l.steps).filter((s) => s.stitch).length,
    rulesNotStated: new Set(estimate?.unknowns ?? []).size,
  };
}

function PLACE_NAME_SAFE(category: ReturnType<typeof categoryOf>): string {
  return placeName(category, new Map());
}
function stitchForCiteLike(cite: { page: number; quote: string; doc?: string } | null, stitches: Stitch[]): Stitch | undefined {
  if (!cite) return undefined;
  return stitches.find((s) => (!cite.doc || s.doc === cite.doc) && s.page === cite.page && s.quote === cite.quote) ?? stitches.find((s) => (!cite.doc || s.doc === cite.doc) && s.page === cite.page);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Answers log rows (§2.4) — pure so the component is a thin <dl>
// ---------------------------------------------------------------------------------------------------------------------------------

export type AnswerTarget = "stage" | "island" | "light" | "checkpoint" | "documents";
/** `calc`: the row prints engine totals, so it carries the "Calculated from the clauses cited" mark beside it (finding info-only-5). */
export interface AnswerRow { key: string; dt: string; dd: string; title?: string; target: AnswerTarget; calc?: boolean }

export function answersLog(vm: PassageVM, view: JourneyView | null, plan: PlanFixture | null, estimate: SavedEstimate | null, recalculating = false): AnswerRow[] {
  const s = (n: number) => (n === 1 ? "" : "s");
  const cur = view?.progress.stages.find((x) => x.id === view.progress.current_stage);
  const where = cur ? `${cur.title} · ${cur.label}` : PASSAGE.noStages;
  const n = vm.islands.length;
  const route = n === 0 ? PASSAGE.noPlanned : `${n} ${PASSAGE.procedure}${s(n)}${vm.visited.length ? `, ${vm.visited.length} ${PASSAGE.completedOnStatement}` : ""}`;
  let cost: string, calc = false;
  if (recalculating) cost = PASSAGE.recalculating;
  else if (!estimate) cost = PASSAGE.noEstimate;
  else if (estimate.status !== "estimate" || estimate.user_estimated_payment_cents == null) cost = PASSAGE.waitingInputs(estimate.missing_inputs.length);
  else {
    const hypo = Object.keys(estimate.inputs?.hypotheticals ?? {}).length > 0;
    cost = `${moneyText(estimate.user_estimated_payment_cents)} · ${PASSAGE.plan} ${moneyText(estimate.insurer_estimated_payment_cents)}${estimate.plan_payment_is_upper_bound ? ` ${PASSAGE.upperBoundParen}` : ""}${hypo ? ` ${PASSAGE.withHypothetical}` : ""}`;
    calc = true;
  }
  const rulesRow = `${vm.stepsCited} ${PASSAGE.step}${s(vm.stepsCited)} ${PASSAGE.cited} · ${vm.rulesNotStated} ${PASSAGE.rule}${s(vm.rulesNotStated)} ${PASSAGE.notStated}`;
  const from = plan ? `${plan.source_document.version_label} · ${plan.source_document.title}${plan.is_fictional ? ` · ${PASSAGE.fictional}` : ""}` : PASSAGE.noPlan;
  return [
    { key: "where", dt: PASSAGE.whereYouAre, dd: where, target: "stage" },
    { key: "route", dt: PASSAGE.onTheRoute, dd: route, target: "island" },
    { key: "cost", dt: PASSAGE.estimatedYouPay, dd: cost, target: "light", calc },
    { key: "rules", dt: PASSAGE.rulesApplied, dd: rulesRow, target: "checkpoint" },
    { key: "from", dt: PASSAGE.from, dd: from, title: from, target: "documents" },
  ];
}
/** Text money for accessible names and log rows (the visible figures on the map render through <Money>). */
export const moneyText = (c: number | null | undefined) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const signedText = (c: number | null | undefined) => (c == null ? "—" : c < 0 ? `−${moneyText(-c)}` : c === 0 ? "$0.00" : `+${moneyText(c)}`);

/** The visible name on a small chart chip (visited islets): the procedure's own name without its parenthetical or the clause after a
 *  comma ("Adult cleaning (prophylaxis)" → "Adult cleaning"; "Resin composite filling, two surfaces, posterior tooth" → "Resin composite
 *  filling"), so it fits two lines instead of being cut. The full name stays in the accessible name and the title. */
export function chipTitle(title: string): string {
  const short = title.replace(/\s*\([^)]*\)\s*/g, " ").split(",")[0].replace(/\s+/g, " ").trim();
  return short || title;
}

/** The Harbor Light's words when it has no total (numbers-5): "waiting for information" only when a planned procedure is actually waiting;
 *  with no planned procedure on the route (Jordan, the empty journey) nothing is waiting, so it says no estimate was calculated. */
export function lightWaitWord(vm: Pick<PassageVM, "islands" | "status">): string {
  return vm.islands.length === 0 || vm.status === "empty" ? PASSAGE.noEstimateCalculated : PASSAGE.waitingLower;
}

/** The amount words on an island button (§3.2). */
export function islandAmountText(isl: IslandVM): string {
  if (isl.kind === "visited") return isl.planPays == null ? PASSAGE.planPaidNotProvided : `${PASSAGE.planPaid} ${moneyText(isl.planPays)}`;
  if (isl.kind === "marginal") return isl.checkpoints.length ? PASSAGE.notCoveredLower : PASSAGE.noEstimateCalculated;
  if (isl.state === "estimate") return `${PASSAGE.youPay} ${moneyText(isl.youPay)}`;
  if (isl.state === "not_covered") return `${PASSAGE.notCoveredLower} · ${moneyText(isl.youPay)}`;
  return PASSAGE.waitingLower;
}
/** Full-fact accessible name for a checkpoint (addendum B1 graft). */
export function checkpointAria(cp: InsuranceCheckpointVM): string {
  const facts: string[] = [];
  if (cp.rule === "missing") facts.push(cp.explanation || PASSAGE.waitingLower);
  else if (cp.rule === "fee" || cp.rule === "total") facts.push(moneyText(cp.amountOut));
  else if (cp.rule === "X" || cp.rule === "W" || cp.rule === "F") facts.push(cp.amountOut != null ? `${PASSAGE.youPay} ${moneyText(cp.amountOut)}` : cp.explanation);
  else if (cp.split) facts.push(`${PASSAGE.plan} ${cp.split.planPct}% ${moneyText(cp.split.plan)}`, `${PASSAGE.you} ${100 - cp.split.planPct}% ${moneyText(cp.split.patient)}`);
  else if (cp.rule === "L") facts.push(signedText(cp.change));
  else { facts.push(cp.change === 0 ? PASSAGE.noChange : signedText(cp.change)); if (cp.amountOut != null) facts.push(`${PASSAGE.amountOut} ${moneyText(cp.amountOut)}`); }
  if (cp.owner === "nobody" && cp.change) facts.push(PASSAGE.notOwedByYou);
  if (cp.stitch) facts.push(`${PASSAGE.clause} ${cp.stitch.doc} ${PASSAGE.page} ${cp.stitch.page}`);
  return `${cp.term}: ${facts.join(", ")}`;
}


// ---------------------------------------------------------------------------------------------------------------------------------
// Phone route (the cinematic passage): the stops are HTML, the line is measured from them
// ---------------------------------------------------------------------------------------------------------------------------------

/** One painted plate in its own box (ProcedureIsland): centre, radius, the plate rectangle and the optional compound count badge. */
export interface IslandLayout {
  id: string; cx: number; cy: number; r: number;
  compound: boolean; badge: { x: number; y: number };
  plate: { x: number; y: number; w: number; h: number; slot: string; scale: number };
}
export interface RouteSegment { d: string; closed: boolean; from: string; to: string }
/** A route stop measured from the page: `closed` marks a stop that belongs to a not-covered island (the channel leaving it is closed). */
export interface RoutePoint { id: string; x: number; y: number; closed: boolean }

/** From four islands on, the route is dense (spec §3.8). */
export const denseFrom = (n: number) => n >= 4;

/**
 * The route through the measured stops, one segment per leg (so the pen can draw leg by leg). The coast runs downward, so each leg is a
 * cubic with vertical tangents at both stops: straight along a run of checkpoint markers, an S-curve between the lane and an island's
 * shore, and never an overshoot past the column edge. A leg leaving a stop of a not-covered island is the closed channel.
 */
export function smoothRoute(points: RoutePoint[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dy = Math.max(12, Math.abs(b.y - a.y)) * 0.5;
    const f = (n: number) => n.toFixed(1);
    const d = a.x === b.x ? `M ${f(a.x)} ${f(a.y)} L ${f(b.x)} ${f(b.y)}`
      : `M ${f(a.x)} ${f(a.y)} C ${f(a.x)} ${f(a.y + dy)}, ${f(b.x)} ${f(b.y - dy)}, ${f(b.x)} ${f(b.y)}`;
    out.push({ d, closed: a.closed, from: a.id, to: b.id });
  }
  return out;
}
