/**
 * Pure helpers for the procedure drawer, the dollar pipeline and clause evidence (spec §3.3, §4.4, §4.5). Owner: drawer + pipeline agent.
 * Nothing here computes money: amounts come from the engine's steps through `buildTrail` (lib/trail.ts); these functions only look up
 * rules, resolve the clause stitch behind a checkpoint (the rule row's exact cite first, the engine's page label second) and format words.
 */
import { checkpointEvidence } from "./checkpoints";
import { UI } from "./copy";
import { DRAWER } from "./copy/drawer";
import { money, plainNote, signed, stitchForCite, stitchForStep } from "./stitches";
import { dollarsToCents } from "./plan-catalog";
import { buildTrail, type Trail, type TrailStep } from "./trail";
import type { Benefits, CheckpointRule, Cite, CoverageRule, Evidence, InsuranceCheckpointVM, LedgerLine, MissingInput, Movers, PlanFixture, SavedEstimate, Stitch, TreatmentItem } from "./types";

export type DrawerSectionKey =
  | "procedure" | "allowance" | "deductible" | "share" | "annualMax" | "frequency" | "waiting" | "alternate" | "exclusions" | "finalCost" | "calculation" | "evidence" | "ask";

/** The coverage rule row for a procedure key, if the plan's rules include it. */
export function ruleFor(rules: CoverageRule[], key: string | undefined | null): CoverageRule | undefined {
  return key ? rules.find((r) => r.procedure_key === key) : undefined;
}

/** Frequency clock → words (spec §4.4 section 6). Unknown clocks are shown as written. */
export function clockWords(clock: string, n: number): string {
  switch (clock) {
    case "calendar_count": return DRAWER.clockCalendar;
    case "interval_months": return DRAWER.clockInterval(n);
    case "rolling12_count": return DRAWER.clockRolling;
    case "per_tooth_months": return DRAWER.clockPerTooth(n);
    case "per_quadrant_months": return DRAWER.clockPerQuadrant(n);
    case "lifetime": return DRAWER.clockLifetime;
    default: return clock.replace(/_/g, " ");
  }
}

/** Alternate-benefit condition → words (spec §4.4 section 8). */
export function conditionWords(condition: string): string {
  switch (condition) {
    case "molar": return DRAWER.condMolar;
    case "mandibular_molar": return DRAWER.condMandibularMolar;
    case "posterior": return DRAWER.condPosterior;
    case "any": return DRAWER.condAny;
    case "upper_second_third_or_lower_molar": return DRAWER.condUpperSecondThird;
    default: return DRAWER.condOther(condition.replace(/_/g, " "));
  }
}

/** Which drawer section a checkpoint rule belongs to (checkpoint strip → section scroll). */
export function sectionForRule(rule: CheckpointRule): DrawerSectionKey {
  switch (rule) {
    case "fee": return "procedure";
    case "N": case "missing": return "allowance";
    case "AB": return "alternate";
    case "D": return "deductible";
    case "CO": return "share";
    case "M": return "annualMax";
    case "X": return "exclusions";
    case "W": return "waiting";
    case "F": return "frequency";
    case "L": case "total": default: return "finalCost";
  }
}

/** The rule row's exact cite for a checkpoint rule (spec §3.3 "Badge / stitch" column). */
export function citeForRule(rule: CheckpointRule, row: CoverageRule | undefined, plan: PlanFixture): Cite | null | undefined {
  switch (rule) {
    case "N": return plan.oon_rule?.cite;
    case "AB": return row?.alternate_benefit?.cite ?? plan.alternate_benefit?.cite;
    case "D": return row?.deductible_cite ?? plan.deductible_individual.cite;
    case "CO": return row?.coverage_cite;
    case "M": return row?.annual_max_cite ?? plan.annual_max.cite;
    case "X": return row?.exclusion?.cite;
    case "W": return row?.waiting?.cite ?? plan.waiting_months.cite;
    case "F": return row?.frequency?.[0]?.cite;
    default: return undefined;
  }
}

/** Stitch behind a checkpoint: the rule row's exact cite first, then the engine's `${doc}#p${page}` label. */
export function stitchForCheckpoint(rule: CheckpointRule, stepStitchLabel: string | null, row: CoverageRule | undefined, plan: PlanFixture, stitches: Stitch[]): Stitch | undefined {
  const doc = plan.source_document.version_label;
  const byCite = stitchForCite(citeForRule(rule, row, plan), stitches, doc);
  if (byCite) return byCite;
  if (!stepStitchLabel) return undefined;
  return stitchForStep({ label: "", cents: 0, owner: "", rule, stitch: stepStitchLabel }, stitches);
}

/** Trail key → checkpoint rule (the trail's keys are the engine's rules arranged in order). */
export function ruleForTrailStep(step: TrailStep): CheckpointRule {
  const r = step.rule;
  if (r === "fee" || r === "N" || r === "AB" || r === "D" || r === "CO" || r === "M" || r === "L" || r === "total" || r === "X" || r === "W" || r === "F") return r;
  return "missing";
}

/** Checkpoint place names (spec §3.3). */
export const CHECKPOINT_PLACE: Record<CheckpointRule, string> = {
  fee: "the quay", N: "the reef", AB: "the point", D: "the crossing", CO: "the strait", M: "the gate", L: "the ledger", total: "the landing",
  X: "the closed channel", W: "the closed channel", F: "the closed channel", missing: "the fog bank",
};
/** Checkpoint glyph characters (spec §5.6); drawn as SVG paths by components/pipeline/RuleGlyph.tsx, never as text. */
export const CHECKPOINT_GLYPH: Record<CheckpointRule, string> = {
  fee: "§", N: "≈", AB: "⇄", D: "◐", CO: "◑", M: "▲", L: "≡", total: "●", X: "⊘", W: "⊘", F: "⊘", missing: "?",
};

/** The amount words printed on a checkpoint marker (spec §3.3 "Amount shown on the marker"). */
export function checkpointAmountWords(cp: { rule: CheckpointRule; change: number | null; amountOut: number | null; split?: { planPct: number } }): string {
  switch (cp.rule) {
    case "fee": case "total": case "X": case "W": case "F": return money(cp.amountOut);
    case "CO": return cp.split ? `plan ${cp.split.planPct}% · you ${100 - cp.split.planPct}%` : money(cp.amountOut);
    case "M": return cp.change ? signed(cp.change) : DRAWER.withinMax;
    case "missing": return DRAWER.waitingInfo;
    default: return signed(cp.change);
  }
}

/** The whole-fact accessible name for a checkpoint (addendum B1: "Deductible: no change, amount out $980.00, clause ML26 page 25"). */
export function checkpointAriaName(cp: InsuranceCheckpointVM): string {
  const change = cp.change == null ? "" : cp.change === 0 ? `, ${DRAWER.noChange}` : `, change ${signed(cp.change)}`;
  const out = cp.amountOut == null ? (cp.rule === "missing" ? `, ${DRAWER.waitingInfo}` : "") : `, amount out ${money(cp.amountOut)}`;
  const clause = cp.stitch ? `, clause ${cp.stitch.doc} ${cp.stitch.pageNote ?? `page ${cp.stitch.page}`}` : "";
  return `${cp.term}${change}${out}${clause}`;
}

/**
 * Build the insurance checkpoints for one ledger line from `buildTrail` (spec §3.3). Fee, Allowed, Deductible, Share, Maximum and You pay are
 * always present on an estimate line (a zero change is itself information); Alternate only when an AB step exists. Not covered → Fee + one
 * closed checkpoint + You pay; unresolved → one "Waiting for information" checkpoint.
 */
export function checkpointsForLine(line: LedgerLine, item: TreatmentItem | undefined, row: CoverageRule | undefined, plan: PlanFixture, stitches: Stitch[], missing: MissingInput[] = [], benefits: Benefits | null = null): InsuranceCheckpointVM[] {
  const trail: Trail = buildTrail(line);
  if (line.status === "unresolved") {
    const flags = line.flags.map(plainNote);
    return [{ key: "missing", rule: "missing", term: DRAWER.waitingInfo, place: CHECKPOINT_PLACE.missing, glyph: CHECKPOINT_GLYPH.missing, amountIn: null, change: null, amountOut: null,
              owner: "info", explanation: [...missing.map((m) => `${plainNote(m.input)}: ${m.how}`), ...flags].join(" "), stitchLabel: null, badge: "UNKNOWN", stepIndexes: [], flags }];
  }
  const share = trail.steps.find((s) => ruleForTrailStep(s) === "CO");
  const shareHasStitch = !!(share && stitchForCheckpoint("CO", share.stitch, row, plan, stitches));
  return trail.steps.map((s, i) => {
    const rule = ruleForTrailStep(s);
    const stitch = stitchForCheckpoint(rule, s.stitch, row, plan, stitches);
    // the same evidence rule as the map and the drawer strip (lib/checkpoints; finding web-correctness-25)
    const badge: Evidence = checkpointEvidence(rule, stitch, { item, benefits, shareHasStitch });
    const stepIndexes = line.steps.map((st, j) => (st.rule === rule || (rule === "CO" && st.rule === "CO")) ? j : -1).filter((j) => j >= 0);
    const flags = rule === "W" ? line.flags.filter((f) => /waiting/i.test(f)) : rule === "AB" ? line.flags.filter((f) => /alternate/i.test(f)) : [];
    return { key: `${s.key}-${i}`, rule, term: s.title, place: CHECKPOINT_PLACE[rule], glyph: CHECKPOINT_GLYPH[rule], amountIn: s.amountIn, change: s.change, amountOut: s.amountOut,
             owner: s.owner, explanation: s.explanation, stitchLabel: s.stitch, stitch, badge, stepIndexes, flags, split: s.split };
  });
}

/** `Benefits.claims` entries are untyped on the frozen type; this is the shape the API writes (fixtures/users/*.json). */
export interface ClaimRow { id: string; date: string; procedure_key: string; tooth?: string | null; dentist_fee_cents?: number | null; allowed_cents?: number | null; plan_paid_cents?: number | null; patient_paid_cents?: number | null; deductible_applied_cents?: number | null; source?: string }
export const claimsOf = (claims: unknown[] | undefined | null): ClaimRow[] => (Array.isArray(claims) ? (claims as ClaimRow[]) : []);

/**
 * The allowed amount the drawer shows (numbers-4): the item's recorded figure with its own status; otherwise, on an estimate line whose
 * engine trail resolved the allowed amount from the plan's own allowance schedule (a cited step, e.g. HB26 Appendix A), that engine figure
 * as DOC; otherwise nothing (UNKNOWN). Never "Not provided" beside a total the engine computed from a cited allowance.
 */
export function allowedFigure(item: TreatmentItem | undefined, line: LedgerLine | undefined, allowedStep: { amountOut: number | null; stitch: string | null } | undefined, fallback: Evidence = "UNKNOWN"): { cents: number | null; evidence: Evidence; fromPlan: boolean } {
  if (item?.allowed_cents != null) return { cents: item.allowed_cents, evidence: (item.allowed_status as Evidence) || "USER", fromPlan: false };
  if (line?.status === "estimate" && allowedStep?.amountOut != null && allowedStep.stitch) return { cents: allowedStep.amountOut, evidence: "DOC", fromPlan: true };
  return { cents: null, evidence: fallback, fromPlan: false };
}

/** Network words from the estimate's inputs. */
export function networkWord(network: string | null | undefined): string | null {
  return network === "in" ? DRAWER.inNetwork : network === "out" ? DRAWER.outNetwork : null;
}

/** Fee × quantity for display of the item's own fee (the engine multiplies the same way in records.lines_from_items; nothing new is computed). */
export const itemFeeCents = (item: TreatmentItem | undefined): number | null => (item ? item.dentist_fee_cents * (item.quantity || 1) : null);

/**
 * The evidence of the figures a calculated total rests on, besides the document's clauses (which appear as stitch chips): the dentist's fee
 * and the allowed amount as entered (USER, or ASSUMED for a hypothetical), the statement figures (USER) and any engine assumption (ASSUMED).
 * Orchestrator note 1: an engine total is never labelled "From the plan document" on its own; no seventh evidence status is added.
 */
export function calcInputs(item: TreatmentItem | undefined, estimate: SavedEstimate | null | undefined, benefits?: Benefits | null): Evidence[] {
  const out = new Set<Evidence>();
  if (item || benefits || (estimate && estimate.inputs.treatment_item_ids.length)) out.add("USER");
  const a = item?.allowed_status;
  if (a === "ASSUMED") out.add("ASSUMED");
  if (estimate && (estimate.assumptions.length > 0 || Object.keys(estimate.inputs.hypotheticals ?? {}).length > 0)) out.add("ASSUMED");
  return [...out];
}

/**
 * Remaining deductible / annual maximum before one ledger line (demo-4): the statement's figure for the first line, otherwise the previous
 * line's `remaining_after` (the engine applies the lines in order, so the crown starts from what the root canal left). Mirrors
 * api/app/assistant.py `_remaining_before`. `calculated` marks the second case (derived from the statement and the earlier lines).
 */
export function remainingBeforeLine(which: "deductible" | "max", lineIndex: number | undefined, lines: LedgerLine[], benefits: Benefits | null): { cents: number | null; calculated: boolean } {
  const fromStatement = which === "deductible" ? benefits?.remaining_deductible_cents ?? null : benefits?.remaining_max_cents ?? null;
  if (lineIndex == null || lineIndex <= 0 || !lines[lineIndex - 1]) return { cents: fromStatement, calculated: false };
  const prev = lines[lineIndex - 1].remaining_after ?? {};
  const cents = which === "deductible" ? prev.deductible_cents ?? null : prev.annual_max_cents ?? null;
  return { cents, calculated: true };
}

/**
 * The movers range sentence (demo-15). The cause names the movers with a measured impact; when several inputs are unknown at once the engine
 * measures none of them alone (every impact is null), so the sentence names all the unknown inputs instead, and drops the "because" clause
 * entirely when there is nothing to name (never "because  was not provided").
 */
export function rangeWords(range: [number, number], movers: Movers["movers"]): string {
  const measured = movers.filter((m) => m.impact_cents).map((m) => m.unknown);
  const names = measured.length ? measured : [...new Set(movers.map((m) => m.unknown).filter((u) => !!u && u.trim()))];
  return names.length ? UI.rangeBecause(money(range[0]), money(range[1]), names.join(" and ")) : DRAWER.rangeOnly(money(range[0]), money(range[1]));
}

/**
 * The drawer's allowed-amount parser (web-correctness-9): the shared strict `dollarsToCents`, plus commas only as thousands separators
 * ("1,5" is refused rather than read as $15.00). Returns cents above zero, or undefined for anything else (the form then says so).
 */
export function parseAllowedCents(input: string): number | undefined {
  if (/,(?!\d{3}(?!\d))/.test(input)) return undefined;
  const cents = dollarsToCents(input);
  return cents != null && cents > 0 ? cents : undefined;
}

/** The plan reference the drawer sends to the API: the app's selected ref first ("upload:<id>" for an uploaded plan, whose model
 *  `plan_code` is only its version label "UP1" and answers 404), then the estimate's, then the model's (web-correctness-23). */
export function drawerPlanRef(selected: string | undefined, estimate: { plan_code: string } | null | undefined, plan: { plan_code: string }): string {
  return selected || estimate?.plan_code || plan.plan_code;
}

/** Missing inputs that name this line (or none) — spec §3.3 "Unresolved". */
export function missingForLine(missing: MissingInput[], line: LedgerLine | undefined): MissingInput[] {
  return missing.filter((m) => !m.line || (line && m.line === line.label));
}

// ---- thread-pull bridge: the last pressed stitch chip's rectangle, read by ClauseCard when no anchorRect prop is given ----
let lastAnchor: DOMRect | null = null;
export function rememberStitchAnchor(rect: DOMRect | null) { lastAnchor = rect; }
export function takeStitchAnchor(): DOMRect | null { const r = lastAnchor; lastAnchor = null; return r; }

/** Scope `stitch` for the assistant uses the engine's page label (`ML26#p25`), not the client's numbered id. */
export const stitchScopeLabel = (s: Stitch) => `${s.doc}#p${s.page}`;
