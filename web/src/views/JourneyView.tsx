import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PASSAGE } from "@/lib/copy/passage";
import { DRAWER, UI, type LandmarkId } from "@/lib/copy";
import { currentStageId, labeledSamples, shortJourneyLabel } from "@/lib/journey";
import { buildPassage, itemRef, planDisplayCode, type AnswerTarget } from "@/lib/passage";
import type { JourneyView as JourneyViewModel, MapSelection, SavedEstimate, Stage, Stitch } from "@/lib/types";
import type { AppData } from "@/hooks/useAppData";
import type { JourneySelectionApi } from "@/hooks/useJourneySelection";
import { CinematicStage } from "@/components/atlas/CinematicStage";
import { PassageSides, PassageVertical } from "@/components/atlas/PassageVertical";
import { DetailPanel } from "@/components/DetailPanel";
import { Money } from "@/components/Money";
import { ProcedureDrawer } from "@/components/drawer/ProcedureDrawer";
import { AnswersLog } from "@/components/journey/AnswersLog";
import { CareTimeline } from "@/components/journey/CareTimeline";
import { OverviewList } from "@/components/OverviewList";

export interface JourneyViewProps {
  data: AppData;
  selection: JourneySelectionApi;
  onOpenLandmark: (id: LandmarkId) => void;
  onOpenDocuments: () => void;
  /** Opens the ClauseCard for a stitch pressed on the passage or in the drawer (wired by App). */
  onSelectStitch?: (s: Stitch) => void;
}

/**
 * My journey (mobile-only app; spec §2, §4.3): the start screen for a new user, or
 *  1. the CinematicStage: a compact title card over the painted sky (the journey's short name and ONE facts line, "5 of 13 checkpoints
 *     completed · you pay $902.00 · plan $1,098.00" with its calculated label), then the Passage painted full-bleed down the coast;
 *  2. below the map, native list sections: "Journey details" (the full title, the Answers log, what completion means, the journey picker
 *     and "Add a journey"), the islets completed on the statement and the islands mentioned at the consultation, the Care timeline, and
 *     the Overview list (the same route as tables) in a disclosure.
 * Tapping an island opens the ProcedureDrawer bottom sheet (the stage camera dollies the island above it); a care stage opens the
 * DetailPanel sheet. One aria-live region: "Recalculating…" while a new estimate runs, "Estimate updated" when it lands.
 * Keyboard: Escape closes the top-most surface (the ClauseCard first, then the sheet) and returns focus to its opener.
 */
/** Journey labels arrive with an em dash ("Sample journey — Alex Chen …"); the heading reads it as a label and a colon (copy rule R-02). */
const headingLabel = (label: string) => label.replace(/\s+—\s+/, ": ").replace(/\s+—\s+/g, ", ");
/** The title card's name: the person (or the journey's own label), without the "sample" tag the ribbon already carries. */
const stageTitle = (label: string) => shortJourneyLabel(label.replace(/^Sample journey\s*[:—-]\s*/, "Sample journey: ")).replace(/\s+·\s+sample$/, "");

/** The facts line's cost half: the engine totals with their calculated label, or the honest waiting / missing state. */
function CostFact({ estimate, recalculating }: { estimate: SavedEstimate | null; recalculating: boolean }) {
  if (recalculating) return <span className="cin-fact">{PASSAGE.recalculating}</span>;
  if (!estimate) return <span className="cin-fact">{PASSAGE.noEstimate}</span>;
  if (estimate.status !== "estimate" || estimate.user_estimated_payment_cents == null) return <span className="cin-fact">{PASSAGE.waitingInputs(estimate.missing_inputs.length)}</span>;
  const hypo = Object.keys(estimate.inputs?.hypotheticals ?? {}).length > 0;
  return (
    <span className="cin-fact cin-fact-cost">
      {PASSAGE.youPay} <Money cents={estimate.user_estimated_payment_cents} evidence="DOC" badge={false} calc />
      <span className="cin-sep" aria-hidden="true"> · </span>
      {PASSAGE.insurancePays} <Money cents={estimate.insurer_estimated_payment_cents} evidence="DOC" badge={false} calc />
      {estimate.plan_payment_is_upper_bound ? ` ${PASSAGE.upperBoundParen}` : ""}{hypo ? ` ${PASSAGE.withHypothetical}` : ""}
    </span>
  );
}

function Facts({ view, estimate, recalculating }: { view: JourneyViewModel; estimate: SavedEstimate | null; recalculating: boolean }) {
  const calc = !recalculating && !!estimate && estimate.status === "estimate" && estimate.user_estimated_payment_cents != null;
  return (
    <>
      <p className="cin-fact-line num">
        <span className="cin-fact">{view.progress.label}</span>
        <span className="cin-sep" aria-hidden="true"> · </span>
        <CostFact estimate={estimate} recalculating={recalculating} />
      </p>
      {calc && <span className="fig-calc cin-calc" aria-hidden="true">{DRAWER.calculatedCited}</span>}
    </>
  );
}

export function JourneyView({ data, selection, onOpenLandmark, onOpenDocuments, onSelectStitch }: JourneyViewProps) {
  const { view, journeys, samples, plans, busy, startJourney, setView, patch, instructions, items, estimate, benefits, rules, plan, procedures, stitches, planRef, loading, loadRecords, reestimate, hypotheticals, setHypotheticals } = data;
  /** The drawer's Allowance input and the Benefit statement form change private records: reload them and re-run the estimate. */
  const onRecordsChanged = () => { loadRecords(); reestimate(); };
  const [announce, setAnnounce] = useState("");
  const [addFrom, setAddFrom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const lastEstimateId = useRef<string | null>(null);
  const realCount = plans.filter((p) => !p.is_fictional).length;
  const newUser = journeys !== null && journeys.length === 0 && !view;
  const stage = selection.selection.stage ?? null;
  const islandSel = selection.selection.island ?? null;
  const benefitsFor = useMemo(() => benefits.find((b) => b.plan_code === planRef) ?? null, [benefits, planRef]);
  const vm = useMemo(() => buildPassage({ items, estimate, benefits: benefitsFor, journey: view, rules, plan, procedures, stitches, planRef }), [items, estimate, benefitsFor, view, rules, plan, procedures, stitches, planRef]);
  const recalculating = !!loading && loading === UI.processing && !!estimate;
  const planCode = planDisplayCode(planRef, plan);
  const drawKey = `${planRef}:${vm.islands.map((i) => i.id).join(",")}`;
  const allIslands = useMemo(() => [vm.start, ...vm.islands, vm.destination, ...vm.visited, ...vm.marginal], [vm]);
  const selectedIsland = islandSel ? allIslands.find((i) => i.id === islandSel.islandId) ?? null : null;

  // one live region: recalculating → updated (never on the first load)
  useEffect(() => {
    if (!estimate) { lastEstimateId.current = null; return; }
    if (lastEstimateId.current && lastEstimateId.current !== estimate.id) setAnnounce(PASSAGE.estimateUpdated);
    lastEstimateId.current = estimate.id;
  }, [estimate?.id]);
  useEffect(() => { if (recalculating) setAnnounce(PASSAGE.recalculating); }, [recalculating]);

  const selectIsland = useCallback((islandId: string, checkpointKey: string | undefined, el: HTMLElement | null, _viaKeyboard?: boolean) => {
    selection.selectIsland({ islandId, checkpointKey } as MapSelection, el);
  }, [selection]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    if (document.querySelector('[role="dialog"][aria-modal="true"], .clause[role="dialog"]')) return;   // the top-most surface closes first
    if (islandSel || stage) { e.preventDefault(); selection.clear(); }
  };

  const focusIn = (sel: string) => { const el = rootRef.current?.querySelector<HTMLElement>(sel); el?.focus(); return !!el; };
  /** An Answers-log row moves focus to the thing it names: everything lives on this one scrolling view. */
  const onAnswer = (target: AnswerTarget) => {
    if (target === "documents") { onOpenDocuments(); return; }
    if (target === "stage") { const id = view?.progress.current_stage ?? (view ? currentStageId(view.journey) : null); if (id) focusIn(`[data-stage-btn="${id}"]`); return; }
    if (target === "island") focusIn(vm.islands[0] ? `[data-island="${vm.islands[0].id}"]` : ".pv-start button");
    if (target === "light") focusIn(".pv-light button");
    if (target === "checkpoint") { const first = vm.islands[0]; if (!first || !focusIn(".pv-cps .pv-cp")) focusIn(first ? `[data-island="${first.id}"]` : ".pv-light button"); }
  };
  const linkedIsland = useCallback((s: Stage) => vm.islands.find((i) => i.item && (s.linked_treatment_items ?? []).includes(itemRef(i.item)))?.id ?? null, [vm]);

  // still loading the journeys list: reserve the space instead of painting a start screen that is replaced a moment later (mobile-18)
  if (journeys === null && !view) return <div className="start-pending" aria-hidden="true" />;
  if (newUser || !view) {
    return (
      <section className="start" aria-labelledby="start-h">
        <h2 id="start-h">{UI.newUserTitle}</h2>
        <p>{UI.newUserBody}</p>
        <div className="start-actions">
          <button type="button" disabled={busy} onClick={() => startJourney("empty")}>Start my journey (no documents yet)</button>
          {labeledSamples(samples).map((s) => <button key={s.id} type="button" className="secondary" disabled={busy} onClick={() => startJourney(s.id)}>{UI.loadSample}: {s.label.replace(/^Sample journey\s*[—:]\s*/, "")}</button>)}
        </div>
        <p className="muted small">Plan presets: {plans.length} ({realCount} from public plan documents, {plans.length - realCount} fictional demonstration plans). {UI.availabilityBanner}</p>
      </section>
    );
  }

  const drawer = islandSel && selectedIsland && plan ? (
    <ProcedureDrawer island={selectedIsland} vm={vm} plan={plan} rules={rules} benefits={benefitsFor} estimate={estimate} stitches={stitches} selectedCheckpoint={islandSel.checkpointKey}
                     onSelectStitch={(s) => onSelectStitch?.(s)} onOpenDocuments={onOpenDocuments} onClose={() => { selection.clear(); }} returnFocus={selection.returnFocusRef.current} onRecordsChanged={onRecordsChanged} stageProgress={view.progress.stages} planRef={planRef} hypotheticals={hypotheticals} onHypotheticals={setHypotheticals} />
  ) : null;
  const stagePanel = stage ? <DetailPanel view={view} selection={stage} onSelect={(s) => selection.selectStage(s)} onOpenLandmark={onOpenLandmark} onOpenDocuments={onOpenDocuments} onPatch={patch} onInstructions={instructions} busy={busy} estimate={estimate} onClose={() => selection.clear()} returnFocus={selection.returnFocusRef.current} /> : null;
  const fullTitle = headingLabel(view.journey.label);

  return (
    <div ref={rootRef} className="passage-layout journey-phone" onKeyDown={onKeyDown}>
      <p className="sr-only" aria-live="polite" role="status">{announce}</p>
      <CinematicStage art="journey" title={<span title={fullTitle}>{stageTitle(view.journey.label)}</span>} facts={<Facts view={view} estimate={estimate} recalculating={recalculating} />}>
        {!plan && <p className="hint cin-hint">{PASSAGE.noPlanSelected}</p>}
        <PassageVertical vm={vm} selected={islandSel} onSelect={selectIsland} planCode={planCode} onSelectStitch={onSelectStitch} drawKey={drawKey} />
      </CinematicStage>

      {/* the rest of the journey head, below the map (the pickers keep their accessible names "Journey" and "Add a journey") */}
      <details className="journey-switch journey-details journey-section">
        <summary>{PASSAGE.journeyDetails}</summary>
        <p className="jd-title"><span className="jd-term">{PASSAGE.journeyTitleLabel}</span> {fullTitle}</p>
        <AnswersLog vm={vm} view={view} plan={plan} estimate={estimate} recalculating={recalculating} onFocus={onAnswer} />
        {/* the one place the completion disclaimer is printed on My journey (not repeated in the stage panel or the overview) */}
        <details className="progress-note"><summary>{PASSAGE.whatCompletionMeans}</summary><p>{view.progress.note || UI.progressNote}</p></details>
        <div className="journey-pickers">
          {journeys && journeys.length > 0 && samples.length > 0 && <select aria-label="Journey" title={fullTitle} value={view.id} onChange={(e) => { const v = journeys.find((j) => j.id === e.target.value); if (v) setView(v); }}>
            {journeys.map((j) => <option key={j.id} value={j.id} title={headingLabel(j.journey.label)}>{shortJourneyLabel(j.journey.label)}</option>)}</select>}
          {/* choosing an option only selects it; the journey is created by the Add button (a11y-16, SC 3.2.2: arrow keys on a closed
              select must not create journeys) */}
          <form className="add-journey-form" onSubmit={(e) => { e.preventDefault(); if (addFrom) { const from = addFrom; setAddFrom(""); void startJourney(from); } }}>
            <select className="add-journey" aria-label="Add a journey" value={addFrom} onChange={(e) => setAddFrom(e.target.value)}><option value="">Add another journey…</option><option value="empty">Empty (no documents yet)</option>{labeledSamples(samples).filter((s) => s.id !== "empty").map((s) => <option key={s.id} value={s.id}>{headingLabel(s.label)}</option>)}</select>
            <button type="submit" className="secondary" disabled={!addFrom || busy}>{UI.addJourney}</button>
          </form>
        </div>
      </details>

      <PassageSides vm={vm} selected={islandSel} onSelect={selectIsland} />

      <section id="care-timeline" className="journey-section" aria-labelledby="care-timeline-h">
        <h3 id="care-timeline-h" className="journey-section-h">{PASSAGE.careTimeline}</h3>
        <CareTimeline journey={view.journey} progress={view.progress} selected={stage} onSelect={(s, el) => selection.selectStage(s, el)} currentStageId={currentStageId(view.journey)} linkedIsland={linkedIsland}
                      onShowOnChart={(id) => selectIsland(id, undefined, null, true)} />
      </section>

      <details className="journey-overview journey-section">
        <summary>{PASSAGE.overviewHeading}</summary>
        <p className="muted small">{PASSAGE.overviewNote}</p>
        <OverviewList journey={view.journey} vm={vm} planTitle={plan?.title} onSelect={(s) => selection.selectStage(s)} onSelectIsland={(id, cp) => { selectIsland(id, cp, null, true); }} onSelectStitch={onSelectStitch} />
      </details>

      {drawer}{stagePanel}
    </div>
  );
}

export default JourneyView;
