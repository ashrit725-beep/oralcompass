import { TRAIL } from "./copy";
import type { LedgerLine, Step } from "./types";

/** One step of the cost trail (the lighthouse). Every step shows: amount in, the rule, the change, amount out, an explanation and the clause stitch. */
export interface TrailStep {
  key: string; title: string; amountIn: number | null; change: number | null; amountOut: number | null; owner: "patient" | "plan" | "nobody" | "basis" | "info";
  rule: string; explanation: string; stitch: string | null; split?: { plan: number; patient: number; planPct: number };
}
export interface Trail { steps: TrailStep[]; fee: number | null; youPay: number | null; planPays: number | null; reconciles: boolean | null; status: LedgerLine["status"]; upperBound: boolean }

const find = (steps: Step[], pred: (s: Step) => boolean) => steps.find(pred);

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
             steps: [{ key: "wait", title: "Waiting for information", amountIn: null, change: null, amountOut: null, owner: "info", rule: "?", explanation: line.flags.join(" "), stitch: null }] };
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
  const planPct = after > 0 ? Math.round((planPre / after) * 100) : 0;
  const netOwedByYou = net?.owner === "patient";
  const steps: TrailStep[] = [
    { key: "fee", title: TRAIL.fee, amountIn: null, change: null, amountOut: fee, owner: "info", rule: "fee", explanation: "What the dentist charges, as written on the estimate.", stitch: null },
    { key: "allowed", title: TRAIL.allowed, amountIn: fee, change: -(net?.cents ?? 0), amountOut: allowed, owner: netOwedByYou ? "patient" : "nobody", rule: "N", stitch: net?.stitch ?? null,
      explanation: net?.cents ? (netOwedByYou ? "Out-of-network: the amount above the allowed amount may be billed to you." : "In-network: the dentist accepts the allowed amount; the difference is not owed by you.") : "The allowed amount equals the fee." },
  ];
  if (abBasis) steps.push({ key: "alternate", title: TRAIL.alternate, amountIn: allowed, change: abBasis.cents, amountOut: basis, owner: "basis", rule: "AB", stitch: abBasis.stitch, explanation: "The plan pays on the less costly alternative's allowance; the difference becomes your share below." });
  steps.push({ key: "deductible", title: TRAIL.deductible, amountIn: basis, change: -dedC, amountOut: after, owner: "patient", rule: "D", stitch: ded?.stitch ?? null,
               explanation: dedC ? "Applied to your remaining deductible — your share." : "No deductible applied to this line (waived for this class, or already met per your records)." });
  steps.push({ key: "share", title: TRAIL.share, amountIn: after, change: -patCo, amountOut: planPre, owner: "plan", rule: "CO", stitch: coPlan?.stitch ?? coPat?.stitch ?? null, split: { plan: planPre, patient: patCo, planPct },
               explanation: `The plan pays ${planPct}% of the amount after the deductible; your share is ${100 - planPct}%.` });
  steps.push({ key: "max", title: TRAIL.max, amountIn: planPre, change: -(beyond?.cents ?? 0), amountOut: planPay, owner: beyond ? "patient" : "plan", rule: "M", stitch: beyond?.stitch ?? null,
               explanation: beyond ? "Part of the plan share exceeds the plan's remaining annual maximum — that part is your share." : "Within the plan's remaining annual maximum (or no maximum applies) — no adjustment." });
  const extra = listed.reduce((a, s) => a + s.cents, 0);
  const youPay = dedC + patCo + (beyond?.cents ?? 0) + (abDiff?.cents ?? 0) + (netOwedByYou ? (net?.cents ?? 0) : 0) + extra;
  steps.push({ key: "you", title: TRAIL.you, amountIn: fee, change: null, amountOut: youPay, owner: "patient", rule: "total", stitch: null,
               explanation: ["deductible", "your share of the split", beyond ? "amount beyond the maximum" : null, abDiff ? "alternate-benefit difference" : null, netOwedByYou && net?.cents ? "amount above the allowed amount" : null, extra ? "items listed on your estimate" : null]
                 .filter(Boolean).join(" + ") + " = what you pay." });
  const reconciles = youPay === line.patient_cents && planPay === line.plan_cents && fee === allowed + (net?.cents ?? 0) && (netOwedByYou ? fee === youPay + planPay - extra : fee === youPay + planPay + (net?.cents ?? 0) - extra);
  return { status: line.status, upperBound: line.plan_is_upper_bound, fee, youPay, planPays: planPay, reconciles, steps };
}
