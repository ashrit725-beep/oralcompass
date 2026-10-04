import { useId } from "react";
import { motion } from "motion/react";
import { DUR, EASE, useReducedMotion } from "@/lib/motion";
import type { RouteSegment } from "@/lib/passage";

/**
 * The route (spec §5.5 `chart-draw`): START → each island's checkpoint arc → the Harbor Light, drawn segment by segment (700 ms per
 * segment, `--ease-in-out`) on first load and plan switch only (`drawKey`); an estimate recomputation keeps the drawn route and only the
 * numbers re-measure. A segment leaving a not-covered island is the closed channel: ink-soft, dotted `2 6` (`channel-close`). The slow
 * "march" of the dashes is a scenery drift (18 s, class `motion-drift`, off under reduced motion).
 * The pen is a mask (delight pass mo-01 B): a white stroke with Motion `pathLength` 0 → 1 reveals the real dashed route underneath, so the
 * dashes stay dashed while drawing (animating `pathLength` on the route itself overwrites its dasharray and paints it solid). Once drawn,
 * or under reduced motion, or when `instant`, no mask is mounted at all: the plain dashed route is the end state.
 */
export interface RouteLineProps { segments: RouteSegment[]; drawKey: string; pending?: boolean; segmentDelay?: (index: number) => number; instant?: boolean }

export function RouteLine({ segments, drawKey, pending = false, segmentDelay, instant = false }: RouteLineProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const draw = !reduce && !instant;
  return (
    <g className="route-group" key={drawKey}>
      {segments.map((s, i) => {
        const closed = s.closed;
        const delay = segmentDelay ? segmentDelay(i) : i * DUR.journey;
        const maskId = `route-pen-${uid}-${i}`;
        return (
          <g key={`${s.from}->${s.to}:${i}`}>
            {draw && (
              <mask id={maskId} maskUnits="userSpaceOnUse" x={-4000} y={-4000} width={12000} height={12000}>
                <motion.path d={s.d} fill="none" stroke="white" strokeWidth={14} strokeLinecap="round"
                             initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: DUR.journey, ease: EASE.inOut, delay }} />
              </mask>
            )}
            <g mask={draw ? `url(#${maskId})` : undefined}>
              {/* soft paper halo so the ink reads on the darker painted water */}
              <path d={s.d} fill="none" stroke="var(--paper)" strokeOpacity={0.55} strokeWidth={closed ? 5 : 6} strokeLinecap="round" />
              <path
                d={s.d} fill="none" className={`route ${pending ? "route-pending" : ""} ${closed ? "route-closed" : reduce ? "" : "motion-drift"}`}
                stroke={closed ? "var(--ink-soft)" : pending ? "var(--ink-soft)" : "var(--ink)"} strokeWidth={closed ? 2.2 : 2.6} strokeLinecap="round"
                strokeDasharray={closed ? "2 6" : pending ? "3 7" : "7 9"}
              />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default RouteLine;
