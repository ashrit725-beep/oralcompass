/**
 * Data → map mapping (design spec §3, addendum §B). Pure functions, unit-tested against the Alex and Sam fixtures.
 *
 * `buildPassage(inputs)` turns the API payloads into a `PassageVM`: START, procedure islands (one per planned treatment item, in ledger
 * order), insurance checkpoints (the `buildTrail` steps in fixed slot order, zero-change rules kept as pass-through markers), visited
 * islands (completed items deduped against the benefit statement's claims), marginal islands (consultation-mentioned items, rules
 * only), fog (unresolved lines, named missing inputs), closed channels (not-covered lines) and soundings (`remaining_after`).
 * The UI never computes an amount: the only arithmetic is the display sums `buildTrail` already reconciles against the engine.
 *
 * `layoutPassage(vm, mode, opts)` places everything in the 1000 × 600 viewBox (§3.8) inside the backdrop's open-water region (addendum
 * §C.1), routes the checkpoints along an arc over each island, and asserts that no two 44 px control rectangles intersect at the
 * binding 854 px plate width (addendum B1/B2/B3): arcs widen, zero-change markers collapse into one hollow "passed" marker, and dense
 * routes degrade to a compound marker per island, in that order. `collisions` is returned (and tested to be empty) rather than thrown.
 */
import { checkpointEvidence } from "./checkpoints";
import { stitchForCheckpoint } from "./drawer";
import { CHECKPOINT_PLACE, CHECKPOINT_TERM, CLOSED_SUFFIX, GLYPH_FOR_RULE, LIGHT_PLACE, SLOT_ORDER, START_PLACE, categoryOf, placeName } from "./islands";
import { PASSAGE } from "./copy/passage";
import { stitchForLabel } from "./stitches";
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
export function checkpointsFor(line: LedgerLine, islandId: string, stitches: Stitch[], item: TreatmentItem | undefined, benefits: Benefits | null, missing: MissingInput[], row?: CoverageRule, plan?: PlanFixture | null): InsuranceCheckpointVM[] {
  const trail = buildTrail(line);
  // the clause behind a step: the coverage rule's exact cite first (as the drawer's pipeline resolves it), then the engine's step label
  const resolve = (rule: CheckpointRule, label: string | null, engineRule: string): Stitch | undefined =>
    (plan ? stitchForCheckpoint(rule, label, row, plan, stitches) : undefined) ?? stitchForLabel(label, engineRule, stitches);
  const mk = (rule: CheckpointRule, s: Partial<InsuranceCheckpointVM>): InsuranceCheckpointVM => ({
    key: `${islandId}:${rule}`, rule, term: CHECKPOINT_TERM[rule], place: CHECKPOINT_PLACE[rule], glyph: GLYPH_FOR_RULE[rule],
    amountIn: null, change: null, amountOut: null, owner: "info", explanation: "", stitchLabel: null, badge: "UNKNOWN", stepIndexes: [], flags: [],
    ...s,
  });
  if (line.status === "unresolved") {
    return [mk("missing", { owner: "info", explanation: missing.length ? missing.map((m) => m.input).join("; ") : line.flags.join(" "), flags: line.flags })];
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
      checkpoints: line ? checkpointsFor(line, id, stitches, item, benefits, missing, rules.find((r) => r.procedure_key === item.procedure_key), plan) : [],
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
export type JourneySegment = "map" | "care" | "overview";

/** Which segment of My journey shows the thing an Answers-log row names (null: it lives on another tab). Stages live in the Care
 *  timeline segment on phones and in the map segment's care rail (or the care segment) on desktop; everything else is on the map. */
export function answerSegment(target: AnswerTarget, mobile: boolean, current: JourneySegment): JourneySegment | null {
  if (target === "documents") return null;
  if (target === "stage") return mobile ? "care" : current === "overview" ? "map" : current;
  return "map";
}
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
  else { cost = `${moneyText(estimate.user_estimated_payment_cents)} · ${PASSAGE.plan} ${moneyText(estimate.insurer_estimated_payment_cents)}${estimate.plan_payment_is_upper_bound ? ` ${PASSAGE.upperBoundParen}` : ""}`; calc = true; }
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
// layoutPassage
// ---------------------------------------------------------------------------------------------------------------------------------

export const VB_W = 1000;
export const VB_H = 600;
/** The binding plate width (desktop with the drawer open) used for the 44 px assertion. */
export const BINDING_PX = 854;
export const TARGET_PX = 44;

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number; id: string }
export interface CheckpointLayout { key: string; x: number; y: number; r: number; passThrough: boolean; collapsedKeys?: string[] }
export interface IslandLayout {
  id: string; cx: number; cy: number; r: number; arcR: number; arcStart: Pt; arcEnd: Pt; sweepStart: number; sweepEnd: number; flip: boolean;
  /** Arc markers (HTML controls) when expanded; empty when compound. */
  checkpoints: CheckpointLayout[];
  /** Compound: one SVG count badge at `badge` (not a control); the island button carries "{k} checkpoints". */
  compound: boolean; badge: Pt;
  button: Rect; plate: { x: number; y: number; w: number; h: number; slot: string; scale: number };
}
export interface RouteSegment { d: string; closed: boolean; from: string; to: string }
export interface SoundingLayout { islandId: string; x: number; y: number }
export interface SmallIslandLayout { id: string; cx: number; cy: number; r: number; button: Rect }
export interface PassageLayout {
  w: number; h: number; mode: "desktop" | "phone"; dense: boolean; collapsed: boolean; plain: boolean;
  start: Pt; destination: Pt; startButton: Rect; destinationButton: Rect; destinationR: number;
  islands: IslandLayout[]; visited: SmallIslandLayout[]; visitedOverflow: number; visitedMore: Rect | null; marginal: SmallIslandLayout[]; marginalOverflow: number;
  /** "+k more mentioned": the marginal islands past the ones drawn (null when none are hidden, or no clear spot on the lower margin). */
  marginalMore: Rect | null;
  route: RouteSegment[]; soundings: SoundingLayout[]; controls: Rect[]; collisions: [string, string][];
}
export interface LayoutOptions { selected?: string | null; widthPx?: number }

const PLATE_ASPECT = 1106 / 1422;
const px2u = (px: number, widthPx: number) => (px * VB_W) / widthPx;
const rectAt = (cx: number, cy: number, w: number, h: number, id: string): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h, id });
export const rectsIntersect = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export function findCollisions(rects: Rect[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rectsIntersect(rects[i], rects[j])) out.push([rects[i].id, rects[j].id]);
  return out;
}

/** Island radius per count (§3.8). */
export const radiusFor = (n: number) => (n === 1 ? 96 : n <= 3 ? 84 : n <= 4 ? 74 : n <= 6 ? 62 : 54);
/** Expanded arcs for every island up to three; from four the route is dense (compound badges, the selected island expands). */
export const denseFrom = (n: number) => n >= 4;

/** Island centres per count, inside the open-water region of the painted backdrop (x ≈ 180–830, y ≈ 100–500; addendum §C.1). */
export function islandCentres(n: number): Pt[] {
  if (n === 0) return [];
  if (n === 1) return [{ x: 500, y: 340 }];
  if (n <= 6) {
    const [x0, span] = n === 2 ? [290, 310] : n === 3 ? [230, 560] : [280, 500];
    const amp = n >= 4 ? 28 : 70;                                   // dense routes flatten so a neighbour's button never meets an arc end
    return Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return { x: x0 + t * span, y: 350 + Math.sin(t * Math.PI * 1.4 + 0.3) * amp }; });
  }
  const perRow = 4, out: Pt[] = [];
  for (let i = 0; i < Math.min(n, 8); i++) {
    const row = Math.floor(i / perRow), k = i % perRow;
    out.push({ x: 250 + (row === 0 ? k : perRow - 1 - k) * (500 / (perRow - 1)), y: row === 0 ? 270 : 470 });
  }
  return out;
}
/** START and the Harbor Light per count: the harbor on the left shore, the Light at the right-hand cove. */
export function framePoints(n: number): { start: Pt; destination: Pt; destinationR: number } {
  if (n === 0) return { start: { x: 180, y: 380 }, destination: { x: 820, y: 380 }, destinationR: 58 };
  if (n === 1) return { start: { x: 150, y: 390 }, destination: { x: 840, y: 400 }, destinationR: 58 };
  if (n === 2) return { start: { x: 118, y: 400 }, destination: { x: 820, y: 410 }, destinationR: 58 };
  if (n === 3) return { start: { x: 150, y: 518 }, destination: { x: 850, y: 460 }, destinationR: 56 };
  if (n >= 7) return { start: { x: 110, y: 370 }, destination: { x: 870, y: 380 }, destinationR: 50 };
  return { start: { x: 120, y: 400 }, destination: { x: 860, y: 430 }, destinationR: 56 };
}

const ARC_CONFIGS = [{ k: 1.35, span: 160 }, { k: 1.5, span: 180 }, { k: 1.7, span: 200 }, { k: 1.9, span: 210 }];
/** Dense routes keep the arc over the top half so its ends stay clear of the neighbours' buttons. */
const DENSE_ARC_CONFIGS = [{ k: 1.5, span: 140 }, { k: 1.7, span: 140 }, { k: 1.9, span: 150 }, { k: 2.1, span: 150 }];
const deg = (d: number) => (d * Math.PI) / 180;

/** Points along an arc over (or, flipped, under) the island: left end → apex → right end. */
function arcPoints(cx: number, cy: number, R: number, span: number, m: number, flip: boolean): { pts: Pt[]; a0: number; a1: number } {
  const a0 = deg(180 + (180 - span) / 2), a1 = deg(360 - (180 - span) / 2);
  const pts = Array.from({ length: m }, (_, j) => {
    const a = m === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * j) / (m - 1);
    const y = cy + Math.sin(a) * R;
    return { x: cx + Math.cos(a) * R, y: flip ? cy - (y - cy) : y };
  });
  return { pts, a0, a1 };
}
const endPt = (cx: number, cy: number, R: number, a: number, flip: boolean): Pt => { const y = cy + Math.sin(a) * R; return { x: cx + Math.cos(a) * R, y: flip ? cy - (y - cy) : y }; };

type Slot = { key: string; passThrough: boolean; collapsedKeys?: string[] };
const isPassThrough = (cp: InsuranceCheckpointVM) => cp.change === 0 && cp.stepIndexes.length === 0 && cp.rule !== "fee" && cp.rule !== "total";

/** Try the arc configurations (then the pass-through collapse) until the island's markers clear `others` and each other. */
function placeArc(isl: IslandVM, cx: number, cy: number, r: number, hit: number, flip: boolean, others: Rect[], configs = ARC_CONFIGS) {
  const attempt = (list: Slot[]) => {
    for (const cfg of configs) {
      const R = cfg.k * r;
      const { pts, a0, a1 } = arcPoints(cx, cy, R, cfg.span, list.length, flip);
      const rects = pts.map((p, j) => rectAt(p.x, p.y, hit, hit, list[j].key));
      const clear = !findCollisions(rects).length && !rects.some((nr) => others.some((o) => rectsIntersect(o, nr)));
      if (clear) return { cps: list.map((c, j) => ({ ...c, x: pts[j].x, y: pts[j].y, r: 0 })), R, a0, a1, rects };
    }
    return null;
  };
  const full: Slot[] = isl.checkpoints.map((cp) => ({ key: cp.key, passThrough: isPassThrough(cp) }));
  let res = attempt(full), collapsed = false;
  if (!res) {
    const pt = isl.checkpoints.filter(isPassThrough);
    if (pt.length >= 2) {
      const list: Slot[] = []; let placed = false;
      for (const cp of isl.checkpoints) {
        if (isPassThrough(cp)) { if (!placed) { list.push({ key: `${isl.id}:passed`, passThrough: true, collapsedKeys: pt.map((c) => c.key) }); placed = true; } continue; }
        list.push({ key: cp.key, passThrough: false });
      }
      res = attempt(list); collapsed = !!res;
    }
  }
  return res ? { ...res, collapsed, ok: true as const } : { ok: false as const };
}

function cubic(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2;
  return `C ${mx.toFixed(1)} ${a.y.toFixed(1)}, ${mx.toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function layoutPassage(vm: PassageVM, mode: "desktop" | "phone", opts: LayoutOptions = {}): PassageLayout {
  const widthPx = opts.widthPx ?? BINDING_PX;
  const u = (px: number) => px2u(px, widthPx);
  const hit = u(TARGET_PX);                                  // 44 px in viewBox units
  const n = vm.islands.length;
  const centres = islandCentres(n);
  const r = radiusFor(n);
  const { start, destination, destinationR } = framePoints(n);
  const selected = opts.selected ?? null;
  const dense = denseFrom(n);
  // island buttons: 152 px so "Crown, porcelain/ceramic" breaks into two whole lines; 72 px tall is the real two-line title + sub + amount
  const btnW = u(dense ? 104 : 152), btnH = hit, islH = u(dense ? 44 : 72);
  const startButton = rectAt(start.x, start.y + u(46), u(150), btnH, "start");
  const destinationButton = rectAt(destination.x, destination.y + destinationR * 0.7 + u(36), u(170), btnH, "destination");

  // visited: a short column on the left shore above START (max 3, then "+k more"); marginal: lower margin right of centre (max 3, then +k)
  // visited chips are 128 × 52 px so a two-line short name fits ("Resin composite filling") instead of truncating
  const visitedW = u(128), visitedH = u(52);
  const vTop = n === 3 ? 44 : 56, vPitch = visitedH + u(4), vCx = u(10) + visitedW / 2;
  const visited: SmallIslandLayout[] = vm.visited.slice(0, 3).map((v, j) => { const cx = vCx, cy = vTop + j * vPitch; return { id: v.id, cx, cy, r: 24, button: rectAt(cx, cy, visitedW, visitedH, v.id) }; });
  const visitedOverflow = Math.max(0, vm.visited.length - 3);
  const visitedMore = visitedOverflow ? rectAt(vCx, vTop + 3 * vPitch - (visitedH - btnH) / 2, visitedW, btnH, "visited:more") : null;
  const maxMarginal = n >= 7 ? 2 : 3;
  // marginal buttons step by their own width (+4 px): a fixed 150/118 pitch let the 152 px buttons overlap once two or three were drawn
  const mPitch = btnW + u(4);
  const marginal: SmallIslandLayout[] = vm.marginal.slice(0, maxMarginal).map((m, j) => { const cx = n >= 7 ? 930 - j * mPitch : 640 - j * mPitch, cy = n >= 7 ? 500 : 512; return { id: m.id, cx, cy, r: 36, button: rectAt(cx, cy + 28 + u(26), btnW, btnH, m.id) }; });
  const marginalOverflow = Math.max(0, vm.marginal.length - maxMarginal);

  // island plates and buttons (fixed), then arcs placed against everything already on the chart
  const fixed: Rect[] = [startButton, destinationButton, ...visited.map((v) => v.button), ...(visitedMore ? [visitedMore] : []), ...marginal.map((m) => m.button)];
  const placedButtons: Rect[] = [];
  const bases = vm.islands.map((isl, i) => {
    const { x: cx, y: cy } = centres[i] ?? { x: 500, y: 350 };
    const major = isl.category === "major" || isl.category === "major_excluded";
    const scale = major ? 3.4 : 3;
    const plate = { x: cx - (scale * r) / 2, y: cy - (scale * r * PLATE_ASPECT) / 2, w: scale * r, h: scale * r * PLATE_ASPECT, slot: major ? "island-major" : "island-generic", scale };
    let button = rectAt(cx, cy + r * 0.75 + u(36) + (islH - btnH) / 2, btnW, islH, isl.id);
    // dense: a button that would touch its neighbour's drops to a second row (or rises above the plate near the bottom edge)
    const prev = i > 0 ? placedButtons[i - 1] : null;
    if (prev && rectsIntersect(prev, button)) {
      const down = prev.y + prev.h + 4 + islH / 2;
      button = down + islH / 2 <= VB_H - 4 ? rectAt(cx, down, btnW, islH, isl.id) : rectAt(cx, cy - r * 0.75 - u(36), btnW, islH, isl.id);
    }
    // the wider (152 px) island buttons slide sideways off the START / Harbor Light buttons instead of touching them
    for (const f of [startButton, destinationButton]) {
      if (!rectsIntersect(f, button)) continue;
      const right = f.x + f.w + u(4) - button.x, left = button.x + button.w - (f.x - u(4));
      button = { ...button, x: button.x + (f.x + f.w / 2 < button.x + button.w / 2 ? right : -left) };
    }
    placedButtons.push(button);
    return { isl, cx, cy, plate, button };
  });
  fixed.push(...bases.map((b) => b.button));
  // a marginal ("mentioned") button that meets an island button slides right along the lower margin (or left at the edge)
  for (const m of marginal) {
    for (const b of bases) {
      if (!rectsIntersect(m.button, b.button)) continue;
      const blockers = fixed.filter((f) => f !== m.button);
      const xs = [b.button.x + b.button.w + u(4), b.button.x - u(4) - m.button.w].filter((x) => x >= 4 && x + m.button.w <= VB_W - 4);
      const x = xs.find((xx) => !blockers.some((f) => rectsIntersect(f, { ...m.button, x: xx })));
      if (x != null) m.button.x = x;
    }
  }
  // marginal islands past the 2–3 drawn get one "+k more" control on the lower margin (they were computed and silently dropped)
  let marginalMore: Rect | null = null;
  if (marginalOverflow > 0) {
    const w = u(112), y = marginal.length ? marginal[marginal.length - 1].button.y : VB_H - btnH - 8;
    for (let x = VB_W - 4 - w; x >= 4 && !marginalMore; x -= u(16)) {
      const rc = { x, y, w, h: btnH, id: "marginal:more" };
      if (!fixed.some((f) => rectsIntersect(f, rc))) marginalMore = rc;
    }
    if (marginalMore) fixed.push(marginalMore);
  }
  let collapsed = false, plain = false;
  const placedRects: Rect[] = [];
  const islands: IslandLayout[] = bases.map(({ isl, cx, cy, plate, button }, i) => {
    const flip = false;
    const expanded = isl.checkpoints.length > 0 && (!dense || isl.id === selected);
    const markerR = n <= 4 ? 9 : 7;
    let cps: CheckpointLayout[] = [], R = 1.35 * r, a0 = deg(190), a1 = deg(350), compound = isl.checkpoints.length > 0;
    if (expanded) {
      const res = placeArc(isl, cx, cy, r, hit, flip, [...fixed, ...placedRects], dense ? DENSE_ARC_CONFIGS : ARC_CONFIGS);
      if (res.ok) { cps = res.cps.map((c) => ({ ...c, r: markerR })); R = res.R; a0 = res.a0; a1 = res.a1; collapsed ||= res.collapsed; compound = false; placedRects.push(...res.rects); }
      else plain = true;                                                      // honest degrade: markers leave the map for this island
    }
    const badge = endPt(cx, cy, R, (a0 + a1) / 2, flip);
    return { id: isl.id, cx, cy, r, arcR: R, arcStart: endPt(cx, cy, R, a0, flip), arcEnd: endPt(cx, cy, R, a1, flip), sweepStart: a0, sweepEnd: a1, flip, checkpoints: cps, compound, badge, button, plate };
  });
  const controls = [...fixed, ...placedRects];

  // route: START → arc(island 1) → … → Light; the segment leaving a not-covered island is the closed channel
  const route: RouteSegment[] = [];
  if (n === 0) route.push({ d: `M ${start.x} ${start.y} L ${destination.x} ${destination.y}`, closed: false, from: "start", to: "destination" });
  else {
    let prev: Pt = start, prevId = "start", prevClosed = false;
    islands.forEach((isl, i) => {
      route.push({ d: `M ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cubic(prev, isl.arcStart)}`, closed: prevClosed, from: prevId, to: isl.id });
      const large = isl.sweepEnd - isl.sweepStart > Math.PI ? 1 : 0;
      route.push({ d: `M ${isl.arcStart.x.toFixed(1)} ${isl.arcStart.y.toFixed(1)} A ${isl.arcR.toFixed(1)} ${isl.arcR.toFixed(1)} 0 ${large} ${isl.flip ? 0 : 1} ${isl.arcEnd.x.toFixed(1)} ${isl.arcEnd.y.toFixed(1)}`, closed: false, from: isl.id, to: isl.id });
      prev = isl.arcEnd; prevId = isl.id; prevClosed = vm.islands[i].state === "not_covered";
    });
    route.push({ d: `M ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${cubic(prev, { x: destination.x - destinationR * 0.95, y: destination.y + 6 })}`, closed: prevClosed, from: prevId, to: "destination" });
  }

  // soundings (two-line lozenge, 120 × 44 px) midway along each leg, probed against the controls; never printed on a control
  // The rect is the lozenge as rendered (160 × 60 px: two figure rows and the badge row) plus a 6 px gap, probed against every control,
  // every island's arc ring (markers) and the soundings already placed; candidates fan out from the leg midpoint toward open water.
  const soundW = u(172), soundH = u(66);
  const soundings: SoundingLayout[] = [];
  const taken: Rect[] = [...controls];
  islands.forEach((isl, i) => {
    if (!vm.islands[i].soundingsAfter) return;
    const next: Pt = islands[i + 1] ? islands[i + 1].arcStart : { x: destination.x - destinationR, y: destination.y };
    const mx = (isl.arcEnd.x + next.x) / 2, yLeg = (isl.arcEnd.y + next.y) / 2;
    const dys = [u(56), u(96), -u(56), u(136), -u(96), u(176)];
    const dxs = [0, -u(36), u(36), -u(72), u(72)];
    let best: Pt | null = null;
    for (const dy of dys) {
      for (const dx of dxs) {
        const x = Math.min(Math.max(mx + dx, soundW / 2 + 4), VB_W - soundW / 2 - 4), y = Math.min(Math.max(yLeg + dy, soundH / 2 + 4), VB_H - soundH / 2 - 4);
        const rc = rectAt(x, y, soundW, soundH, `sounding:${isl.id}`);
        if (!taken.some((t) => rectsIntersect(t, rc))) { best = { x, y }; break; }
      }
      if (best) break;
    }
    if (!best) return;                                    // honest degrade: no water left, the figures stay in the drawer and the overview
    taken.push(rectAt(best.x, best.y, soundW, soundH, `sounding:${isl.id}`));
    soundings.push({ islandId: isl.id, x: best.x, y: best.y });
  });

  return { w: VB_W, h: VB_H, mode, dense, collapsed, plain, start, destination, startButton, destinationButton, destinationR, islands, visited, visitedOverflow, visitedMore, marginal, marginalOverflow, marginalMore, route, soundings, controls, collisions: findCollisions(controls) };
}
