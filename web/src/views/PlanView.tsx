import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { LANDMARKS, UI, type LandmarkId } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { ledgerEvidence } from "@/lib/compass-model";
import { modeOf, summaryFor, type UploadSummary } from "@/lib/plan-catalog";
import { money } from "@/lib/stitches";
import type { Benefits, Stitch } from "@/lib/types";
import type { AppData } from "@/hooks/useAppData";
import { PlanAtlas } from "@/components/atlas/PlanAtlas";
import { BenefitsCompass } from "@/components/compass/BenefitsCompass";
import { CostTrail, MissingInputs } from "@/components/CostTrail";
import { LandmarkContent } from "@/components/LandmarkContent";
import { Money } from "@/components/Money";
import { PlanSelector } from "@/components/plan/PlanSelector";
import { TreatmentPlanImporter } from "@/components/plan/TreatmentPlanImporter";
import { EvidenceBadge } from "@/components/Primitives";
import { UploadWizard } from "@/components/upload/UploadWizard";

export interface PlanViewProps {
  data: AppData;
  mobile: boolean;
  landmark: LandmarkId | null;
  onLandmark: (id: LandmarkId | null) => void;
  stitch: Stitch | undefined;
  onStitch: (s: Stitch | undefined) => void;
  onOpenDocuments: () => void;
}

/**
 * My plan (spec §2.2, §6 `PlanView`, §7): the PlanSelector (Preset / Upload switch, carrier → plan → year cascade, and the single
 * `label.plan-pick select` of plan codes kept as the fast path), the eligibility line, the five-landmark PlanAtlas, the Benefits compass
 * titled by the question it answers, "Add a procedure", and the landmark detail (LandmarkContent with the depth dial; CostTrail on the
 * lighthouse; MissingInputs). Uploaded plans (`upload:<id>`, version UPn) render through the same path: `useAppData` already routes the
 * model/rules/evidence; the summary comes from GET /me/plans. Benefit statement figures recorded here are kept per plan ref (nothing
 * transfers) and shown back immediately while the records reload. One aria-live region announces recalculation and updates.
 */
export function PlanView({ data, mobile, landmark, onLandmark, stitch, onStitch, onOpenDocuments }: PlanViewProps) {
  const { plans, planRef, selectPlan, plan, rules, benefits, estimate, stitches, procedures, reestimate, loadRecords, loading } = data;
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [mode, setMode] = useState<"preset" | "upload">(modeOf(planRef));
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [savedBenefits, setSavedBenefits] = useState<Record<string, Benefits>>({});
  const [live, setLive] = useState("");

  const refreshUploads = useCallback(() => {
    api.myPlans().then((r) => setUploads(r.items as UploadSummary[])).catch(() => setUploads([])).finally(() => setUploadsLoading(false));
  }, []);
  useEffect(() => { refreshUploads(); }, [refreshUploads]);
  useEffect(() => { setMode(modeOf(planRef)); }, [planRef]);

  // live region: recalculating while the plan effect runs; "Estimate updated" once per new estimate id
  useEffect(() => { if (loading) setLive(PLAN.recalculating); }, [loading]);
  useEffect(() => { if (estimate?.id) setLive(PLAN.estimateUpdated); }, [estimate?.id]);

  const summary = summaryFor(planRef, plans, uploads);
  const benefitsFor = savedBenefits[planRef] ?? benefits.find((b) => b.plan_code === planRef) ?? null;
  const upload = modeOf(planRef) === "upload" ? (summary as UploadSummary | null) : null;

  const landmarkSummary = useMemo(() => {
    if (!plan) return {} as Partial<Record<LandmarkId, string>>;
    const fmt = (v: { value: number | null; unlimited?: boolean } | undefined) => (!v ? UI.notStated : v.unlimited ? "unlimited" : v.value == null ? UI.notStated : money(v.value));
    return {
      harbor: `${summary?.option ?? upload?.version_label ?? ""}${plan.is_fictional ? " · fictional" : ""}`,
      bridge: fmt(plan.deductible_individual),
      cove: plan.classes.map((c) => `${c.plan_share_bp_in.value != null ? c.plan_share_bp_in.value / 100 : "?"}%`).join(" / "),
      lookout: fmt(plan.annual_max),
      lighthouse: estimate ? (estimate.status === "estimate" ? `you pay ${money(estimate.user_estimated_payment_cents)}` : "waiting for information") : "no planned procedures",
    } as Partial<Record<LandmarkId, string>>;
  }, [plan, estimate, summary, upload]);

  const landmarkNode = useMemo(() => {
    if (!plan) return {} as Partial<Record<LandmarkId, ReactNode>>;
    const fig = (v: { value: number | null; unlimited?: boolean; status: Benefits["conflict"] extends infer _ ? any : never } | undefined) =>
      !v ? UI.notStated : v.unlimited ? PLAN.unlimited : v.value == null ? UI.notStated : <Money cents={v.value} evidence={v.status} badge={false} />;
    return {
      bridge: fig(plan.deductible_individual),
      lookout: fig(plan.annual_max),
      lighthouse: estimate ? (estimate.status === "estimate" ? <>you pay <Money cents={estimate.user_estimated_payment_cents} evidence={ledgerEvidence(estimate)} badge={false} /></> : PLAN.waitingForInfo) : "no planned procedures",
    } as Partial<Record<LandmarkId, ReactNode>>;
  }, [plan, estimate]);

  function pickLandmark(id: LandmarkId) { setDepth(1); onLandmark(id); }
  function openLandmarkDeep(id: LandmarkId) { setDepth(3); onLandmark(id); }
  function onBenefitsSaved(b: Benefits) { setSavedBenefits((m) => ({ ...m, [planRef]: b })); setLive(PLAN.benefitsUpdated); loadRecords(); reestimate(); }

  const uploadSlot = (
    <UploadWizard planRef={planRef} onPublished={(s) => { refreshUploads(); selectPlan(s.plan_code); reestimate(); }} />
  );

  return (
    <div className={`plan-layout ${landmark ? "" : "is-solo"}`}>
      <div className="plan-main">
        {/* the view's own h2 (spec §9.1: one h1, an h2 per view, no skipped levels); the compass question is the h3 under it */}
        <h2 className="sr-only">{PLAN.viewTitle}</h2>
        <div className="plan-head">
          <PlanSelector plans={plans} uploads={uploads} uploadsLoading={uploadsLoading} value={planRef} onChange={(ref) => { selectPlan(ref); onStitch(undefined); }} mode={mode} onMode={setMode} uploadSlot={uploadSlot} />
          {!planRef && <p className="plan-empty">{PLAN.noPlan}</p>}
          {summary && (
            <p className="muted small plan-banner">
              {upload ? <span className="ribbon">{PLAN.uploadedRibbon(upload.version_label)}</span> : summary.is_fictional ? <span className="ribbon">{UI.fictional}</span> : <span className="ribbon real">{UI.realPlan}</span>}
              {summary.is_fictional && upload ? <span className="ribbon">{UI.fictional}</span> : null}
              {summary.currency_note ? ` ${UI.outdated} · ` : " "}{UI.availabilityBanner}
            </p>
          )}
        </div>
        <PlanAtlas selected={landmark} onSelect={pickLandmark} summary={landmarkSummary} summaryNode={landmarkNode} compact={mobile} />
        {!landmark && <p className="hint">{PLAN.landmarkHint}</p>}
        {plan && <BenefitsCompass plan={plan} benefits={benefitsFor} estimate={estimate} stitches={stitches} onOpenLandmark={openLandmarkDeep} onSelectStitch={onStitch} selectedStitch={stitch} />}
        {procedures.length > 0 && (
          <details className="plan-add">
            <summary>{PLAN.addTitle}</summary>
            <TreatmentPlanImporter procedures={procedures} onAdded={() => { setLive(PLAN.recalculating); loadRecords(); reestimate(); }} />
          </details>
        )}
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
      </div>
      <aside className={`detail ${mobile ? "sheet" : "side"} ${landmark ? "" : "is-empty"}`} aria-label="Landmark details">
        {landmark && plan && summary && (
          <>
            <div className="detail-bar"><p className="crumbs">{LANDMARKS.find((l) => l.id === landmark)?.place}</p><button type="button" className="close" aria-label="Close details" onClick={() => onLandmark(null)}>×</button></div>
            <div className="detail-body">
              <LandmarkContent landmark={landmark} plan={plan} summary={summary} benefits={benefitsFor} rules={rules} estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope onOpenDocuments={onOpenDocuments}
                               depth={depth} onDepth={setDepth} planRef={planRef} onBenefitsSaved={onBenefitsSaved} />
              {landmark === "lighthouse" && (estimate ? <CostTrail estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope /> : (
                <>
                  <p className="muted"><EvidenceBadge status="UNKNOWN" /> {PLAN.noProcedures}</p>
                  {procedures.length > 0 && <TreatmentPlanImporter procedures={procedures} onAdded={() => { setLive(PLAN.recalculating); loadRecords(); reestimate(); }} compact />}
                </>
              ))}
              {landmark !== "lighthouse" && estimate?.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default PlanView;
