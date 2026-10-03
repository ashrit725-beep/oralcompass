import { useEffect, useMemo, useState } from "react";
import { api, SAM_LINES, SAM_STATE } from "./lib/api";
import { FOOTER, UI } from "./lib/copy";
import { buildStitches } from "./lib/stitches";
import type { ComparisonResponse, EstimateResponse, PlanFixture, Stitch } from "./lib/types";
import { ClauseCard } from "./components/ClauseCard";
import { ComparisonGrid } from "./components/ComparisonGrid";
import { LedgerView } from "./components/LedgerView";
import { PageView } from "./components/PageView";

type Tab = "ledger" | "page" | "compare";

/**
 * M1 demo shell: Harborview (fictional) preset + Sam's typed estimate → Page with stitches + receipt Ledger joined by stitches.
 * Phone: two panes with a draggable divider (Ledger above, Page below). Desktop: Page left, Ledger right.
 * Everything here is informational; copy comes from lib/copy.ts (linted).
 */
export default function App() {
  const [plan, setPlan] = useState<PlanFixture | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanFixture>>({});
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [selected, setSelected] = useState<Stitch | undefined>();
  const [tab, setTab] = useState<Tab>("ledger");
  const [network, setNetwork] = useState<"in" | "out">("in");
  const [dedKnown, setDedKnown] = useState(true);
  const [split, setSplit] = useState(58);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [hb, dd, ml] = await Promise.all([api.fixturePlan("HB26"), api.fixturePlan("DD24"), api.fixturePlan("ML26")]);
        setPlan(hb); setPlans({ HB26: hb, DD24: dd, ML26: ml });
      } catch (e: any) { setError(`fixtures: ${e.message}`); }
    })();
  }, []);

  useEffect(() => {
    if (!plan) return;
    const state = { ...SAM_STATE, network: { value: network, status: "USER" }, remaining_deductible: dedKnown ? SAM_STATE.remaining_deductible : { value: null, status: "UNKNOWN" } };
    api.estimate({ plan_ref: "HB26", lines: SAM_LINES, state }).then(setEstimate).catch((e) => setError(`api: ${e.message} — is the API running on :8000 with FINEPRINT_DEV_AUTH=1?`));
  }, [plan, network, dedKnown]);

  const stitches = useMemo(() => (plan ? buildStitches(plan) : []), [plan]);

  async function loadComparison() {
    setTab("compare");
    if (comparison) return;
    try { setComparison(await api.comparison({ plan_refs: ["HB26", "DD24", "ML26"], lines: SAM_LINES, states: { HB26: SAM_STATE } })); }
    catch (e: any) { setError(`api: ${e.message}`); }
  }

  const pdfUrl = "/fixtures/documents/harborview_certificate.pdf";

  return (
    <div className="app">
      <header className="appbar">
        <h1>{UI.appName}</h1>
        <span className="doc-title">{plan?.title ?? "…"}{plan?.is_fictional && <span className="ribbon">{UI.fictional}</span>}</span>
        <nav className="scenario" aria-label="Scenario inputs (entered by you)">
          <label><input type="radio" name="net" checked={network === "in"} onChange={() => setNetwork("in")} /> In-network</label>
          <label><input type="radio" name="net" checked={network === "out"} onChange={() => setNetwork("out")} /> Out-of-network</label>
          <label><input type="checkbox" checked={dedKnown} onChange={(e) => setDedKnown(e.target.checked)} /> Remaining deductible entered ($50)</label>
        </nav>
      </header>
      {error && <p className="error" role="alert">{error}</p>}

      <main className={`panes ${tab}`} style={{ ["--split" as any]: `${split}%` }}>
        {tab !== "compare" && (
          <>
            <div className="pane pane-ledger">
              {estimate && <LedgerView ledger={estimate.ledger} movers={estimate.movers} stitches={stitches} selected={selected} onSelect={(s) => { setSelected(s); }} />}
            </div>
            <div className="divider" role="separator" aria-orientation="horizontal" aria-valuenow={split} tabIndex={0}
                 onKeyDown={(e) => { if (e.altKey && e.key === "ArrowUp") setSplit((v) => Math.max(20, v - 5)); if (e.altKey && e.key === "ArrowDown") setSplit((v) => Math.min(90, v + 5)); }}
                 onPointerDown={(e) => {
                   const startY = e.clientY, start = split, h = (e.currentTarget.parentElement as HTMLElement).clientHeight;
                   const move = (ev: PointerEvent) => setSplit(Math.min(90, Math.max(20, start + ((ev.clientY - startY) / h) * 100)));
                   const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                   window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
                 }}>≡</div>
            <div className="pane pane-page">
              {plan && <PageView url={pdfUrl} stitches={stitches} selected={selected} onSelect={(s) => setSelected(s)} />}
            </div>
          </>
        )}
        {tab === "compare" && comparison && <ComparisonGrid data={comparison} plans={plans} />}
      </main>

      {selected && estimate && <ClauseCard stitch={selected} lines={estimate.ledger.lines} onClose={() => setSelected(undefined)} onOpenOnPage={(s) => { setSelected(s); setTab("page"); }} />}

      <nav className="bottom" aria-label="Views">
        <button type="button" aria-current={tab === "ledger"} onClick={() => setTab("ledger")}>Ledger · Page</button>
        <button type="button" aria-current={tab === "compare"} onClick={loadComparison}>Compare</button>
        <a href="/fixtures/plans/hb26.json" target="_blank" rel="noreferrer">Rules (JSON)</a>
      </nav>
      <footer className="footer">{FOOTER}</footer>
    </div>
  );
}
