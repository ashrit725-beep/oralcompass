import type { Benefits, PlanRef, TreatmentItem } from "./types";

/**
 * Per-plan member state for POST /comparisons (CLAUDE.md rule 6: nothing transfers between plans). It mirrors the server's
 * `records.member_state` so a Compare column and the saved estimate for the same plan read the same inputs:
 * - usage (remaining deductible / maximum), enrollment, claim history and the record's default network come only from THAT plan's own
 *   benefits record;
 * - allowed amounts and network status written on treatment items have no plan of their own: they were entered against the plan the
 *   records are kept under (`recordsPlan`, the plan selected in the app) and go to that column only;
 * - a plan with neither a record nor the records plan's item figures gets no state, so its column stays unresolved ("Not provided").
 * Nothing here computes money; the only arithmetic is the enrolled-month count, done on calendar dates (no UTC parse).
 */
type VIn = { value: unknown; status: "USER" | "UNKNOWN"; note?: string };
export interface StateIn {
  remaining_deductible: VIn;
  remaining_max: VIn;
  network: VIn;
  enrolled_months: VIn;
  history: Record<string, string[]>;
  allowed_overrides: Record<string, VIn>;
}

const UNKNOWN: VIn = { value: null, status: "UNKNOWN" };

/** Whole months between two calendar dates, the server's `months_between` (records.py): an ISO "YYYY-MM-DD" start, `today` in local time. */
export function monthsSince(isoStart: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoStart);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - mo) - (today.getDate() < d ? 1 : 0);
}

function networkDefault(b: Benefits | undefined): string | null {
  const n = b?.network_default;
  if (!n) return null;
  return typeof n === "string" ? n : n.value ?? null;
}

export function compareStates(picked: PlanRef[], planned: TreatmentItem[], benefits: Benefits[], recordsPlan: PlanRef | null, today: Date = new Date()): Record<string, StateIn> {
  const states: Record<string, StateIn> = {};
  for (const code of picked) {
    const b = benefits.find((x) => x.plan_code === code);
    const own = code === recordsPlan;
    if (!b && !own) continue;
    const overrides: Record<string, VIn> = {};
    if (own) for (const i of planned) if (i.allowed_cents != null) overrides[i.procedure_key] = { value: i.allowed_cents, status: "USER", note: i.allowed_source ?? "" };
    const itemNets = own ? [...new Set(planned.map((i) => i.network).filter((n): n is string => !!n))] : [];
    const net = itemNets.length === 1 ? itemNets[0] : networkDefault(b);
    const months = b?.coverage_start ? monthsSince(b.coverage_start, today) : null;
    const history: Record<string, string[]> = {};
    for (const c of b?.claims ?? []) if (c?.procedure_key && c?.date) (history[c.procedure_key] ??= []).push(c.date);
    states[code] = {
      remaining_deductible: b?.remaining_deductible_cents == null ? UNKNOWN : { value: b.remaining_deductible_cents, status: "USER", note: b.source?.label ?? "" },
      remaining_max: b?.remaining_max_cents == null ? UNKNOWN : { value: b.remaining_max_cents, status: "USER", note: b.source?.label ?? "" },
      network: net ? { value: net, status: "USER" } : UNKNOWN,
      enrolled_months: months == null ? UNKNOWN : { value: months, status: "USER", note: `coverage start ${b!.coverage_start}` },
      history,
      allowed_overrides: overrides,
    };
  }
  return states;
}
