import { useEffect, useRef, useState, type ReactNode } from "react";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import { useReducedMotion } from "@/lib/motion";

/**
 * CinematicStage — STUB written by the My plan builder (mob/plan) with exactly the shared contract props; the journey builder's
 * implementation replaces it at integration. It renders, edge to edge across the app column and with no box, border or radius:
 * the painted plate (`art`), a title card over the top of the painting (serif title + the strongest facts on a parchment-to-transparent
 * scrim), the map layer (`children`), a tall bottom fade into the parchment and the vignette.
 * Camera (transform/opacity only): the establishing shot runs once per session per art (plate scale 1.06 → 1 over 1.6 s,
 * cubic-bezier(.16,1,.3,1); lib/drawRegistry), then an idle Ken Burns drift on the plate only (1 → 1.02 over 40 s, alternate), paused
 * while the document is hidden and off under reduced motion. A map layer may move the camera: it sets `--camera-y` (px) and
 * `data-camera="focus"` on the element carrying `data-cinematic-stage`; the plate follows at 0.85× (depth) and the title card steps
 * aside while the camera is in focus. Reduced motion: every end state, no drift.
 */
export interface CinematicStageProps {
  art: "journey" | "plan";
  title: ReactNode;
  facts: ReactNode;
  /** The map layer. */
  children: ReactNode;
  /** Minimum height of the stage (CSS length); the map layer sets the real height. */
  height?: string;
}

const PLATE: Record<CinematicStageProps["art"], { src: string; position: string }> = {
  journey: { src: "/art/journey-backdrop-phone.webp", position: "50% 50%" },
  // the coast of the wide plate: the shore and its cove run down the left edge of the column
  plan: { src: "/art/journey-backdrop.webp", position: "14% 50%" },
};

export function CinematicStage({ art, title, facts, children, height }: CinematicStageProps) {
  const reduce = useReducedMotion();
  const key = `stage:${art}`;
  const [establish] = useState(() => !hasDrawn(key));
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { markDrawn(key); }, [key]);
  useEffect(() => {
    const f = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  const plate = PLATE[art];
  return (
    <div ref={ref} className={`cstage cstage-${art}`} data-cinematic-stage="" data-art={art} data-paused={hidden ? "" : undefined}
         style={height ? ({ minHeight: height } as React.CSSProperties) : undefined}>
      <div className="cstage-plate" aria-hidden="true">
        <div className={`cstage-settle ${establish && !reduce ? "is-establishing" : ""}`}>
          <img src={plate.src} alt="" decoding="async" style={{ objectPosition: plate.position }} />
        </div>
      </div>
      <div className="cstage-vignette" aria-hidden="true" />
      <div className="cstage-title">
        <div className="cstage-title-h">{title}</div>
        <div className="cstage-facts">{facts}</div>
      </div>
      <div className="cstage-map">{children}</div>
      <div className="cstage-fade" aria-hidden="true" />
    </div>
  );
}

export default CinematicStage;
