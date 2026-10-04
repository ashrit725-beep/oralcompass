import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { BADGE_LABEL, LANDMARKS, UI, type LandmarkId } from "@/lib/copy";
import { PLAN, PLAN_MAP } from "@/lib/copy/plan";
import { fastPathLabel, modeOf, summaryFor, type UploadSummary } from "@/lib/plan-catalog";
import { money } from "@/lib/stitches";
import type { Benefits, Evidence, PlanFixture, SavedEstimate, Stitch, VJson } from "@/lib/types";
import type { AppData } from "@/hooks/useAppData";
import { CinematicStage } from "@/components/atlas/CinematicStage";
import { PlanAtlas, type PlanStop } from "@/components/atlas/PlanAtlas";
import { BenefitsCompass } from "@/components/compass/BenefitsCompass";
import { CostTrail, MissingInputs } from "@/components/CostTrail";
import { LandmarkContent } from "@/components/LandmarkContent";
import { Money } from "@/components/Money";
import { PlanSelector } from "@/components/plan/PlanSelector";
import { TreatmentPlanImporter } from "@/components/plan/TreatmentPlanImporter";
import { EvidenceBadge } from "@/components/Primitives";
import { Sheet } from "@/components/Primitives/Sheet";
import { UploadWizard } from "@/components/upload/UploadWizard";

export interface PlanViewProps {
  data: AppData;
  landmark: LandmarkId | null;
  onLandmark: (id: LandmarkId | null) => void;
  stitch: Stitch | undefined;
  onStitch: (s: Stitch | undefined) => void;
  onOpenDocuments: () => void;
}

const evidenceAria = (e: Evidence) => BADGE_LABEL[e] ?? e;

/** One money landmark (deductible, annual maximum): the figure + its badge, or the words + UNKNOWN; never a placeholder number. */
function moneyStop(v: VJson<number> | undefined | null): PlanStop {
  if (!v) return { value: UI.notStated, evidence: <EvidenceBadge status="UNKNOWN" />, aria: `${UI.notStated}, ${evidenceAria("UNKNOWN")}`, state: "unknown" };
  if (v.unlimited) return { value: PLAN.unlimitedShort, evidence: <EvidenceBadge status={v.status} />, aria: `${PLAN.unlimitedShort}, ${evidenceAria(v.status)}` };
  if (v.value == null) return { value: UI.notStated, evidence: <EvidenceBadge status={v.status} />, aria: `${UI.notStated}, ${evidenceAria(v.status)}`, state: "unknown" };
  return { value: <Money cents={v.value} evidence={v.status} badge={false} />, evidence: <EvidenceBadge status={v.status} />, aria: `${money(v.value)}, ${evidenceAria(v.status)}` };
}

function coveStop(plan: PlanFixture): PlanStop {
  const shares = plan.classes.map((c) => c.plan_share_bp_in);
  if (!shares.length || shares.every((s) => s.value == null)) return { value: UI.notStated, evidence: <EvidenceBadge status="UNKNOWN" />, aria: `${UI.notStated}, ${evidenceAria("UNKNOWN")}`, state: "unknown" };
  const status: Evidence = shares.some((s) => s.value == null) ? "UNKNOWN" : shares.find((s) => s.status !== "DOC")?.status ?? "DOC";
  const text = shares.map((s) => (s.value == null ? "?" : `${s.value / 100}%`)).join("\u00a0/ ");   // a share never starts a line with its slash
  return { value: <span className="pa-pcts"><span className="pa-word">{PLAN_MAP.planPays}</span> <span className="pa-pct">{text}</span></span>, evidence: <EvidenceBadge status={status} />, aria: `${PLAN_MAP.planPays} ${text}, ${evidenceAria(status)}` };
}

function lighthouseStop(estimate: SavedEstimate | null): PlanStop {
  if (!estimate) return { value: PLAN_MAP.noPlanned, aria: PLAN_MAP.noPlanned, state: "unknown" };
  if (estimate.status !== "estimate" || estimate.user_estimated_payment_cents == null) return { value: PLAN_MAP.waiting, evidence: <EvidenceBadge status="UNKNOWN" />, aria: `${PLAN_MAP.waiting}, ${evidenceAria("UNKNOWN")}`, state: "fog" };
  return {
    value: <><span className="pa-word">{PLAN_MAP.youPay}</span> <Money cents={estimate.user_estimated_payment_cents} evidence="DOC" badge={false} calc /></>,
    evidence: <span className="fig-calc">{PLAN_MAP.calculated}</span>,
    aria: `${PLAN_MAP.youPay} ${money(estimate.user_estimated_payment_cents)}, ${PLAN_MAP.calculated}`,
  };
}

/**
 * My plan (spec §2.2, §7; owner directions 05:58 and 06:00: one phone layout, the plan map in the journey's Passage concept, full-bleed
 * and cinematic). Top to bottom: the CinematicStage "plan" (title card: the plan's short name, its source ribbon and the calculated
 * "you pay · plan" line; the PlanAtlas with the five landmarks as painted stops on the inked route), then native sections: the plan
 * document (PlanSelector: Preset / Upload switch and the single `label.plan-pick select` of plan codes), the Benefits compass and "Add a
 * procedure". A landmark opens its LandmarkContent (depth dial; CostTrail on the lighthouse; MissingInputs) in the bottom sheet, and the
 * camera dollies the stop into the strip above it. Uploaded plans (`upload:<id>`, version UPn) render through the same path. Benefit
 * statement figures recorded here are kept per plan ref (nothing transfers). One aria-live region announces recalculation and updates.
 */
export function PlanView({ data, landmark, onLandmark, stitch, onStitch, onOpenDocuments }: PlanViewProps) {
  const { plans, planRef, selectPlan, plan, rules, benefits, estimate, stitches, procedures, reestimate, loadRecords, loading } = data;
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  const [mode, setMode] = useState<"preset" | "upload">(modeOf(planRef));
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [savedBenefits, setSavedBenefits] = useState<Record<string, Benefits>>({});
  const [live, setLive] = useState("");
  const returnRef = useRef<HTMLElement | null>(null);

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
  const ribbon = upload ? PLAN.uploadedRibbon(upload.version_label) : summary?.is_fictional ? UI.fictional : summary ? UI.realPlan : null;

  const stops = useMemo<Partial<Record<LandmarkId, PlanStop>>>(() => {
    if (!plan) return {};
    const option = (summary && "option" in summary && typeof summary.option === "string" ? summary.option : null) ?? upload?.version_label ?? plan.title;
    return {
      harbor: { value: option, evidence: ribbon ? <span className={`ribbon pa-ribbon ${summary?.is_fictional || upload ? "" : "real"}`}>{ribbon}</span> : undefined, aria: [option, ribbon].filter(Boolean).join(", ") },
      bridge: moneyStop(plan.deductible_individual),
      cove: coveStop(plan),
      lookout: moneyStop(plan.annual_max),
      lighthouse: lighthouseStop(estimate),
    };
  }, [plan, estimate, summary, upload, ribbon]);

  function pickLandmark(id: LandmarkId, el: HTMLElement | null) { returnRef.current = el; setDepth(1); onLandmark(id); }
  function openLandmarkDeep(id: LandmarkId) { returnRef.current = document.activeElement as HTMLElement | null; setDepth(3); onLandmark(id); }
  function onBenefitsSaved(b: Benefits) { setSavedBenefits((m) => ({ ...m, [planRef]: b })); setLive(PLAN.benefitsUpdated); loadRecords(); reestimate(); }

  const uploadSlot = (
    <UploadWizard planRef={planRef} onPublished={() => { refreshUploads(); }} onUsePlan={(ref) => { selectPlan(ref); reestimate(); }} />
  );

  const title = upload ? upload.title : summary ? fastPathLabel(summary) : PLAN.viewTitle;
  const facts = (
    <p className="pa-facts">
      {ribbon && <span className={`ribbon ${summary?.is_fictional || upload ? "" : "real"}`}>{ribbon}</span>}
      {estimate && (estimate.status === "estimate" && estimate.user_estimated_payment_cents != null ? (
        <span className="pa-facts-line">
          {PLAN_MAP.youPay} <Money cents={estimate.user_estimated_payment_cents} evidence="DOC" badge={false} calc />
          <span aria-hidden="true"> · </span>{PLAN_MAP.plan} <Money cents={estimate.insurer_estimated_payment_cents} evidence="DOC" badge={false} calc />
          {estimate.plan_payment_is_upper_bound ? <> {PLAN_MAP.upperBound}</> : null}
          {" "}<span className="calc-note">{PLAN_MAP.calculated}</span>
        </span>
      ) : (
        <span className="pa-facts-line">{PLAN_MAP.waiting} <EvidenceBadge status="UNKNOWN" /></span>
      ))}
    </p>
  );
  const meta = landmark ? LANDMARKS.find((l) => l.id === landmark) : undefined;
  const sheetOpen = !!(landmark && plan && summary);

  return (
    <div className="plan-view">
      <div className="plan-main">
        {/* the view's own h2 (spec §9.1: one h1, an h2 per view, no skipped levels); the stage title and the compass question are h3s */}
        <h2 className="sr-only">{PLAN.viewTitle}</h2>
        <CinematicStage art="plan" title={<h3 className="pa-title">{title}</h3>} facts={facts}>
          <PlanAtlas selected={sheetOpen ? landmark : null} onSelect={pickLandmark} stops={stops} label={PLAN_MAP.mapLabel} />
        </CinematicStage>
        <p className="plan-hint">{PLAN.landmarkHint}</p>

        <section className="plan-sec plan-doc" aria-labelledby="plan-doc-h">
          <h3 id="plan-doc-h" className="plan-sec-h">{PLAN_MAP.documentSection}</h3>
          <PlanSelector plans={plans} uploads={uploads} uploadsLoading={uploadsLoading} value={planRef} onChange={(ref) => { selectPlan(ref); onStitch(undefined); }} mode={mode} onMode={setMode} uploadSlot={uploadSlot} />
          {!planRef && <p className="plan-empty">{PLAN.noPlan}</p>}
          {summary && (
            <p className="muted small plan-banner">
              {summary.currency_note ? <><EvidenceBadge status="AMBIGUOUS" /> {UI.outdated}. </> : null}{UI.availabilityBanner}
            </p>
          )}
        </section>

        {plan && <BenefitsCompass plan={plan} benefits={benefitsFor} estimate={estimate} stitches={stitches} onOpenLandmark={openLandmarkDeep} onSelectStitch={onStitch} selectedStitch={stitch} />}
        {procedures.length > 0 && (
          <details className="plan-add">
            <summary><span className="plan-add-title">{PLAN.addTitle}</span><span className="plan-add-sub">{PLAN.addSummaryNote}</span></summary>
            <TreatmentPlanImporter procedures={procedures} onAdded={() => { setLive(PLAN.recalculating); loadRecords(); reestimate(); }} />
          </details>
        )}
        <p className="sr-only" role="status" aria-live="polite">{live}</p>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) onLandmark(null); }} returnFocus={returnRef.current} className="plan-sheet"
             title={meta ? <>{meta.term} <span className="pa-sheet-place">{meta.place}</span></> : PLAN.viewTitle}>
        {landmark && plan && summary && (
          <div className="plan-sheet-body">
            <LandmarkContent landmark={landmark} plan={plan} summary={summary} benefits={benefitsFor} rules={rules} estimate={estimate} stitches={stitches} selected={stitch} onSelect={onStitch} prominentScope onOpenDocuments={onOpenDocuments}
                             depth={depth} onDepth={setDepth} planRef={planRef} onBenefitsSaved={onBenefitsSaved} />
            {landmark === "lighthouse" && (estimate ? <CostTrail estimate={estimate} stitches={stitches} rules={rules} selected={stitch} onSelect={onStitch} prominentScope /> : (
              <>
                <p className="muted"><EvidenceBadge status="UNKNOWN" /> {PLAN.noProcedures}</p>
                {procedures.length > 0 && <TreatmentPlanImporter procedures={procedures} onAdded={() => { setLive(PLAN.recalculating); loadRecords(); reestimate(); }} compact />}
              </>
            ))}
            {landmark !== "lighthouse" && estimate?.status === "unresolved" && <MissingInputs estimate={estimate} compact />}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default PlanView;
