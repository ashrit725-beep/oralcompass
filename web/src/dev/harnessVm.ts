/**
 * DEV ONLY: a minimal PassageVM builder for the drawer harness (web/src/dev/DrawerHarness.tsx), written against the frozen types in
 * lib/types.ts so the drawer can be seen before the map agent's `lib/passage.ts` lands. It follows spec §3.2–§3.4 and §3.7 closely but is
 * not the product's passage model; the integrator keeps the harness hash-gated and the real `buildPassage` feeds the drawer.
 */
import { checkpointsForLine, missingForLine, ruleFor } from "@/lib/drawer";
import type { Benefits, CoverageRule, IslandState, IslandVM, PassageVM, PlanFixture, Procedure, ProcedureCategory, SavedEstimate, Stitch, TreatmentItem } from "@/lib/types";

const PLACE: Record<string, string> = { preventive: "Clearwater Shoal", basic: "Quiet Bay", "basic/major (varies)": "Narrow Strait", major: "High Cliffs", "major/excluded (varies)": "Outer Reef" };
const CATEGORY: Record<string, ProcedureCategory> = { preventive: "preventive", basic: "basic", "basic/major (varies)": "varies", major: "major", "major/excluded (varies)": "major_excluded" };

export interface HarnessInputs { items: TreatmentItem[]; estimate: SavedEstimate | null; rules: CoverageRule[]; plan: PlanFixture; procedures: Procedure[]; benefits: Benefits | null; stitches: Stitch[] }

export function buildHarnessPassage({ items, estimate, rules, plan, procedures, benefits, stitches }: HarnessInputs): PassageVM {
  const proc = (k: string) => procedures.find((p) => p.key === k);
  const plannedIds = estimate ? estimate.inputs.treatment_item_ids : items.filter((i) => i.status === "planned" || i.status === "scheduled").map((i) => i.id);
  const routeItems = plannedIds.map((id) => items.find((i) => i.id === id)).filter((i): i is TreatmentItem => !!i);
  const lines = estimate?.ledger.lines ?? [];
  const counts = new Map<string, number>();
  const islands: IslandVM[] = routeItems.map((item, i) => {
    const line = lines.find((l) => l.treatment_item_id === item.id) ?? lines[i];
    const lineIndex = line ? lines.indexOf(line) : undefined;
    const hint = proc(item.procedure_key)?.category_hint ?? "basic";
    const base = PLACE[hint] ?? "Quiet Bay";
    const n = (counts.get(base) ?? 0) + 1; counts.set(base, n);
    const rule = ruleFor(rules, item.procedure_key);
    const state: IslandState = !line ? (estimate?.status === "unresolved" ? "unresolved" : "pending") : line.status === "estimate" ? "estimate" : line.status === "not_covered" ? "not_covered" : "unresolved";
    const missing = missingForLine(estimate?.missing_inputs ?? [], line);
    return {
      id: item.id, kind: "procedure", state, order: i + 1, place: n > 1 ? `${base} · ${n}` : base,
      title: item.procedure_name ?? proc(item.procedure_key)?.name ?? item.procedure_key, subtitle: [item.tooth ? `tooth ${item.tooth}` : null, item.status].filter(Boolean).join(" · "),
      category: CATEGORY[hint] ?? "basic", itemId: item.id, item, line, lineIndex,
      checkpoints: line ? checkpointsForLine(line, item, rule, plan, stitches, missing) : [],
      youPay: line?.patient_cents ?? null, planPays: line?.plan_cents ?? null, upperBound: !!line?.plan_is_upper_bound, missing, notices: line?.flags ?? [],
      soundingsAfter: line && line.status === "estimate" ? { deductible: line.remaining_after?.deductible_cents ?? null, annualMax: line.remaining_after?.annual_max_cents ?? null, unlimited: !!benefits?.annual_max_unlimited } : null,
      stageIds: [],
    };
  });
  const visited: IslandVM[] = items.filter((i) => i.status === "completed").map((item, j) => ({
    id: item.id, kind: "visited", state: "visited", order: j + 1, place: PLACE[proc(item.procedure_key)?.category_hint ?? "basic"] ?? "Quiet Bay",
    title: item.procedure_name ?? proc(item.procedure_key)?.name ?? item.procedure_key, subtitle: item.appointment_date ?? null, category: null, itemId: item.id, item,
    checkpoints: [], youPay: null, planPays: null, upperBound: false, missing: [], notices: [], soundingsAfter: null, stageIds: [],
    claim: (benefits?.claims ?? []).find((c: { procedure_key: string; date: string }) => c.procedure_key === item.procedure_key && c.date === item.appointment_date),
  }));
  const marginal: IslandVM[] = items.filter((i) => i.status === "consultation_mentioned").map((item, j) => ({
    id: item.id, kind: "marginal", state: "mentioned", order: j + 1, place: "Outer Reef", title: item.procedure_name ?? proc(item.procedure_key)?.name ?? item.procedure_key,
    subtitle: "mentioned at the consultation", category: CATEGORY[proc(item.procedure_key)?.category_hint ?? "basic"] ?? null, itemId: item.id, item,
    checkpoints: [], youPay: null, planPays: null, upperBound: false, missing: [], notices: [], soundingsAfter: null, stageIds: [],
  }));
  const status: PassageVM["status"] = !routeItems.length ? "empty" : !estimate ? "pending" : estimate.status === "estimate" ? "estimate" : "unresolved";
  const frame = (id: string, kind: IslandVM["kind"], place: string, title: string): IslandVM => ({
    id, kind, state: "frame", order: 0, place, title, subtitle: null, category: null, checkpoints: [], youPay: null, planPays: null, upperBound: false, missing: estimate?.missing_inputs ?? [], notices: [], soundingsAfter: null, stageIds: [],
  });
  const start = frame("start", "start", "Harbor of Beginnings", `Start · ${plan.plan_code}`);
  const destination = { ...frame("destination", "destination", "Harbor Light", "Harbor Light"), stageIds: ["recovery", "followup"] };
  return {
    status, start, islands, visited, marginal, destination,
    totals: { youPay: estimate?.user_estimated_payment_cents ?? null, planPays: estimate?.insurer_estimated_payment_cents ?? null, upperBound: !!estimate?.plan_payment_is_upper_bound, range: estimate?.movers?.range ?? null },
    stepsCited: lines.flatMap((l) => l.steps).filter((s) => s.stitch).length, rulesNotStated: new Set(estimate?.unknowns ?? []).size,
  };
}
