import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PASSAGE } from "@/lib/copy/passage";
import { UI, type LandmarkId } from "@/lib/copy";
import { currentStageId, labeledSamples } from "@/lib/journey";
import { transitions, useReducedMotion } from "@/lib/motion";
import { answerSegment, buildPassage, denseFrom, itemRef, planDisplayCode, type AnswerTarget, type JourneySegment } from "@/lib/passage";
import type { MapSelection, Stage, Stitch } from "@/lib/types";
import type { AppData } from "@/hooks/useAppData";
import type { JourneySelectionApi } from "@/hooks/useJourneySelection";
import { PassageMap } from "@/components/atlas/PassageMap";
import { PassageVertical } from "@/components/atlas/PassageVertical";
import { DetailPanel } from "@/components/DetailPanel";
import { ProcedureDrawer } from "@/components/drawer/ProcedureDrawer";
import { AnswersLog } from "@/components/journey/AnswersLog";
import { CareTimeline } from "@/components/journey/CareTimeline";
import { IslandStrip } from "@/components/journey/IslandStrip";
import { OverviewList } from "@/components/OverviewList";

export interface JourneyViewProps {
  data: AppData;
  selection: JourneySelectionApi;
  mobile: boolean;
  onOpenLandmark: (id: LandmarkId) => void;
  onOpenDocuments: () => void;
  /** Opens the ClauseCard for a stitch pressed on the passage or in the drawer (wired by App). */
  onSelectStitch?: (s: Stitch) => void;
}

type Segment = JourneySegment;

/**
 * My journey (spec §2, §4.1, §4.3, §6 `JourneyView`): the start screen for a new user, or the journey head (label, progress line),
 * the Answers log, the three-segment toggle "Map view · Care timeline · Overview list" (exact button names; screenshots.py clicks
 * them), then the Passage (desktop PassageMap + Care timeline rail; phone PassageVertical) / the Care timeline / the Overview list,
 * and the detail surface: the ProcedureDrawer for islands and checkpoints, the existing DetailPanel for care stages. Desktop grid
 * `minmax(0,1fr) 440px` exists only while a selection is open (AnimatePresence + layout, 240 ms; instant under reduced motion).
 * One aria-live region per surface: "Recalculating…" while a new estimate runs, "Estimate updated" when it lands.
 * Keyboard: Escape closes the top-most surface (the ClauseCard first, then the drawer) and returns focus to its opener.
 */
/** Journey labels arrive with an em dash ("Sample journey — Alex Chen …"); the heading reads it as a label and a colon (copy rule R-02). */
const headingLabel = (label: string) => label.replace(/\s+—\s+/, ": ").replace(/\s+—\s+/g, ", ");

export function JourneyView({ data, selection, mobile, onOpenLandmark, onOpenDocuments, onSelectStitch }: JourneyViewProps) {
  const { view, journeys, samples, plans, busy, startJourney, setView, patch, instructions, items, estimate, benefits, rules, plan, procedures, stitches, planRef, loading, loadRecords, reestimate } = data;
  /** The drawer's Allowance input and the Benefit statement form change private records: reload them and re-run the estimate. */
  const onRecordsChanged = () => { loadRecords(); reestimate(); };
  const reduce = useReducedMotion();
  const [segment, setSegment] = useState<Segment>("map");
  const [pointer, setPointer] = useState(false);
  const [announce, setAnnounce] = useState("");
  /** An Answers-log jump waiting for its segment to render (focus moves in an effect after the commit, never through a stale closure). */
  const [pendingFocus, setPendingFocus] = useState<AnswerTarget | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const segPointer = useRef(false);
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

  const selectIsland = useCallback((islandId: string, checkpointKey: string | undefined, el: HTMLElement | null, viaKeyboard: boolean) => {
    setPointer(!viaKeyboard);
    selection.selectIsland({ islandId, checkpointKey } as MapSelection, el);
  }, [selection]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    if (document.querySelector('[role="dialog"][aria-modal="true"], .clause[role="dialog"]')) return;   // the top-most surface closes first
    if (islandSel || stage) { e.preventDefault(); selection.clear(); }
  };

  const focusIn = (sel: string) => { const el = rootRef.current?.querySelector<HTMLElement>(sel); el?.focus(); return !!el; };
  /** Move focus to what an Answers-log row names; the segment that shows it is already rendered. */
  const focusAnswer = (target: AnswerTarget) => {
    if (target === "stage") { const id = view?.progress.current_stage ?? (view ? currentStageId(view.journey) : null); if (id) focusIn(`[data-stage-btn="${id}"]`); return; }
    if (target === "island") focusIn(vm.islands[0] ? `[data-island="${vm.islands[0].id}"]` : ".start-btn, .pv-start button");
    if (target === "light") focusIn(".light-btn, .pv-light button");
    if (target === "checkpoint") { const first = vm.islands[0]; if (!first || !focusIn(`[data-cp-of="${first.id}"], .pv-cps .pv-cp`)) focusIn(first ? `[data-island="${first.id}"]` : ".light-btn"); }
  };
  const onAnswer = (target: AnswerTarget) => {
    const need = answerSegment(target, mobile, segment);
    if (need === null) { onOpenDocuments(); return; }
    if (need !== segment) { setSegment(need); setPendingFocus(target); return; }
    focusAnswer(target);
  };
  // runs once after the requested segment has rendered, then clears itself (no timer chain, nothing left running after unmount)
  useEffect(() => {
    if (!pendingFocus) return;
    setPendingFocus(null);
    focusAnswer(pendingFocus);
  }, [pendingFocus, segment]);
  const linkedIsland = useCallback((s: Stage) => vm.islands.find((i) => i.item && (s.linked_treatment_items ?? []).includes(itemRef(i.item)))?.id ?? null, [vm]);

  if (newUser || !view) {
    return (
      <section className="start" aria-labelledby="start-h">
        <h2 id="start-h">{UI.newUserTitle}</h2>
        <p>{UI.newUserBody}</p>
        <div className="start-actions">
          <button type="button" disabled={busy} onClick={() => startJourney("empty")}>Start my journey (no documents yet)</button>
          {labeledSamples(samples).map((s) => <button key={s.id} type="button" className="secondary" disabled={busy} onClick={() => startJourney(s.id)}>{UI.loadSample}: {s.label.replace("Sample journey — ", "")}</button>)}
        </div>
        <p className="muted small">Plan presets: {plans.length} ({realCount} from public plan documents, {plans.length - realCount} fictional demonstration plans). {UI.availabilityBanner}</p>
      </section>
    );
  }

  const hasDetail = !!(islandSel || stage);
  const drawer = islandSel && selectedIsland && plan ? (
    <ProcedureDrawer island={selectedIsland} vm={vm} plan={plan} rules={rules} benefits={benefitsFor} estimate={estimate} stitches={stitches} selectedCheckpoint={islandSel.checkpointKey}
                     onSelectStitch={(s) => onSelectStitch?.(s)} onOpenDocuments={onOpenDocuments} onClose={() => { selection.clear(); }} mobile={mobile} returnFocus={selection.returnFocusRef.current} onRecordsChanged={onRecordsChanged} castLine={pointer} />
  ) : null;
  const stagePanel = stage ? <DetailPanel view={view} selection={stage} onSelect={(s) => selection.selectStage(s)} onOpenLandmark={onOpenLandmark} onOpenDocuments={onOpenDocuments} onPatch={patch} onInstructions={instructions} busy={busy} mobile={mobile} onClose={() => selection.clear()} returnFocus={selection.returnFocusRef.current} /> : null;
  const dense = denseFrom(vm.islands.length);

  return (
    <div ref={rootRef} className={`passage-layout ${hasDetail && !mobile ? "has-detail" : ""} ${mobile ? "is-mobile" : ""}`} onKeyDown={onKeyDown}>
      <motion.div layout={!reduce} transition={transitions.drawerRise} className="passage-main">
        <div className="journey-head">
          <h2>{headingLabel(view.journey.label)}</h2>
          <div className="progress-line">
            <strong className="num">{view.progress.label}</strong>
            {view.progress.note && <details className="progress-note"><summary>{PASSAGE.whatCompletionMeans}</summary><p>{view.progress.note}</p></details>}
          </div>
        </div>
        <AnswersLog vm={vm} view={view} plan={plan} estimate={estimate} recalculating={recalculating} onFocus={onAnswer} />
        <p className="sr-only" aria-live="polite" role="status">{announce}</p>
        <div className="journey-controls">
          {/* one segmented control: the parchment thumb glides to the pressed segment on pointer (200 ms), snaps for keyboard and reduced motion */}
          <div className="segment-row segmented" role="group" aria-label="Journey views">
            {([["map", UI.mapView], ["care", PASSAGE.careTimeline], ["overview", UI.overview]] as const).map(([k, label]) => (
              <button key={k} type="button" className="unstyled seg-btn" aria-pressed={segment === k} onClick={(e) => { segPointer.current = e.detail > 0; setSegment(k); }}>
                {segment === k && <motion.span layoutId="segment-thumb" className="seg-thumb" aria-hidden="true" transition={reduce || !segPointer.current ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }} />}
                {label}
              </button>
            ))}
          </div>
          <div className="journey-pickers">
            {journeys && journeys.length > 0 && samples.length > 0 && <select aria-label="Journey" title={headingLabel(view.journey.label)} value={view.id} onChange={(e) => { const v = journeys.find((j) => j.id === e.target.value); if (v) setView(v); }}>
              {journeys.map((j) => <option key={j.id} value={j.id}>{headingLabel(j.journey.label)}</option>)}</select>}
            <select className="add-journey" aria-label="Add a journey" value="" onChange={(e) => e.target.value && startJourney(e.target.value)}><option value="">Add another journey…</option><option value="empty">Empty (no documents yet)</option>{labeledSamples(samples).map((s) => <option key={s.id} value={s.id}>{headingLabel(s.label)}</option>)}</select>
          </div>
        </div>
        {!plan && <p className="hint">{PASSAGE.noPlanSelected}</p>}
        {segment === "overview" && <OverviewList journey={view.journey} vm={vm} planTitle={plan?.title} onSelect={(s) => { selection.selectStage(s); setSegment("map"); }} onSelectIsland={(id, cp) => { selectIsland(id, cp, null, true); }} onSelectStitch={onSelectStitch} />}
        {segment === "care" && <CareTimeline journey={view.journey} progress={view.progress} selected={stage} onSelect={(s, el) => selection.selectStage(s, el)} currentStageId={currentStageId(view.journey)} mobile linkedIsland={linkedIsland} onShowOnChart={(id) => { setSegment("map"); selectIsland(id, undefined, null, true); }} />}
        {segment === "map" && (
          <>
            {dense && <IslandStrip vm={vm} selected={islandSel} onSelect={(id, el) => selectIsland(id, undefined, el, false)} mobile={mobile} />}
            {mobile
              ? <PassageVertical vm={vm} selected={islandSel} onSelect={selectIsland} planCode={planCode} onSelectStitch={onSelectStitch} />
              : <PassageMap vm={vm} selected={islandSel} onSelect={selectIsland} planCode={planCode} drawKey={drawKey} recalculating={recalculating} pointer={pointer} desktop />}
            {!mobile && <CareTimeline journey={view.journey} progress={view.progress} selected={stage} onSelect={(s, el) => selection.selectStage(s, el)} currentStageId={currentStageId(view.journey)} mobile={false} linkedIsland={linkedIsland} onShowOnChart={(id) => selectIsland(id, undefined, null, true)} />}
          </>
        )}
      </motion.div>

      {mobile ? (
        <>{drawer}{stagePanel}</>
      ) : (
        <AnimatePresence initial={false}>
          {hasDetail && (
            <motion.div key="detail-col" className="passage-detail" initial={reduce ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: 24, transition: transitions.drawerExit }} transition={transitions.drawerRise}>
              {drawer ?? stagePanel}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

export default JourneyView;
