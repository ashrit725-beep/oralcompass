import { motion } from "motion/react";
import { DUR, EASE, useReducedMotion } from "@/lib/motion";
import type { RouteSegment } from "@/lib/passage";

/**
 * The route (spec §5.5 `chart-draw`): START → each island's checkpoint arc → the Harbor Light, drawn segment by segment with Motion
 * `pathLength` (700 ms per segment, `--ease-in-out`) on first load and plan switch only (`drawKey`); an estimate recomputation keeps
 * the drawn route and only the numbers re-measure. A segment leaving a not-covered island is the closed channel: ink-soft, dotted
 * `2 6` (`channel-close`). The slow "march" of the dashes is a scenery drift (18 s, class `motion-drift`, off under reduced motion).
 * Reduced motion: `initial={false}` so the full route is present at once.
 */
export interface RouteLineProps { segments: RouteSegment[]; drawKey: string; pending?: boolean; segmentDelay?: (index: number) => number }

export function RouteLine({ segments, drawKey, pending = false, segmentDelay }: RouteLineProps) {
  const reduce = useReducedMotion();
  return (
    <g className="route-group" key={drawKey}>
      {segments.map((s, i) => {
        const closed = s.closed;
        const delay = segmentDelay ? segmentDelay(i) : i * DUR.journey;
        return (
          <g key={`${s.from}->${s.to}:${i}`}>
            {/* soft paper halo so the ink reads on the darker painted water */}
            <path d={s.d} fill="none" stroke="var(--paper)" strokeOpacity={0.55} strokeWidth={closed ? 5 : 6} strokeLinecap="round" />
            <motion.path
              d={s.d} fill="none" className={`route ${pending ? "route-pending" : ""} ${closed ? "route-closed" : reduce ? "" : "motion-drift"}`}
              stroke={closed ? "var(--ink-soft)" : pending ? "var(--ink-soft)" : "var(--ink)"} strokeWidth={closed ? 2.2 : 2.6} strokeLinecap="round"
              strokeDasharray={closed ? "2 6" : pending ? "3 7" : "7 9"}
              initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : { pathLength: { duration: DUR.journey, ease: EASE.inOut, delay }, opacity: { duration: 0.2, delay } }}
            />
          </g>
        );
      })}
    </g>
  );
}

export default RouteLine;
