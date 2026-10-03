import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { UI } from "../lib/copy";
import type { Benefits, ComparisonResponse, PlanFixture, PlanSummary, TreatmentItem } from "../lib/types";
import { ComparisonGrid } from "./ComparisonGrid";
import { EvidenceBadge } from "./Primitives";

interface Props { plans: PlanSummary[]; items: TreatmentItem[]; benefits: Benefits[]; initial: string[] }

function monthsBetween(a: Date, b: Date) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0); }

/** Compare: up to three plans in the order you pick. Per-plan inputs come only from that plan's own records; nothing is copied between plans. */
export function CompareView({ plans, items, benefits, initial }: Props) {
  const [picked, setPicked] = useState<string[]>(initial.slice(0, 3));
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [models, setModels] = useState<Record<string, PlanFixture>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const planned = items.filter((i) => i.status === "planned" || i.status === "scheduled");

  async function run() {
    if (picked.length < 2 || planned.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const lines = planned.map((i) => ({ key: i.procedure_key, label: `${i.procedure_name ?? i.procedure_key}${i.tooth ? ` (tooth ${i.tooth})` : ""}`, tooth: i.tooth ?? null, charge_cents: i.dentist_fee_cents * (i.quantity || 1), completion: i.planned_completion ?? i.appointment_date ?? null, prep: i.planned_prep ?? null }));
      const states: Record<string, unknown> = {};
      for (const code of picked) {
        const b = benefits.find((x) => x.plan_code === code);
        if (!b) continue;    // no records for this plan → nothing is entered for it (the column stays unresolved; nothing transfers)
        const overrides: Record<string, unknown> = {};
        for (const i of planned) if (i.allowed_cents != null) overrides[i.procedure_key] = { value: i.allowed_cents, status: "USER", note: i.allowed_source ?? "" };
        states[code] = {
          remaining_deductible: b.remaining_deductible_cents == null ? { value: null, status: "UNKNOWN" } : { value: b.remaining_deductible_cents, status: "USER", note: b.source?.label ?? "" },
          remaining_max: b.remaining_max_cents == null ? { value: null, status: "UNKNOWN" } : { value: b.remaining_max_cents, status: "USER", note: b.source?.label ?? "" },
          network: { value: planned[0]?.network ?? null, status: planned[0]?.network ? "USER" : "UNKNOWN" },
          enrolled_months: b.coverage_start ? { value: monthsBetween(new Date(b.coverage_start), new Date()), status: "USER" } : { value: null, status: "UNKNOWN" },
          allowed_overrides: overrides,
        };
      }
      const [cmp, ...ms] = await Promise.all([api.comparison({ plan_refs: picked, lines, states }), ...picked.map((c) => api.plan(c))]);
      setData(cmp); setModels(Object.fromEntries(ms.map((m) => [m.model.plan_code, m.model])));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { run(); /* eslint-disable-line */ }, [picked.join(","), planned.length]);

  return (
    <section className="compare-view" aria-labelledby="cv-h">
      <h2 id="cv-h">{UI.availabilityBanner}</h2>
      <p className="muted">{UI.comparisonNote}</p>
      <div className="pickers">
        {[0, 1, 2].map((i) => (
          <label key={i}>Plan {i + 1}
            <select value={picked[i] ?? ""} onChange={(e) => { const v = e.target.value; setPicked((p) => { const n = [...p]; if (v) n[i] = v; else n.splice(i, 1); return n.filter(Boolean); }); }}>
              <option value="">—</option>
              {plans.map((p) => <option key={p.plan_code} value={p.plan_code} disabled={picked.includes(p.plan_code) && picked[i] !== p.plan_code}>{p.title}{p.is_fictional ? " (fictional)" : ""}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="muted small">Procedures compared: {planned.length ? planned.map((i) => `${i.procedure_name ?? i.procedure_key}${i.tooth ? ` (tooth ${i.tooth})` : ""}`).join("; ") : "none recorded as planned"}. Usage figures exist for: {benefits.map((b) => b.plan_code).join(", ") || "no plan"} — other columns show what is not provided.</p>
      {busy && <p className="muted" role="status">{UI.processing}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {data && <ComparisonGrid data={data} plans={models} />}
      {!data && !busy && planned.length === 0 && <p><EvidenceBadge status="UNKNOWN" /> No planned procedures to compare. Add a treatment plan on My journey first.</p>}
    </section>
  );
}
