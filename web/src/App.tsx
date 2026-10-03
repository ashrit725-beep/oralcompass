import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import { FOOTER, LANDMARKS, NAV, TAGLINE, UI, type LandmarkId } from "./lib/copy";
import { currentStageId } from "./lib/journey";
import { money, stitchesFromClauses } from "./lib/stitches";
import type { Benefits, CoverageRule, JourneyView, PlanEvidence, PlanFixture, PlanSummary, SavedEstimate, Stitch, TreatmentItem } from "./lib/types";
import { JourneyMap, JourneyVertical, type Selection } from "./components/atlas/JourneyMap";
import { PlanAtlas } from "./components/atlas/PlanAtlas";
import { ClauseCard } from "./components/ClauseCard";
import { CompareView } from "./components/CompareView";
import { CostTrail, MissingInputs } from "./components/CostTrail";
import { DetailPanel } from "./components/DetailPanel";
import { DocumentsView } from "./components/DocumentsView";
import { LandmarkContent } from "./components/LandmarkContent";
import { OverviewList } from "./components/OverviewList";
import { EvidenceBadge } from "./components/Primitives";

type Tab = keyof typeof NAV;

function useMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => { const q = window.matchMedia("(max-width: 760px)"); const f = () => setM(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  return m;
}

/**
 * OralCompass — "Your care journey. Your coverage. Clearly mapped."
 * Two connected views (My journey ↔ My plan) plus Compare and Documents. Journey data comes from the API; the map layout is derived from it.
 * Everything shown is information: what the documents say, what your records say, what the arithmetic yields.
 */
export default function App() {
  const mobile = useMobile();
  const [tab, setTab] = useState<Tab>("journey");
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [journeys, setJourneys] = useState<JourneyView[] | null>(null);
  const [view, setView] = useState<JourneyView | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [overview, setOverview] = useState(false);
  const [planCode, setPlanCode] = useState<string>("");
  const [planModel, setPlanModel] = useState<PlanFixture | null>(null);
  const [rules, setRules] = useState<CoverageRule[]>([]);
  const [evidence, setEvidence] = useState<PlanEvidence | null>(null);
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [benefits, setBenefits] = useState<Benefits[]>([]);
  const [estimate, setEstimate] = useState<SavedEstimate | null>(null);
  const [landmark, setLandmark] = useState<LandmarkId | null>(null);
  const [stitch, setStitch] = useState<Stitch | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>("Connecting…");
  const [busy, setBusy] = useState(false);
  const [samples, setSamples] = useState<{ id: string; label: string; plan_ref: string | null }[]>([]);

  const stitches = useMemo(() => (evidence ? stitchesFromClauses(evidence.clauses) : []), [evidence]);
  const summary = plans.find((p) => p.plan_code === planCode) ?? null;
  const benefitsFor = benefits.find((b) => b.plan_code === planCode) ?? null;
  const realCount = plans.filter((p) => !p.is_fictional).length;

  // ---- loading ----
  const loadBase = useCallback(async () => {
    setError(null); setLoading("Connecting…");
    try {
      const [pl, js, sm] = await Promise.all([api.plans(), api.journeys(), api.journeySamples()]);
      setPlans(pl.items); setJourneys(js.items); setSamples(sm.items);
      const first = js.items[0] ?? null;
      setView(first);
      if (first) { setPlanCode(first.journey.plan_ref ?? pl.items[0]?.plan_code ?? ""); setSelection({ stageId: currentStageId(first.journey) ?? first.journey.stages[0].id }); }
      else setPlanCode(pl.items.find((p) => !p.is_fictional)?.plan_code ?? pl.items[0]?.plan_code ?? "");
    } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}. The API runs on :8000 with ORALCOMPASS_DEV_AUTH=1.`); }
    finally { setLoading(null); }
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);

  const loadRecords = useCallback(async () => {
    try { const [it, bf] = await Promise.all([api.treatmentItems(), api.benefits()]); setItems(it); setBenefits(bf); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); }
  }, []);
  useEffect(() => { if (view) loadRecords(); }, [view?.id, loadRecords]);

  useEffect(() => {
    if (!planCode) return;
    let cancelled = false;
    setLoading(UI.processing);
    (async () => {
      try {
        const [pm, ru, ev] = await Promise.all([api.plan(planCode), api.rules(planCode), api.evidence(planCode)]);
        if (cancelled) return;
        setPlanModel(pm.model); setRules(ru.rules); setEvidence(ev);
        const planned = items.filter((i) => i.status === "planned" || i.status === "scheduled");
        if (planned.length) { const est = await api.estimateFromRecords(planCode); if (!cancelled) setEstimate(est); }
        else setEstimate(null);
      } catch (e: any) { if (!cancelled) setError(`${UI.errorTitle}: ${e.message}`); }
      finally { if (!cancelled) setLoading(null); }
    })();
    return () => { cancelled = true; };
  }, [planCode, items]);

  async function startJourney(from: string) {
    setBusy(true); setError(null);
    try { const v = await api.createJourney(from); setView(v); setJourneys((j) => [...(j ?? []), v]); setSelection({ stageId: currentStageId(v.journey) ?? v.journey.stages[0].id }); if (v.journey.plan_ref) setPlanCode(v.journey.plan_ref); setTab("journey"); }
    catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }
  async function patch(cpId: string, body: Parameters<typeof api.patchCheckpoint>[2]) {
    if (!view || !selection) return;
    setBusy(true);
    try { const v = await api.patchCheckpoint(view.id, cpId, body); setView(v); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }
  async function instructions(stageId: string, text: string, source: string, givenOn?: string) {
    if (!view) return;
    setBusy(true);
    try { const v = await api.putInstructions(view.id, stageId, { text, source, given_on: givenOn }); setView(v); } catch (e: any) { setError(`${UI.errorTitle}: ${e.message}`); } finally { setBusy(false); }
  }
  function openLandmark(id: LandmarkId) { setLandmark(id); setTab("plan"); }
  function openDocuments() { setTab("documents"); }
  function onStitch(s: Stitch) { setStitch(s); }

  const landmarkSummary = useMemo(() => {
    if (!planModel) return {} as Partial<Record<LandmarkId, string>>;
    const fmt = (v: { value: number | null; unlimited?: boolean } | undefined) => (!v ? "—" : v.unlimited ? "unlimited" : v.value == null ? UI.notStated : money(v.value));
    return {
      harbor: `${summary?.option ?? ""}${planModel.is_fictional ? " · fictional" : ""}`,
      bridge: fmt(planModel.deductible_individual),
      cove: planModel.classes.map((c) => `${c.plan_share_bp_in.value != null ? c.plan_share_bp_in.value / 100 : "?"}%`).join(" / "),
      lookout: fmt(planModel.annual_max),
      lighthouse: estimate ? (estimate.status === "estimate" ? `you pay ${money(estimate.user_estimated_payment_cents)}` : "waiting for information") : "no planned procedures",
    } as Partial<Record<LandmarkId, string>>;
  }, [planModel, estimate, summary]);

  const newUser = journeys !== null && journeys.length === 0 && !view;

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand"><h1>{UI.appName}</h1><p className="tagline">{TAGLINE}</p></div>
        <nav className="topnav" aria-label="Views">
          {(Object.keys(NAV) as Tab[]).map((t) => <button key={t} type="button" aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{NAV[t]}</button>)}
        </nav>
        {view?.is_sample && <span className="ribbon" role="note">{UI.sampleRibbon}</span>}
      </header>
      {error && <div className="error" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(null); loadBase(); }}>{UI.retry}</button></div>}
      {loading && <p className="processing" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> {loading}</p>}

      <main className={`view view-${tab} ${mobile ? "is-mobile" : ""}`}>
        {tab === "journey" && (
          newUser || !view ? (
            <section className="start" aria-labelledby="start-h">
              <h2 id="start-h">{UI.newUserTitle}</h2>
              <p>{UI.newUserBody}</p>
              <div className="start-actions">
                <button type="button" disabled={busy} onClick={() => startJourney("empty")}>Start my journey (no documents yet)</button>
                {samples.map((s) => <button key={s.id} type="button" className="secondary" disabled={busy} onClick={() => startJourney(s.id)}>{UI.loadSample}: {s.label.replace("Sample journey — ", "")}</button>)}
              </div>
              <p className="muted small">Plan presets: {plans.length} ({realCount} from public plan documents, {plans.length - realCount} fictional demonstration plans). {UI.availabilityBanner}</p>
            </section>
          ) : (
            <div className="journey-layout">
              <div className="journey-main">
                <div className="journey-head">
                  <h2>{view.journey.label}</h2>
                  <p className="progress-line"><strong className="num">{view.progress.label}</strong> <span className="muted">· {view.progress.note}</span></p>
                  <div className="toggles">
                    <button type="button" aria-pressed={!overview} onClick={() => setOverview(false)}>{UI.mapView}</button>
                    <button type="button" aria-pressed={overview} onClick={() => setOverview(true)}>{UI.overview}</button>
                    {journeys && journeys.length > 0 && samples.length > 0 && <select aria-label="Journey" value={view.id} onChange={(e) => { const v = journeys.find((j) => j.id === e.target.value); if (v) { setView(v); setSelection({ stageId: currentStageId(v.journey) ?? v.journey.stages[0].id }); if (v.journey.plan_ref) setPlanCode(v.journey.plan_ref); } }}>
                      {journeys.map((j) => <option key={j.id} value={j.id}>{j.journey.label}</option>)}</select>}
                    <select aria-label="Add a journey" value="" onChange={(e) => e.target.value && startJourney(e.target.value)}><option value="">Add another journey…</option><option value="empty">Empty (no documents yet)</option>{samples.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                  </div>
                </div>
                {overview ? <OverviewList journey={view.journey} onSelect={(s) => { setSelection(s); setOverview(false); }} />
                  : mobile ? <JourneyVertical journey={view.journey} selected={selection} onSelect={setSelection} currentStageId={currentStageId(view.journey)} />
                  : <JourneyMap journey={view.journey} selected={selection} onSelect={setSelection} currentStageId={currentStageId(view.journey)} />}
              </div>
              {selection && <DetailPanel view={view} selection={selection} onSelect={setSelection} onOpenLandmark={openLandmark} onOpenDocuments={openDocuments} onPatch={patch} onInstructions={instructions} busy={busy} mobile={mobile} onClose={() => setSelection(null)} />}
            </div>
          )
        )}

        {tab === "plan" && (
          <div className="plan-layout">
            <div className="plan-main">
              <div className="plan-head">
                <label className="plan-pick">Plan <select value={planCode} onChange={(e) => { setPlanCode(e.target.value); setStitch(undefined); }}>
                  {plans.map((p) => <option key={p.plan_code} value={p.plan_code}>{p.title}{p.is_fictional ? " (fictional)" : ""}</option>)}</select></label>
                {summary && <p className="muted small">{summary.is_fictional ? UI.fictional : UI.realPlan}{summary.currency_note ? ` · ${UI.outdated}` : ""} · {UI.availabilityBanner}</p>}
              </div>
              <PlanAtlas selected={landmark} onSelect={setLandmark} summary={landmarkSummary} compact={mobile} />
              {!landmark && <p className="hint">Each landmark opens one part of the plan. Familiar terms first; the place names are only the map's.</p>}
            </div>
            <aside className={`detail ${mobile ? "sheet" : "side"} ${landmark ? "" : "is-empty"}`} aria-label="Landmark details">
              {landmark && planModel && summary && (
                <>
                  <div className="detail-bar"><p className="crumbs">{LANDMARKS.find((l) => l.id === landmark)?.place}</p><button type="button" className="close" aria-label="Close details" onClick={() => setLandmark(null)}>×</button></div>
                  <div className="detail-body">
                    <LandmarkContent landmark={landmark} plan={planModel} summary={summary} benefits={benefitsFor} rules={rules} estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope onOpenDocuments={openDocuments} />
                    {landmark === "lighthouse" && (estimate ? <CostTrail estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope /> : <p className="muted"><EvidenceBadge status="UNKNOWN" /> No planned procedures are recorded. Add a treatment plan on My journey.</p>)}
                    {landmark !== "lighthouse" && estimate?.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {tab === "compare" && <CompareView plans={plans} items={items} benefits={benefits} initial={[planCode, ...plans.map((p) => p.plan_code).filter((c) => c !== planCode)].slice(0, 3)} />}

        {tab === "documents" && <DocumentsView planCode={planCode} plans={plans} onPlan={setPlanCode} evidence={evidence} stitches={stitches} selected={stitch} onSelect={onStitch} onRetry={() => { setJourneys(null); setView(null); setSelection(null); loadBase(); }} />}
      </main>

      {stitch && <ClauseCard stitch={stitch} lines={estimate?.ledger.lines ?? []} onClose={() => setStitch(undefined)} onOpenOnPage={(s) => { setStitch(s); setTab("documents"); }} />}
      <footer className="footer">{FOOTER}</footer>
    </div>
  );
}
