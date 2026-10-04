import { useCallback, useEffect, useRef, useState } from "react";
import type { JourneySelection, JourneyView, MapSelection, StageSelection } from "@/lib/types";

/**
 * Journey selection (spec §6): `{ stage?: StageSelection; island?: MapSelection }`, one open at a time, plus the element focus returns
 * to when the drawer/sheet closes. Nothing opens by itself: a journey loads (or changes) with an empty selection on every screen size,
 * so the map keeps its full width on desktop and no sheet covers the phone header. The current care stage stays a visual pin on the
 * care rail / timeline; its detail opens only when the person selects it.
 */
export function useJourneySelection(view: JourneyView | null) {
  const [selection, setSelection] = useState<JourneySelection>({});
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // a different journey (or none) never keeps the previous journey's open stage or island
  useEffect(() => { setSelection({}); returnFocusRef.current = null; }, [view?.id]);

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
    // after the commit: a modal sheet that is still mounted would trap the focus call (and Radix focuses nothing on its own unmount)
    if (el) setTimeout(() => { if (document.contains(el)) el.focus(); }, 0);
  }, []);

  return { selection, selectStage, selectIsland, clear, returnFocusRef };
}
export type JourneySelectionApi = ReturnType<typeof useJourneySelection>;
