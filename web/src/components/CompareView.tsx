import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { compareStates } from "@/lib/compare-state";
import { fastPathLabel, fullPlanLabel, groupPlans, uploadLabel, type UploadSummary } from "@/lib/plan-catalog";
import type { Benefits, ComparisonResponse, PlanRef, PlanSummary, TreatmentItem } from "@/lib/types";
import { ComparisonGrid, type GridPlan } from "./ComparisonGrid";
import { EvidenceBadge } from "./Primitives";

interface Props { plans: PlanSummary[]; items: TreatmentItem[]; benefits: Benefits[]; initial: string[] }

/**
 * Compare (spec §2.2; CLAUDE.md rule 6): up to three plan refs (presets or your published uploads) in the order you pick. Per-plan inputs
 * come only from that plan's own benefits record; the allowed amounts and network written on treatment items belong to the plan the
 * records are kept under (`initial[0]`, the plan selected in the app) and reach that column only (lib/compare-state.ts); a plan with no
 * inputs gets nothing (its column stays unresolved); nothing is copied between plans. The pickers are grouped native selects (carrier optgroups, fictional plans under their own group, uploads last).
 */
export function CompareView({ plans, items, benefits, initial }: Props) {
  const [picked, setPicked] = useState<PlanRef[]>(initial.slice(0, 3));
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [models, setModels] = useState<Record<string, GridPlan>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enteredFor, setEnteredFor] = useState<string[]>([]);
  const planned = items.filter((i) => i.status === "planned" || i.status === "scheduled");
  const carriers = groupPlans(plans);
  const recordsPlan = initial[0] ?? null;
  useEffect(() => { api.myPlans().then((r) => setUploads(r.items as UploadSummary[])).catch(() => setUploads([])); }, []);

  // One comparison per picker state. A later change cancels the earlier request's result (it never overwrites a newer grid or clears the
  // busy line early), and fewer than two plans or no planned items clears the grid instead of leaving the old one up (web-correctness-13).
  const pickedKey = picked.join(",");
  const plannedKey = planned.map((i) => `${i.id}:${i.dentist_fee_cents}:${i.quantity}:${i.allowed_cents}:${i.network ?? ""}`).join(",");
  useEffect(() => {
    if (picked.length < 2 || planned.length === 0) { setData(null); setModels({}); setEnteredFor([]); setBusy(false); return; }
    let cancelled = false;
    setBusy(true); setErr(null);
    (async () => {
      try {
        const lines = planned.map((i) => ({ key: i.procedure_key, label: `${i.procedure_name ?? i.procedure_key}${i.tooth ? ` (tooth ${i.tooth})` : ""}`, tooth: i.tooth ?? null, charge_cents: i.dentist_fee_cents * (i.quantity || 1), completion: i.planned_completion ?? i.appointment_date ?? null, prep: i.planned_prep ?? null }));
        const states = compareStates(picked, planned, benefits, recordsPlan);
        const [cmp, ...ms] = await Promise.all([api.comparison({ plan_refs: picked, lines, states }), ...picked.map((c) => api.planByRef(c))]);
        if (cancelled) return;
        // the engine keys columns and ledgers by the model's plan_code (an upload's is its UPn label): map each column back to the ref picked
        const byColumn: Record<string, GridPlan> = {};
        ms.forEach((m, i) => { byColumn[m.model.plan_code] = { model: m.model, ref: picked[i] }; byColumn[picked[i]] = { model: m.model, ref: picked[i] }; });
        setData(cmp); setModels(byColumn); setEnteredFor(Object.keys(states));
      } catch (e: any) { if (!cancelled) { setErr(e.message); setData(null); } }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
    // keyed on the picked refs, the planned items, the records and the records plan (their identity changes on every records reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey, plannedKey, benefits, recordsPlan]);

  const taken = (i: number, code: string) => picked.includes(code) && picked[i] !== code;
  return (
    <section className="compare-view" aria-labelledby="cv-h">
      <h2 id="cv-h">{PLAN.cmpViewTitle}</h2>
      <p className="cv-banner">{UI.availabilityBanner}</p>
      <p className="muted">{UI.comparisonNote}</p>
      <div className="pickers">
        {[0, 1, 2].map((i) => (
          <label key={i}>{PLAN.cmpPicker(i + 1)}
            <select value={picked[i] ?? ""} onChange={(e) => { const v = e.target.value; setPicked((p) => { const n = [...p]; if (v) n[i] = v; else n.splice(i, 1); return n.filter(Boolean); }); }}>
              <option value="">{PLAN.cmpNone}</option>
              {carriers.filter((c) => !c.fictional).map((c) => (
                <optgroup key={c.key} label={c.label}>{c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} disabled={taken(i, y.code)} title={fullPlanLabel(y.summary)}>{fastPathLabel(y.summary)}</option>))}</optgroup>
              ))}
              {carriers.some((c) => c.fictional) && (
                <optgroup label={PLAN.fictionalGroup}>{carriers.filter((c) => c.fictional).flatMap((c) => c.plans.flatMap((p) => p.years.map((y) => <option key={y.code} value={y.code} disabled={taken(i, y.code)} title={fullPlanLabel(y.summary)}>{fastPathLabel(y.summary)}</option>)))}</optgroup>
              )}
              {uploads.length > 0 && <optgroup label={PLAN.uploadsGroup}>{uploads.map((u) => <option key={u.plan_code} value={u.plan_code} disabled={taken(i, u.plan_code)}>{uploadLabel(u)}</option>)}</optgroup>}
            </select>
          </label>
        ))}
      </div>
      <p className="muted small">{PLAN.cmpProcedures(planned.length ? planned.map((i) => `${i.procedure_name ?? i.procedure_key}${i.tooth ? ` (tooth ${i.tooth})` : ""}`).join("; ") : PLAN.cmpNoneRecorded)} {PLAN.cmpUsageFor(benefits.map((b) => b.plan_code).join(", ") || PLAN.cmpNone)}</p>
      {busy && <p className="muted" role="status">{UI.processing}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {data && <ComparisonGrid data={data} plans={models} enteredFor={enteredFor} />}
      {!data && !busy && planned.length === 0 && <p><EvidenceBadge status="UNKNOWN" /> {PLAN.cmpNoPlanned}</p>}
    </section>
  );
}
