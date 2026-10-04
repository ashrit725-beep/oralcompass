import { useMemo } from "react";
import { LANDMARKS, UI, type LandmarkId } from "@/lib/copy";
import { money } from "@/lib/stitches";
import type { Stitch } from "@/lib/types";
import type { AppData } from "@/hooks/useAppData";
import { PlanAtlas } from "@/components/atlas/PlanAtlas";
import { CostTrail, MissingInputs } from "@/components/CostTrail";
import { LandmarkContent } from "@/components/LandmarkContent";
import { EvidenceBadge } from "@/components/Primitives";

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
 * My plan (spec §6 `PlanView`): the plan picker (`label.plan-pick select`, kept as the fast path for keyboard users and
 * tools/screenshots.py), the five-landmark PlanAtlas, and the landmark detail (LandmarkContent, CostTrail on the lighthouse,
 * MissingInputs). Moved out of App.tsx unchanged in behaviour; PlanSelector (carrier → plan → year + Preset/Upload switch),
 * BenefitsCompass, BenefitStatementForm and TreatmentPlanImporter compose in here next.
 */
export function PlanView({ data, mobile, landmark, onLandmark, stitch, onStitch, onOpenDocuments }: PlanViewProps) {
  const { plans, planRef, selectPlan, plan, rules, benefits, estimate, stitches } = data;
  const summary = plans.find((p) => p.plan_code === planRef) ?? null;
  const benefitsFor = benefits.find((b) => b.plan_code === planRef) ?? null;

  const landmarkSummary = useMemo(() => {
    if (!plan) return {} as Partial<Record<LandmarkId, string>>;
    const fmt = (v: { value: number | null; unlimited?: boolean } | undefined) => (!v ? "—" : v.unlimited ? "unlimited" : v.value == null ? UI.notStated : money(v.value));
    return {
      harbor: `${summary?.option ?? ""}${plan.is_fictional ? " · fictional" : ""}`,
      bridge: fmt(plan.deductible_individual),
      cove: plan.classes.map((c) => `${c.plan_share_bp_in.value != null ? c.plan_share_bp_in.value / 100 : "?"}%`).join(" / "),
      lookout: fmt(plan.annual_max),
      lighthouse: estimate ? (estimate.status === "estimate" ? `you pay ${money(estimate.user_estimated_payment_cents)}` : "waiting for information") : "no planned procedures",
    } as Partial<Record<LandmarkId, string>>;
  }, [plan, estimate, summary]);

  return (
    <div className="plan-layout">
      <div className="plan-main">
        <div className="plan-head">
          <label className="plan-pick">Plan <select value={planRef} onChange={(e) => { selectPlan(e.target.value); onStitch(undefined); }}>
            {plans.map((p) => <option key={p.plan_code} value={p.plan_code}>{p.title}{p.is_fictional ? " (fictional)" : ""}</option>)}</select></label>
          {summary && <p className="muted small">{summary.is_fictional ? UI.fictional : UI.realPlan}{summary.currency_note ? ` · ${UI.outdated}` : ""} · {UI.availabilityBanner}</p>}
        </div>
        <PlanAtlas selected={landmark} onSelect={onLandmark} summary={landmarkSummary} compact={mobile} />
        {!landmark && <p className="hint">Each landmark opens one part of the plan. Familiar terms first; the place names are only the map's.</p>}
      </div>
      <aside className={`detail ${mobile ? "sheet" : "side"} ${landmark ? "" : "is-empty"}`} aria-label="Landmark details">
        {landmark && plan && summary && (
          <>
            <div className="detail-bar"><p className="crumbs">{LANDMARKS.find((l) => l.id === landmark)?.place}</p><button type="button" className="close" aria-label="Close details" onClick={() => onLandmark(null)}>×</button></div>
            <div className="detail-body">
              <LandmarkContent landmark={landmark} plan={plan} summary={summary} benefits={benefitsFor} rules={rules} estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope onOpenDocuments={onOpenDocuments} />
              {landmark === "lighthouse" && (estimate ? <CostTrail estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope /> : <p className="muted"><EvidenceBadge status="UNKNOWN" /> No planned procedures are recorded. Add a treatment plan on My journey.</p>)}
              {landmark !== "lighthouse" && estimate?.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default PlanView;
