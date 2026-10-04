import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { stitchesFromClauses } from "@/lib/stitches";
import type { Benefits, CoverageRule, JourneyView, PlanEvidence, PlanFixture, PlanRef, PlanSummary, Procedure, SavedEstimate, TreatmentItem } from "@/lib/types";

export type JourneySample = { id: string; label: string; plan_ref: string | null };

/**
 * All data loading and state for the app (spec §6 `useAppData`), moved out of App.tsx unchanged in behaviour:
 * plans, journeys, the selected plan (`planRef`, a preset code or "upload:<id>"), plan model/rules/evidence, records (items, benefits),
 * the saved estimate, stitches, and the journey mutations. `plan` is the plan model (`PlanFixture`); the matching `PlanSummary` is
 * `plans.find(p => p.plan_code === planRef)`.
 */
export function useAppData() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [journeys, setJourneys] = useState<JourneyView[] | null>(null);
  const [view, setViewState] = useState<JourneyView | null>(null);
  const [planRef, setPlanRef] = useState<PlanRef>("");
  const [plan, setPlan] = useState<PlanFixture | null>(null);
  const [rules, setRules] = useState<CoverageRule[]>([]);
  const [evidence, setEvidence] = useState<PlanEvidence | null>(null);
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [benefits, setBenefits] = useState<Benefits[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [estimate, setEstimate] = useState<SavedEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>("Connecting…");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<JourneySample[]>([]);
  const [tick, setTick] = useState(0);
  /** "What if" values the person types for one plan (labelled ASSUMED by the engine). Keyed by plan ref: nothing transfers between plans,
   *  and a plan switch starts with none. Records are never changed by them. */
  const [hypo, setHypo] = useState<{ ref: PlanRef; values: Record<string, unknown> }>({ ref: "", values: {} });
  const hypotheticals = useMemo(() => (hypo.ref === planRef ? hypo.values : {}), [hypo, planRef]);
  const hypoKey = JSON.stringify(hypotheticals);

  const stitches = useMemo(() => (evidence ? stitchesFromClauses(evidence.clauses) : []), [evidence]);

  // ---- base catalogs + journeys ----
  const loadBase = useCallback(async () => {
    setError(null); setLoading("Connecting…");
    try {
      const [pl, js, sm] = await Promise.all([api.plans(), api.journeys(), api.journeySamples()]);
      setPlans(pl.items); setJourneys(js.items); setSamples(sm.items);
      const first = js.items[0] ?? null;
      setViewState(first);
      if (first) setPlanRef(first.journey.plan_ref ?? pl.items[0]?.plan_code ?? "");
      else setPlanRef(pl.items.find((p) => !p.is_fictional)?.plan_code ?? pl.items[0]?.plan_code ?? "");
    } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}. The API runs on :8000 with ORALCOMPASS_DEV_AUTH=1.`); }
    finally { setLoading(null); }
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { api.procedures().then((r) => setProcedures(r.items)).catch(() => setProcedures([])); }, []);

  // ---- private records ----
  const loadRecords = useCallback(async () => {
    try { const [it, bf] = await Promise.all([api.treatmentItems(), api.benefits()]); setItems(it); setBenefits(bf); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); }
  }, []);
  useEffect(() => { if (view) loadRecords(); }, [view?.id, loadRecords]);

  // ---- plan model, rules, evidence, estimate (re-runs on planRef, records, or an explicit reestimate) ----
  useEffect(() => {
    if (!planRef) return;
    let cancelled = false;
    setLoading(UI.processing);
    (async () => {
      try {
        const [pm, ru, ev] = await Promise.all([api.planByRef(planRef), api.rulesByRef(planRef), api.evidenceByRef(planRef)]);
        if (cancelled) return;
        setPlan(pm.model); setRules(ru.rules); setEvidence(ev);
        const planned = items.filter((i) => i.status === "planned" || i.status === "scheduled");
        if (planned.length) { const est = await api.estimateFromRecords(planRef, undefined, hypotheticals); if (!cancelled) setEstimate(est); }
        else setEstimate(null);
      } catch (e: any) { if (!cancelled) setError(`${UI.errorTitle}: ${e.message}`); }
      finally { if (!cancelled) setLoading(null); }
    })();
    return () => { cancelled = true; };
  }, [planRef, items, tick, hypoKey]);

  const selectPlan = useCallback((ref: PlanRef) => setPlanRef(ref), []);
  const reestimate = useCallback(() => setTick((t) => t + 1), []);
  const setHypotheticals = useCallback((values: Record<string, unknown>) => setHypo({ ref: planRef, values }), [planRef]);

  /** Switch the active journey (also follows its plan ref, as before). */
  const setView = useCallback((v: JourneyView | null) => { setViewState(v); if (v?.journey.plan_ref) setPlanRef(v.journey.plan_ref); }, []);

  const startJourney = useCallback(async (from: string): Promise<JourneyView | null> => {
    setBusy(true); setError(null);
    try { const v = await api.createJourney(from); setViewState(v); setJourneys((j) => [...(j ?? []), v]); if (v.journey.plan_ref) setPlanRef(v.journey.plan_ref); return v; }
    catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); return null; } finally { setBusy(false); }
  }, []);
  const patch = useCallback(async (cpId: string, body: Parameters<typeof api.patchCheckpoint>[2]) => {
    if (!view) return;
    setBusy(true);
    try { const v = await api.patchCheckpoint(view.id, cpId, body); setViewState(v); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }, [view]);
  const instructions = useCallback(async (stageId: string, text: string, source: string, givenOn?: string) => {
    if (!view) return;
    setBusy(true);
    try { const v = await api.putInstructions(view.id, stageId, { text, source, given_on: givenOn }); setViewState(v); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }, [view]);

  return { planRef, selectPlan, reestimate, hypotheticals, setHypotheticals, estimate, plan, rules, evidence, stitches, benefits, items, journeys, view, setView, samples, procedures, loading, error, busy, startJourney, patch, instructions, loadBase, loadRecords, plans };
}
export type AppData = ReturnType<typeof useAppData>;
