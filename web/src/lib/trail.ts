import { TRAIL } from "./copy";
import { plainNote } from "./stitches";
import type { LedgerLine, Step } from "./types";

/** One step of the cost trail (the lighthouse). Every step shows: amount in, the rule, the change, amount out, an explanation and the clause stitch. */
export interface TrailStep {
  key: string; title: string; amountIn: number | null; change: number | null; amountOut: number | null; owner: "patient" | "plan" | "nobody" | "basis" | "info";
  rule: string; explanation: string; stitch: string | null; split?: { plan: number; patient: number; planPct: number };
}
export interface Trail { steps: TrailStep[]; fee: number | null; youPay: number | null; planPays: number | null; reconciles: boolean | null; status: LedgerLine["status"]; upperBound: boolean }

const find = (steps: Step[], pred: (s: Step) => boolean) => steps.find(pred);
/** The percentage the engine printed in a step label ("Plan pays 60% before the annual maximum", "Your share (40% of …)"). */
const pctIn = (s: Step | undefined): number | undefined => { const m = s ? /(\d+(?:\.\d+)?)%/.exec(s.label) : null; return m ? Number(m[1]) : undefined; };

/** Reconstruct the trail from an engine ledger line. The engine's steps are the truth; this only arranges them in the fixed trail order. */
export function buildTrail(line: LedgerLine): Trail {
  const S = line.steps;
  if (line.status === "not_covered") {
    const x = S[0];
    const fee = x?.cents ?? null;
    const title = x?.rule === "W" ? TRAIL.waiting : x?.rule === "F" ? TRAIL.frequency : TRAIL.excluded;
    return {
      status: line.status, upperBound: false, fee, youPay: line.patient_cents, planPays: line.plan_cents, reconciles: fee != null && fee === line.patient_cents,
      steps: [
        { key: "fee", title: TRAIL.fee, amountIn: null, change: null, amountOut: fee, owner: "info", rule: "fee", explanation: "What the dentist charges, as written on the estimate.", stitch: null },
        { key: "x", title, amountIn: fee, change: 0, amountOut: fee, owner: "patient", rule: x?.rule ?? "X", explanation: x?.label ?? "", stitch: x?.stitch ?? null },
        { key: "you", title: TRAIL.you, amountIn: fee, change: null, amountOut: line.patient_cents, owner: "patient", rule: "total", explanation: "The plan pays nothing for this line; the full fee is your share.", stitch: null },
      ],
    };
  }
  if (line.status === "unresolved") {
    return { status: line.status, upperBound: false, fee: null, youPay: null, planPays: null, reconciles: null,
             steps: [{ key: "wait", title: "Waiting for information", amountIn: null, change: null, amountOut: null, owner: "info", rule: "?", explanation: line.flags.map(plainNote).join(" "), stitch: null }] };
  }
  const net = find(S, (s) => s.rule === "N");
  const abBasis = find(S, (s) => s.rule === "AB" && s.owner === "basis");
  const abDiff = find(S, (s) => s.rule === "AB" && s.owner === "patient");
  const ded = find(S, (s) => s.rule === "D");
  const coPat = find(S, (s) => s.rule === "CO" && s.owner === "patient");
  const coPlan = find(S, (s) => s.rule === "CO" && s.owner === "plan_pre");
  const beyond = find(S, (s) => s.rule === "M");
  const listed = S.filter((s) => s.rule === "X");
  const planPre = coPlan?.cents ?? 0, patCo = coPat?.cents ?? 0, dedC = ded?.cents ?? 0;
  const after = planPre + patCo;
  const basis = after + dedC;
  const allowed = basis - (abBasis?.cents ?? 0);          // abBasis.cents is negative: −(allowed − basis)
  const fee = allowed + (net?.cents ?? 0);
  const planPay = planPre - (beyond?.cents ?? 0);
  // The rule's percentage as the engine applied it (its CO step labels), not a ratio of rounded dollars: a deductible that absorbs the whole
  // line (after = 0) used to print "plan pays 0% / you 100%" beside "Your plan lists Type II at 60%" (web-correctness-11).
  const patPct = pctIn(coPat);
  const planPct = pctIn(coPlan) ?? (patPct != null ? 100 - patPct : after > 0 ? Math.round((planPre / after) * 100) : 0);
  const netOwedByYou = net?.owner === "patient";
  const steps: TrailStep[] = [
    { key: "fee", title: TRAIL.fee, amountIn: null, change: null, amountOut: fee, owner: "info", rule: "fee", explanation: "What the dentist charges, as written on the estimate.", stitch: null },
    { key: "allowed", title: TRAIL.allowed, amountIn: fee, change: -(net?.cents ?? 0), amountOut: allowed, owner: netOwedByYou ? "patient" : "nobody", rule: "N", stitch: net?.stitch ?? null,
      explanation: net?.cents ? (netOwedByYou ? "Out-of-network: the amount above the allowed amount may be billed to you." : "In-network: the dentist accepts the allowed amount; the difference is not owed by you.") : "The allowed amount equals the fee." },
  ];
  if (abBasis) steps.push({ key: "alternate", title: TRAIL.alternate, amountIn: allowed, change: abBasis.cents, amountOut: basis, owner: "basis", rule: "AB", stitch: abBasis.stitch, explanation: "The plan pays on the less costly alternative's allowance; the difference becomes your share below." });
  steps.push({ key: "deductible", title: TRAIL.deductible, amountIn: basis, change: -dedC, amountOut: after, owner: "patient", rule: "D", stitch: ded?.stitch ?? null,
               explanation: dedC ? "Applied to your remaining deductible: your share." : "No deductible applied to this line (waived for this class, or already met per your records)." });
  steps.push({ key: "share", title: TRAIL.share, amountIn: after, change: -patCo, amountOut: planPre, owner: "plan", rule: "CO", stitch: coPlan?.stitch ?? coPat?.stitch ?? null, split: { plan: planPre, patient: patCo, planPct },
               explanation: after === 0 && (coPlan || coPat)
                 ? `Nothing remains after the deductible, so the ${planPct}% plan share moves no money on this line.`
                 : `The plan pays ${planPct}% of the amount after the deductible; your share is ${100 - planPct}%.` });
  steps.push({ key: "max", title: TRAIL.max, amountIn: planPre, change: -(beyond?.cents ?? 0), amountOut: planPay, owner: beyond ? "patient" : "plan", rule: "M", stitch: beyond?.stitch ?? null,
               explanation: beyond ? "Part of the plan share exceeds the plan's remaining annual maximum; that part is your share." : "Within the plan's remaining annual maximum (or no maximum applies): no adjustment." });
  const extra = listed.reduce((a, s) => a + s.cents, 0);
  const youPay = dedC + patCo + (beyond?.cents ?? 0) + (abDiff?.cents ?? 0) + (netOwedByYou ? (net?.cents ?? 0) : 0) + extra;
  steps.push({ key: "you", title: TRAIL.you, amountIn: fee, change: null, amountOut: youPay, owner: "patient", rule: "total", stitch: null,
               explanation: ["deductible", "your share of the split", beyond ? "amount beyond the maximum" : null, abDiff ? "alternate-benefit difference" : null, netOwedByYou && net?.cents ? "amount above the allowed amount" : null, extra ? "items listed on your estimate" : null]
                 .filter(Boolean).join(" + ") + " = what you pay." });
  const reconciles = youPay === line.patient_cents && planPay === line.plan_cents && fee === allowed + (net?.cents ?? 0) && (netOwedByYou ? fee === youPay + planPay - extra : fee === youPay + planPay + (net?.cents ?? 0) - extra);
  return { status: line.status, upperBound: line.plan_is_upper_bound, fee, youPay, planPays: planPay, reconciles, steps };
}

// ---------- additive (drawer + pipeline agent): equation rows for "How was this calculated?" (addendum B3 graft) ----------

/** One operand or operator of an equation row. Amounts are the trail's reconciled display sums, never new arithmetic. */
export type EquationPart = { kind: "cents"; cents: number } | { kind: "pct"; pct: number } | { kind: "op"; op: "−" | "+" | "×" | "=" };
export interface EquationRow { key: string; parts: EquationPart[]; result: number | null; label: string; owner: TrailStep["owner"]; stitch: string | null }

const C = (cents: number): EquationPart => ({ kind: "cents", cents });
const OP = (op: "−" | "+" | "×" | "="): EquationPart => ({ kind: "op", op });
const PCT = (pct: number): EquationPart => ({ kind: "pct", pct });

/**
 * Format the trail as equation rows ("$980.00 × 60% = $588.00 plan share"), each ending with the step's stitch label. Every figure is a
 * `TrailStep.amountIn / change / amountOut / split` value (already reconciled against the engine's line totals in `buildTrail`).
 * Labels are passed in by the caller (copy lives in lib/copy/drawer.ts) so this module keeps its single TRAIL import.
 */
export function equationRows(trail: Trail, labels: { fee: string; allowed: string; basis: string; afterDeductible: string; planShare: string; yourShare: string; planPays: string; youPay: string; fullFee: string }): EquationRow[] {
  const by = (key: string) => trail.steps.find((s) => s.key === key);
  const rows: EquationRow[] = [];
  if (trail.status === "unresolved") return rows;
  const fee = by("fee");
  if (fee && fee.amountOut != null) rows.push({ key: "fee", parts: [C(fee.amountOut)], result: fee.amountOut, label: labels.fee, owner: "info", stitch: null });
  if (trail.status === "not_covered") {
    const x = by("x"); const you = by("you");
    if (x && x.amountIn != null) rows.push({ key: "x", parts: [C(x.amountIn)], result: x.amountIn, label: labels.fullFee, owner: "patient", stitch: x.stitch });
    if (you && you.amountIn != null && you.amountOut != null) rows.push({ key: "you", parts: [C(you.amountIn), OP("="), C(you.amountOut)], result: you.amountOut, label: labels.youPay, owner: "patient", stitch: null });
    return rows;
  }
  const allowed = by("allowed"), alt = by("alternate"), ded = by("deductible"), share = by("share"), max = by("max"), you = by("you");
  if (allowed && allowed.amountIn != null && allowed.change != null && allowed.amountOut != null)
    rows.push({ key: "allowed", parts: [C(allowed.amountIn), OP("−"), C(-allowed.change), OP("="), C(allowed.amountOut)], result: allowed.amountOut, label: labels.allowed, owner: allowed.owner, stitch: allowed.stitch });
  if (alt && alt.amountIn != null && alt.change != null && alt.amountOut != null)
    rows.push({ key: "alternate", parts: [C(alt.amountIn), OP("−"), C(-alt.change), OP("="), C(alt.amountOut)], result: alt.amountOut, label: labels.basis, owner: "basis", stitch: alt.stitch });
  if (ded && ded.amountIn != null && ded.change != null && ded.amountOut != null)
    rows.push({ key: "deductible", parts: [C(ded.amountIn), OP("−"), C(-ded.change), OP("="), C(ded.amountOut)], result: ded.amountOut, label: labels.afterDeductible, owner: "patient", stitch: ded.stitch });
  if (share && share.amountIn != null && share.split) {
    rows.push({ key: "share-plan", parts: [C(share.amountIn), OP("×"), PCT(share.split.planPct), OP("="), C(share.split.plan)], result: share.split.plan, label: labels.planShare, owner: "plan", stitch: share.stitch });
    rows.push({ key: "share-you", parts: [C(share.amountIn), OP("×"), PCT(100 - share.split.planPct), OP("="), C(share.split.patient)], result: share.split.patient, label: labels.yourShare, owner: "patient", stitch: share.stitch });
  }
  if (max && max.amountIn != null && max.change != null && max.amountOut != null)
    rows.push({ key: "max", parts: [C(max.amountIn), OP("−"), C(-max.change), OP("="), C(max.amountOut)], result: max.amountOut, label: labels.planPays, owner: max.owner, stitch: max.stitch });
  if (you && you.amountOut != null) {
    const terms: number[] = [];
    if (ded?.change != null) terms.push(-ded.change);
    if (share?.split) terms.push(share.split.patient);
    if (max?.change) terms.push(-max.change);
    if (alt?.change) terms.push(-alt.change);                          // the alternate-benefit difference equals the basis reduction (engine AB pair)
    if (allowed?.owner === "patient" && allowed.change) terms.push(-allowed.change);
    const listed = you.amountOut - terms.reduce((a, b) => a + b, 0);  // items listed on the estimate (engine rule X, owner patient), if any
    if (listed > 0) terms.push(listed);
    const parts: EquationPart[] = [];
    terms.forEach((t, i) => { if (i) parts.push(OP("+")); parts.push(C(t)); });
    parts.push(OP("="), C(you.amountOut));
    rows.push({ key: "you", parts, result: you.amountOut, label: labels.youPay, owner: "patient", stitch: null });
  }
  return rows;
}
