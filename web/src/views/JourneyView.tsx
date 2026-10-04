import { useState } from "react";
import { UI, type LandmarkId } from "@/lib/copy";
import { currentStageId } from "@/lib/journey";
import type { AppData } from "@/hooks/useAppData";
import type { JourneySelectionApi } from "@/hooks/useJourneySelection";
import { JourneyMap, JourneyVertical } from "@/components/atlas/JourneyMap";
import { DetailPanel } from "@/components/DetailPanel";
import { OverviewList } from "@/components/OverviewList";

export interface JourneyViewProps {
  data: AppData;
  selection: JourneySelectionApi;
  mobile: boolean;
  onOpenLandmark: (id: LandmarkId) => void;
  onOpenDocuments: () => void;
}

/**
 * My journey (spec §6 `JourneyView`): the start screen for a new user, or the journey head (label, progress line, Map view / Overview
 * list toggles, journey selects), the painted map (desktop) / vertical journey (phone) / overview list, and the DetailPanel for the
 * selected stage or checkpoint. Moved out of App.tsx unchanged in behaviour; the passage map (islands, checkpoints, ProcedureDrawer)
 * composes in here next.
 */
export function JourneyView({ data, selection, mobile, onOpenLandmark, onOpenDocuments }: JourneyViewProps) {
  const { view, journeys, samples, plans, busy, startJourney, setView, patch, instructions } = data;
  const [overview, setOverview] = useState(false);
  const realCount = plans.filter((p) => !p.is_fictional).length;
  const newUser = journeys !== null && journeys.length === 0 && !view;
  const stage = selection.selection.stage ?? null;

  if (newUser || !view) {
    return (
      <section className="start" aria-labelledby="start-h">
        <h2 id="start-h">{UI.newUserTitle}</h2>
        <p>{UI.newUserBody}</p>
        <div className="start-actions">
          <button type="button" disabled={busy} onClick={() => startJourney("empty")}>Start my journey (no documents yet)</button>
          {samples.map((s) => <button key={s.id} type="button" className="secondary" disabled={busy} onClick={() => startJourney(s.id)}>{UI.loadSample}: {s.label.replace("Sample journey — ", "")}</button>)}
        </div>
        <p className="muted small">Plan presets: {plans.length} ({realCount} from public plan documents, {plans.length - realCount} fictional demonstration plans). {UI.availabilityBanner}</p>
      </section>
    );
  }

  return (
    <div className="journey-layout">
      <div className="journey-main">
        <div className="journey-head">
          <h2>{view.journey.label}</h2>
          <p className="progress-line"><strong className="num">{view.progress.label}</strong> <span className="muted">· {view.progress.note}</span></p>
          <div className="toggles">
            <button type="button" aria-pressed={!overview} onClick={() => setOverview(false)}>{UI.mapView}</button>
            <button type="button" aria-pressed={overview} onClick={() => setOverview(true)}>{UI.overview}</button>
            {journeys && journeys.length > 0 && samples.length > 0 && <select aria-label="Journey" value={view.id} onChange={(e) => { const v = journeys.find((j) => j.id === e.target.value); if (v) setView(v); }}>
              {journeys.map((j) => <option key={j.id} value={j.id}>{j.journey.label}</option>)}</select>}
            <select aria-label="Add a journey" value="" onChange={(e) => e.target.value && startJourney(e.target.value)}><option value="">Add another journey…</option><option value="empty">Empty (no documents yet)</option>{samples.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </div>
        </div>
        {overview ? <OverviewList journey={view.journey} onSelect={(s) => { selection.selectStage(s); setOverview(false); }} />
          : mobile ? <JourneyVertical journey={view.journey} selected={stage} onSelect={(s) => selection.selectStage(s)} currentStageId={currentStageId(view.journey)} />
          : <JourneyMap journey={view.journey} selected={stage} onSelect={(s) => selection.selectStage(s)} currentStageId={currentStageId(view.journey)} />}
      </div>
      {stage && <DetailPanel view={view} selection={stage} onSelect={(s) => selection.selectStage(s)} onOpenLandmark={onOpenLandmark} onOpenDocuments={onOpenDocuments} onPatch={patch} onInstructions={instructions} busy={busy} mobile={mobile} onClose={() => selection.clear()} />}
    </div>
  );
}

export default JourneyView;
