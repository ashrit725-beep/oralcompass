import { useId } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DUR, EASE, useReducedMotion } from "@/lib/motion";
import { ArtPlate } from "./ArtPlate";

/**
 * Fog over an unresolved island (spec §3.5): two fog plates (`fog-layer-1` / `fog-layer-2`, lazy; SVG mist fallback) clipped to a
 * 1.6r × 1.1r ellipse at opacity .85, drifting as scenery (120 s / 160 s, class `motion-drift`, CSS in journey.css; off under reduced
 * motion). `fog-lift`: when the line resolves the group fades and drifts 12 px upward over 900 ms, then unmounts (reduced motion:
 * removed at once). The island button stays readable above the fog in the HTML layer. No pointer parallax (addendum B1/B2).
 */
export function FogLayer({ cx, cy, r, show }: { cx: number; cy: number; r: number; show: boolean }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const rx = r * 1.6, ry = r * 1.1;
  const fallback = (k: number) => (
    <g filter="url(#oc-mist)" opacity={0.9}>
      <ellipse cx={cx - rx * 0.3} cy={cy - ry * 0.2 + k * 8} rx={rx * 0.7} ry={ry * 0.45} fill="var(--paper)" />
      <ellipse cx={cx + rx * 0.25} cy={cy + ry * 0.15 - k * 6} rx={rx * 0.75} ry={ry * 0.4} fill="var(--paper)" />
    </g>
  );
  return (
    <AnimatePresence>
      {show && (
        <motion.g
          className="fog" key="fog"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 0.85 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -12, transition: { duration: DUR.fogLift, ease: EASE.standard } }}
          transition={{ duration: 0.4 }}
        >
          <clipPath id={`fog-clip-${id}`}><ellipse cx={cx} cy={cy} rx={rx} ry={ry} /></clipPath>
          <g clipPath={`url(#fog-clip-${id})`}>
            <g className={reduce ? "" : "fog-drift fog-drift-1 motion-drift"}>
              <ArtPlate slot="fog-layer-1" x={cx - rx * 1.5} y={cy - ry * 1.2} w={rx * 3} h={ry * 2.4} preserveAspectRatio="xMidYMid slice" fallback={fallback(0)} />
            </g>
            <g className={reduce ? "" : "fog-drift fog-drift-2 motion-drift"} opacity={0.8}>
              <ArtPlate slot="fog-layer-2" x={cx - rx * 1.6} y={cy - ry * 1.1} w={rx * 3.2} h={ry * 2.2} preserveAspectRatio="xMidYMid slice" fallback={fallback(1)} />
            </g>
          </g>
        </motion.g>
      )}
    </AnimatePresence>
  );
}

export default FogLayer;
