import { useCallback, useEffect, useRef, useState } from "react";
import { currentStageId } from "@/lib/journey";
import type { JourneySelection, JourneyView, MapSelection, StageSelection } from "@/lib/types";

/**
 * Journey selection (spec §6): `{ stage?: StageSelection; island?: MapSelection }`, one open at a time, plus the element focus returns
 * to when the drawer/sheet closes. When a journey loads or changes on desktop, the current care stage is selected (the pre-existing
 * behaviour: it fills the right column). On phones nothing opens by itself: a sheet that covers the header at load hides the page.
 */
export function useJourneySelection(view: JourneyView | null, autoSelectStage = true) {
  const [selection, setSelection] = useState<JourneySelection>({});
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!view || !autoSelectStage) { setSelection({}); return; }
    const j = view.journey;
    setSelection({ stage: { stageId: currentStageId(j) ?? j.stages[0]?.id } });
  }, [view?.id]);

  const selectStage = useCallback((stage: StageSelection | null, from?: HTMLElement | null) => {
    if (from) returnFocusRef.current = from;
    setSelection(stage ? { stage } : {});
  }, []);
  const selectIsland = useCallback((island: MapSelection | null, from?: HTMLElement | null) => {
    if (from) returnFocusRef.current = from;
    setSelection(island ? { island } : {});
  }, []);
  const clear = useCallback(() => {
    setSelection({});
    const el = returnFocusRef.current; returnFocusRef.current = null;
    if (el && document.contains(el)) el.focus();
  }, []);

  return { selection, selectStage, selectIsland, clear, returnFocusRef };
}
export type JourneySelectionApi = ReturnType<typeof useJourneySelection>;
