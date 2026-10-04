import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { fastPathLabel, groupPlans, uploadLabel, type UploadSummary } from "@/lib/plan-catalog";
import type { Benefits, ComparisonResponse, PlanRef, PlanSummary, TreatmentItem } from "@/lib/types";
import { ComparisonGrid, type GridPlan } from "./ComparisonGrid";
import { EvidenceBadge } from "./Primitives";

interface Props { plans: PlanSummary[]; items: TreatmentItem[]; benefits: Benefits[]; initial: string[] }

function monthsBetween(a: Date, b: Date) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0); }

/**
 * Compare (spec §2.2; CLAUDE.md rule 6): up to three plan refs (presets or your published uploads) in the order you pick. Per-plan inputs
 * come only from that plan's own benefits record; a plan with no record gets nothing (its column stays unresolved); nothing is copied
 * between plans. The pickers are grouped native selects (carrier optgroups, fictional plans under their own group, uploads last).
 */
export function CompareView({ plans, items, benefits, initial }: Props) {
  const [picked, setPicked] = useState<PlanRef[]>(initial.slice(0, 3));
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [models, setModels] = useState<Record<string, GridPlan>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const planned = items.filter((i) => i.status === "planned" || i.status === "scheduled");
  const carriers = groupPlans(plans);
  useEffect(() => { api.myPlans().then((r) => setUploads(r.items as UploadSummary[])).catch(() => setUploads([])); }, []);

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
      const [cmp, ...ms] = await Promise.all([api.comparison({ plan_refs: picked, lines, states }), ...picked.map((c) => api.planByRef(c))]);
      // the engine keys columns and ledgers by the model's plan_code (an upload's is its UPn label): map each column back to the ref picked
      const byColumn: Record<string, GridPlan> = {};
      ms.forEach((m, i) => { byColumn[m.model.plan_code] = { model: m.model, ref: picked[i] }; byColumn[picked[i]] = { model: m.model, ref: picked[i] }; });
      setData(cmp); setModels(byColumn);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { run(); /* eslint-disable-line */ }, [picked.join(","), planned.length]);

  const taken = (i: number, code: string) => picked.includes(code) && picked[i] !== code;
  /** The full name of the picked plan: a long option is cut with an ellipsis inside the column, the title carries it whole. */
  const fullName = (code: string | undefined) => { if (!code) return undefined; const p = plans.find((x) => x.plan_code === code); if (p) return fastPathLabel(p); const u = uploads.find((x) => x.plan_code === code); return u ? uploadLabel(u) : undefined; };
  return (
    <section className="compare-view" aria-labelledby="cv-h">
      <h2 id="cv-h">{PLAN.cmpViewTitle}</h2>
      <p className="cv-banner">{UI.availabilityBanner}</p>
      <p className="muted">{UI.comparisonNote}</p>
      <div className="pickers">
        {[0, 1, 2].map((i) => (
          <label key={i}>{PLAN.cmpPicker(i + 1)}
            <select value={picked[i] ?? ""} title={fullName(picked[i])} onChange={(e) => { const v = e.target.value; setPicked((p) => { const n = [...p]; if (v) n[i] = v; else n.splice(i, 1); return n.filter(Boolean); }); }}>
              <option value="">{PLAN.cmpNone}</option>
              {carriers.filter((c) => !c.fictional).map((c) => (
                <optgroup key={c.key} label={c.label}>{c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} disabled={taken(i, y.code)}>{fastPathLabel(y.summary)}</option>))}</optgroup>
              ))}
              {carriers.some((c) => c.fictional) && (
                <optgroup label={PLAN.fictionalGroup}>{carriers.filter((c) => c.fictional).flatMap((c) => c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} disabled={taken(i, y.code)}>{fastPathLabel(y.summary)}</option>)))}</optgroup>
              )}
              {uploads.length > 0 && <optgroup label={PLAN.uploadsGroup}>{uploads.map((u) => <option key={u.plan_code} value={u.plan_code} disabled={taken(i, u.plan_code)}>{uploadLabel(u)}</option>)}</optgroup>}
            </select>
          </label>
        ))}
      </div>
      <p className="muted small">{PLAN.cmpProcedures(planned.length ? planned.map((i) => `${i.procedure_name ?? i.procedure_key}${i.tooth ? ` (tooth ${i.tooth})` : ""}`).join("; ") : PLAN.cmpNoneRecorded)} {PLAN.cmpUsageFor(benefits.map((b) => b.plan_code).join(", ") || PLAN.cmpNone)}</p>
      <p className="muted" role="status">{busy ? UI.processing : ""}</p>
      {err && <p className="error" role="alert">{err}</p>}
      {data && <ComparisonGrid data={data} plans={models} />}
      {!data && !busy && planned.length === 0 && <p><EvidenceBadge status="UNKNOWN" /> {PLAN.cmpNoPlanned}</p>}
    </section>
  );
}
