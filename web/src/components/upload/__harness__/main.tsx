/**
 * Dev-only harness (served by `npm run dev` at /harness.html; not a build input). Mounts the upload wizard, the inline assistant (drawer
 * section + ClauseCard footer paths) and the reminders panel on top of the real `useAppData()` so they can be exercised against the API
 * before App.tsx wires the stubs in. Nothing here ships: `vite build` only bundles index.html.
 */
import { MotionConfig } from "motion/react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@/styles.css";
import { AskAboutStep } from "@/components/assistant/AskAboutStep";
import { ClauseCard } from "@/components/ClauseCard";
import { AskSection } from "@/components/drawer/sections/AskSection";
import { RemindersPanel } from "@/components/notifications/RemindersPanel";
import { StageLoader } from "@/components/StageLoader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UploadWizard } from "@/components/upload/UploadWizard";
import { useAppData } from "@/hooks/useAppData";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import type { AssistScope, UploadedPlanSummary } from "@/lib/types";

function Harness() {
  const data = useAppData();
  const [uploads, setUploads] = useState<UploadedPlanSummary[]>([]);
  const [stitchId, setStitchId] = useState<string | null>(null);
  const [stepKey, setStepKey] = useState("deductible");
  const [lineIndex, setLineIndex] = useState(0);
  const [published, setPublished] = useState<string | null>(null);
  const refreshUploads = () => api.myPlans().then((r) => setUploads(r.items)).catch(() => setUploads([]));
  useEffect(() => { void refreshUploads(); }, []);
  const stitch = data.stitches.find((s) => s.id === stitchId);
  const benefits = data.benefits.find((b) => b.plan_code === data.planRef) ?? null;
  const assistData = useMemo(() => ({ estimate: data.estimate, plan: data.plan, benefits, rules: data.rules, items: data.items, stitches: data.stitches }), [data.estimate, data.plan, benefits, data.rules, data.items, data.stitches]);
  const itemId = data.estimate?.inputs.treatment_item_ids[lineIndex];
  const scope: AssistScope = { plan_ref: data.planRef, ...(data.estimate ? { estimate_id: data.estimate.id, line_index: lineIndex } : {}), ...(itemId ? { treatment_item_id: itemId } : {}), step_key: stepKey };
  const clauseScope: AssistScope | null = stitch ? { plan_ref: data.planRef, ...(data.estimate ? { estimate_id: data.estimate.id } : {}), stitch: `${stitch.doc}#p${stitch.page}` } : null;

  return (
    <div className="app" style={{ padding: 16, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <h1>Harness: upload, assistant, reminders (dev only)</h1>
        <p className="muted small">plan {data.planRef || "none"} · estimate {data.estimate?.id ?? "none"} · journeys {data.journeys?.length ?? "…"} · items {data.items.length}</p>
        {data.loading && <div className="processing"><StageLoader label={data.loading} size="sm" /></div>}
        {data.error && <p className="error">{data.error}</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          {data.journeys && data.journeys.length === 0 && <button type="button" onClick={() => void data.startJourney(data.samples.find((s) => /Alex/.test(s.label))?.id ?? "sample-alex")}>Start the Alex sample</button>}
          <label className="plan-pick" style={{ maxWidth: "100%" }}>Plan
            <select value={data.planRef} onChange={(e) => data.selectPlan(e.target.value)} style={{ maxWidth: "min(100%, 80vw)" }}>
              {data.plans.map((p) => <option key={p.plan_code} value={p.plan_code}>{p.plan_code} · {p.title}</option>)}
              {uploads.map((u) => <option key={u.plan_code} value={u.plan_code}>{u.version_label} · {u.title}</option>)}
            </select>
          </label>
        </div>
      </header>

      <section aria-labelledby="h-upload">
        <h2 id="h-upload">Upload → review → publish</h2>
        <UploadWizard planRef={data.planRef} onPublished={(s, ref) => { setPublished(s.version_label); void refreshUploads(); data.selectPlan(ref); data.reestimate(); }} />
        {published && <p className="small">Published {published}; the picker now lists it.</p>}
      </section>

      <section aria-labelledby="h-ask" style={{ background: "var(--paper-deep)", border: "1px solid var(--rule)", borderRadius: 12, padding: 16 }}>
        <h2 id="h-ask">Drawer section 13</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label>Line <select value={lineIndex} onChange={(e) => setLineIndex(Number(e.target.value))}>{(data.estimate?.ledger.lines ?? []).map((l, i) => <option key={i} value={i}>{l.label}</option>)}</select></label>
          <label>Step key <select value={stepKey} onChange={(e) => setStepKey(e.target.value)}>{["fee", "allowed", "deductible", "share", "max", "you"].map((k) => <option key={k}>{k}</option>)}</select></label>
        </div>
        <AskSection scope={scope} onOpenStitch={setStitchId} data={assistData} />
      </section>

      <section aria-labelledby="h-rem">
        <h2 id="h-rem">Reminders</h2>
        <RemindersPanel refreshKey={`${data.view?.id ?? ""}|${data.planRef}`} />
      </section>

      {stitch && clauseScope && (
        <ClauseCard stitch={stitch} lines={data.estimate?.ledger.lines ?? []} onClose={() => setStitchId(null)} onOpenOnPage={() => undefined}
          askSlot={<AskAboutStep scope={clauseScope} data={assistData} onOpenStitch={setStitchId} />} />
      )}
      <footer className="footer">{UI.appName}</footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: "spring", visualDuration: 0.35 }}>
      <TooltipProvider delayDuration={300}><Harness /></TooltipProvider>
    </MotionConfig>
  </StrictMode>,
);
