import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ClauseCard } from "@/components/ClauseCard";
import { ProcedureDrawer } from "@/components/drawer/ProcedureDrawer";
import { StageLoader } from "@/components/StageLoader";
import { useMobile } from "@/hooks/useMobile";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { money, stitchesFromClauses } from "@/lib/stitches";
import type { Benefits, CoverageRule, IslandVM, JourneyView, PlanFixture, PlanSummary, Procedure, SavedEstimate, Stitch, TreatmentItem } from "@/lib/types";
import { buildHarnessPassage } from "./harnessVm";

/**
 * DEV ONLY: the drawer harness (mounted only when `location.hash === "#drawer-harness"`, see src/dev/harness-main.tsx and
 * web/drawer-harness.html). It seeds the Alex sample for the dev user when no journey exists, loads the plan, rules, evidence, items,
 * benefits and the saved estimate for the selected preset, builds a PassageVM with `buildHarnessPassage`, and offers one button per island
 * (START, the route, Harbor Light, visited, marginal) that opens the ProcedureDrawer (desktop region or phone sheet) with the real data.
 * Nothing here ships in the product views; the integrator keeps it hash-gated.
 */
export function DrawerHarness() {
  const mobile = useMobile();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [planRef, setPlanRef] = useState("ML26");
  const [plan, setPlan] = useState<PlanFixture | null>(null);
  const [rules, setRules] = useState<CoverageRule[]>([]);
  const [stitches, setStitches] = useState<Stitch[]>([]);
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [benefits, setBenefits] = useState<Benefits[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [estimate, setEstimate] = useState<SavedEstimate | null>(null);
  const [status, setStatus] = useState<string | null>("Connecting…");
  const [sel, setSel] = useState<{ id: string; cp?: string } | null>(null);
  const [stitch, setStitch] = useState<Stitch | undefined>();
  const [tick, setTick] = useState(0);
  const openers = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    (async () => {
      const [pl, js, pr] = await Promise.all([api.plans(), api.journeys(), api.procedures()]);
      setPlans(pl.items); setProcedures(pr.items);
      let view: JourneyView | undefined = js.items.find((j) => j.journey.plan_ref === "ML26") ?? js.items[0];
      if (!view) view = await api.createJourney("sample-alex");
      setStatus(null);
    })().catch((e) => setStatus(`${UI.errorTitle}: ${e.message}`));
  }, []);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener("oralcompass:records-changed", f); return () => window.removeEventListener("oralcompass:records-changed", f);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setStatus(UI.processing);
    (async () => {
      const [pm, ru, ev, it, bf] = await Promise.all([api.planByRef(planRef), api.rulesByRef(planRef), api.evidenceByRef(planRef), api.treatmentItems(), api.benefits()]);
      if (cancelled) return;
      setPlan(pm.model); setRules(ru.rules); setStitches(stitchesFromClauses(ev.clauses)); setItems(it); setBenefits(bf);
      const planned = it.filter((i) => i.status === "planned" || i.status === "scheduled");
      setEstimate(planned.length ? await api.estimateFromRecords(planRef) : null);
    })().catch((e) => setStatus(`${UI.errorTitle}: ${e.message}`)).finally(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, [planRef, tick]);

  const benefitsFor = benefits.find((b) => b.plan_code === planRef) ?? null;
  const vm = useMemo(() => (plan ? buildHarnessPassage({ items, estimate, rules, plan, procedures, benefits: benefitsFor, stitches }) : null), [items, estimate, rules, plan, procedures, benefitsFor, stitches]);
  const all: IslandVM[] = vm ? [vm.start, ...vm.islands, vm.destination, ...vm.visited, ...vm.marginal] : [];
  const island = all.find((i) => i.id === sel?.id) ?? null;
  const labelOf = (i: IslandVM) => i.kind === "procedure" ? `${i.title} · ${i.state === "estimate" ? `you pay ${money(i.youPay)}` : i.state === "not_covered" ? `not covered · ${money(i.youPay)}` : "waiting for information"}`
    : i.kind === "destination" ? `${i.title} · ${vm?.totals.youPay != null ? `you pay ${money(vm.totals.youPay)}` : "waiting for information"}` : i.title;

  return (
    <div className={`harness ${mobile ? "is-mobile" : ""}`}>
      <header className="harness-head">
        <h1>Drawer harness</h1>
        <label className="plan-pick">Plan <select value={planRef} onChange={(e) => { setSel(null); setPlanRef(e.target.value); }}>{plans.map((p) => <option key={p.plan_code} value={p.plan_code}>{p.plan_code} · {p.title}{p.is_fictional ? " (fictional)" : ""}</option>)}</select></label>
        {status && <StageLoader label={status} size="sm" />}
      </header>
      <div className="harness-layout">
        <div className="harness-islands" role="group" aria-label="Procedure islands">
          {all.map((i) => (
            <div key={i.id} className="harness-island">
              <button type="button" ref={(el) => { openers.current[i.id] = el; }} className={`island-btn harness-btn ${sel?.id === i.id ? "is-selected" : ""} ${i.state === "unresolved" ? "is-fog" : ""}`} aria-label={labelOf(i)} aria-pressed={sel?.id === i.id} onClick={() => setSel({ id: i.id })}>
                <span className="island-btn-title">{i.title}</span><span className="island-btn-progress">{i.kind === "procedure" ? labelOf(i).split(" · ").slice(1).join(" · ") : i.place}</span>
              </button>
              {i.kind === "procedure" && i.checkpoints.length > 0 && (
                <ol className="harness-cps" aria-label={`Checkpoints of ${i.title}`}>
                  {i.checkpoints.map((cp) => <li key={cp.key}><button type="button" className="unstyled harness-cp" aria-label={`${cp.term}: ${cp.amountOut == null ? "waiting for information" : money(cp.amountOut)}`} onClick={() => setSel({ id: i.id, cp: cp.key })}>{cp.term}</button></li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
        <AnimatePresence>
          {island && plan && vm && (
            <ProcedureDrawer key={island.id} island={island} vm={vm} plan={plan} rules={rules} benefits={benefitsFor} estimate={estimate} stitches={stitches} selectedCheckpoint={sel?.cp}
                             onSelectStitch={setStitch} onOpenDocuments={() => setStatus("Documents tab (harness: no-op)")} onClose={() => setSel(null)} mobile={mobile}
                             returnFocus={openers.current[island.id]} onRecordsChanged={() => setTick((t) => t + 1)} />
          )}
        </AnimatePresence>
      </div>
      {stitch && <ClauseCard stitch={stitch} lines={estimate?.ledger.lines ?? []} onClose={() => setStitch(undefined)} onOpenOnPage={() => setStitch(undefined)} askScope={{ plan_ref: planRef, stitch: `${stitch.doc}#p${stitch.page}`, estimate_id: estimate?.id }} />}
    </div>
  );
}

export default DrawerHarness;
