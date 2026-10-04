import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { firstError, hasPlanned, itemsKey, loadingLabel, pickView, planWanted, type Flow, type FlowErrors } from "@/lib/appData";
import { stitchesFromClauses } from "@/lib/stitches";
import type { Benefits, CoverageRule, JourneyView, PlanEvidence, PlanFixture, PlanRef, PlanSummary, Procedure, SavedEstimate, TreatmentItem } from "@/lib/types";

export type JourneySample = { id: string; label: string; plan_ref: string | null };

/** The plan model, rules and evidence fetched for one plan ref. */
type PlanBundle = { ref: PlanRef; plan: PlanFixture | null; rules: CoverageRule[]; evidence: PlanEvidence | null };
/** What the views render: a plan bundle and the estimate computed against THAT plan, always committed together. */
type Committed = PlanBundle & { estimate: SavedEstimate | null };
const EMPTY: Committed = { ref: "", plan: null, rules: [], evidence: null, estimate: null };

export interface UseAppDataOptions {
  /** False while only the new-user start screen can show: the default plan is then not downloaded for nothing (mobile-16). Default true. */
  planNeeded?: boolean;
}

/**
 * All data loading and state for the app (spec §6 `useAppData`): plans, journeys, the selected plan (`planRef`, a preset code or
 * "upload:<id>"), plan model/rules/evidence, records (items, benefits), the saved estimate, stitches, and the journey mutations.
 * `plan` is the plan model (`PlanFixture`); the matching `PlanSummary` is `plans.find(p => p.plan_code === planRef)`.
 *
 * Loading rules (web-correctness-2, -24, -32, mobile-16):
 * - the plan model, rules and evidence are fetched when the plan ref changes (or a plan is selected again), never because records reloaded;
 * - the estimate runs when the plan bundle, the CONTENT of the records or an explicit `reestimate()` changes; bursts in one task coalesce
 *   into one request (`loadRecords(); reestimate();` posts once);
 * - the plan bundle and its estimate are committed together, so a plan switch never pairs the old plan's ledger with the new plan's
 *   stitches, and a failed estimate clears the old figures instead of leaving them under the new plan;
 * - every flow owns its error and its loading flag; Retry keeps the open journey.
 */
export function useAppData({ planNeeded = true }: UseAppDataOptions = {}) {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [journeys, setJourneys] = useState<JourneyView[] | null>(null);
  const [view, setViewState] = useState<JourneyView | null>(null);
  const [planRef, setPlanRef] = useState<PlanRef>("");
  const [planTick, setPlanTick] = useState(0);
  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [committed, setCommitted] = useState<Committed>(EMPTY);
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [benefits, setBenefits] = useState<Benefits[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [errors, setErrors] = useState<FlowErrors>({});
  const [baseLoading, setBaseLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<JourneySample[]>([]);
  const [tick, setTick] = useState(0);
  const viewRef = useRef<JourneyView | null>(null);
  viewRef.current = view;

  const setErr = useCallback((flow: Flow, message: string | null) => setErrors((e) => (e[flow] === message ? e : { ...e, [flow]: message })), []);
  const { plan, rules, evidence, estimate } = committed;
  const stitches = useMemo(() => (evidence ? stitchesFromClauses(evidence.clauses) : []), [evidence]);

  // ---- base catalogs + journeys ----
  /** `keepCurrent`: a retry keeps the open journey and the plan the person picked, when that journey still exists. */
  const loadBase = useCallback(async (keepCurrent = false) => {
    setErr("base", null); setBaseLoading(true);
    try {
      const [pl, js, sm] = await Promise.all([api.plans(), api.journeys(), api.journeySamples()]);
      setPlans(pl.items); setJourneys(js.items); setSamples(sm.items);
      const current = viewRef.current;
      const next = pickView(current?.id, js.items, keepCurrent);
      setViewState(next);
      if (keepCurrent && next && current && next.id === current.id) return;   // same journey: keep the selected plan too
      if (next) setPlanRef(next.journey.plan_ref ?? pl.items[0]?.plan_code ?? "");
      else setPlanRef(pl.items.find((p) => !p.is_fictional)?.plan_code ?? pl.items[0]?.plan_code ?? "");
    } catch (e: any) { setErr("base", `${UI.errorTitle}: ${e.message}. The API runs on :8000 with ORALCOMPASS_DEV_AUTH=1.`); }
    finally { setBaseLoading(false); }
  }, [setErr]);
  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { api.procedures().then((r) => setProcedures(r.items)).catch(() => setProcedures([])); }, []);

  // ---- private records ----
  const loadRecords = useCallback(async () => {
    try {
      const [it, bf] = await Promise.all([api.treatmentItems(), api.benefits()]);
      setItems((prev) => (itemsKey(prev) === itemsKey(it) ? prev : it)); setBenefits(bf); setErr("records", null);
    } catch (e: any) { setErr("records", `${UI.errorTitle}: ${e.message}`); }
  }, [setErr]);
  useEffect(() => { if (view) loadRecords(); }, [view?.id, loadRecords]);

  // ---- plan model, rules, evidence: once per plan ref (or an explicit re-selection), never because records reloaded ----
  const wantPlan = planWanted(planRef, planNeeded, !!view);
  const loadedPlanKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${planRef}#${planTick}`;
    if (!wantPlan || loadedPlanKey.current === key) return;
    let cancelled = false;
    setPlanLoading(true);
    (async () => {
      try {
        const [pm, ru, ev] = await Promise.all([api.planByRef(planRef), api.rulesByRef(planRef), api.evidenceByRef(planRef)]);
        if (cancelled) return;
        loadedPlanKey.current = key;
        setBundle({ ref: planRef, plan: pm.model, rules: ru.rules, evidence: ev }); setErr("plan", null);
      } catch (e: any) {
        if (cancelled) return;
        loadedPlanKey.current = key;
        setBundle({ ref: planRef, plan: null, rules: [], evidence: null }); setErr("plan", `${UI.errorTitle}: ${e.message}`);
      } finally { if (!cancelled) setPlanLoading(false); }
    })();
    return () => { cancelled = true; setPlanLoading(false); };
  }, [planRef, planTick, wantPlan, setErr]);

  // ---- the estimate: per plan bundle, records content and explicit reestimate(); committed together with its plan ----
  const recordsKey = itemsKey(items);
  useEffect(() => {
    if (!bundle || bundle.ref !== planRef) return;
    let cancelled = false;
    const planned = hasPlanned(items) && !!bundle.plan;
    if (planned) setEstimating(true);
    const timer = setTimeout(async () => {      // one task later: state bursts (records + tick) coalesce into one POST
      if (!planned) { setCommitted({ ...bundle, estimate: null }); setErr("estimate", null); return; }
      try {
        const est = await api.estimateFromRecords(bundle.ref);
        if (!cancelled) { setCommitted({ ...bundle, estimate: est }); setErr("estimate", null); }
      } catch (e: any) {
        if (!cancelled) { setCommitted({ ...bundle, estimate: null }); setErr("estimate", `${UI.errorTitle}: ${e.message}`); }
      } finally { if (!cancelled) setEstimating(false); }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); setEstimating(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `items` is read through its content key
  }, [bundle, planRef, recordsKey, tick, setErr]);

  /** Select a plan (selecting the same plan again refreshes its model, e.g. after a new upload version is published). */
  const selectPlan = useCallback((ref: PlanRef) => { setPlanRef(ref); setPlanTick((t) => t + 1); }, []);
  const reestimate = useCallback(() => setTick((t) => t + 1), []);

  /** Switch the active journey (also follows its plan ref, as before). */
  const setView = useCallback((v: JourneyView | null) => { setViewState(v); if (v?.journey.plan_ref) setPlanRef(v.journey.plan_ref); }, []);

  /** The error banner's Retry: reload the catalogs while keeping the open journey, then the records and the estimate. */
  const retry = useCallback(async () => {
    setErrors({});
    await loadBase(true);
    if (viewRef.current) await loadRecords();
    loadedPlanKey.current = null; setPlanTick((t) => t + 1); setTick((t) => t + 1);
  }, [loadBase, loadRecords]);

  /** After "Delete my data": every private record is gone on the server, so clear it here too and reload (web-correctness-17). */
  const resetPrivate = useCallback(async () => {
    setItems([]); setBenefits([]); setJourneys(null); setViewState(null); viewRef.current = null;
    setCommitted((c) => ({ ...c, estimate: null })); setErrors({});
    await loadBase(false);
    await loadRecords();
  }, [loadBase, loadRecords]);

  const startJourney = useCallback(async (from: string): Promise<JourneyView | null> => {
    setBusy(true); setErr("mutation", null);
    try { const v = await api.createJourney(from); setViewState(v); setJourneys((j) => [...(j ?? []), v]); if (v.journey.plan_ref) setPlanRef(v.journey.plan_ref); return v; }
    catch (e: any) { setErr("mutation", `${UI.errorTitle}: ${e.message}`); return null; } finally { setBusy(false); }
  }, [setErr]);
  const patch = useCallback(async (cpId: string, body: Parameters<typeof api.patchCheckpoint>[2]) => {
    if (!view) return;
    setBusy(true);
    try { const v = await api.patchCheckpoint(view.id, cpId, body); setViewState(v); setErr("mutation", null); } catch (e: any) { setErr("mutation", `${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }, [view, setErr]);
  const instructions = useCallback(async (stageId: string, text: string, source: string, givenOn?: string) => {
    if (!view) return;
    setBusy(true);
    try { const v = await api.putInstructions(view.id, stageId, { text, source, given_on: givenOn }); setViewState(v); setErr("mutation", null); } catch (e: any) { setErr("mutation", `${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }, [view, setErr]);

  const loading = loadingLabel({ base: baseLoading, plan: planLoading, estimate: estimating }, { base: "Connecting…", processing: UI.processing });
  const error = firstError(errors);

  return { planRef, selectPlan, reestimate, estimate, plan, rules, evidence, stitches, benefits, items, journeys, view, setView, samples, procedures, loading, error, busy, startJourney, patch, instructions, loadBase, loadRecords, retry, resetPrivate, plans };
}
export type AppData = ReturnType<typeof useAppData>;
