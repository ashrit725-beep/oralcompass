import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion";
import type { IslandLayout } from "@/lib/passage";
import type { IslandVM } from "@/lib/types";
import { ArtPlate } from "./ArtPlate";
import { Island } from "./Paper";

/**
 * A procedure island in the aria-hidden scene (spec §3.2, §10, addendum §C): the painted plate (`island-major` at ≈ 3.4r with its own
 * surf for major categories, `island-generic` at 3r otherwise; SVG `Island` fallback), the state ring (`pending` = outline only,
 * selected = terracotta ring), pennants for `notices` (gold flags, count = notices.length) and the compound badge in dense layouts.
 * `focus-island` (pointer only): the selected plate eases to scale 1.04 (transform only, 600 ms `--ease-land`); keyboard selection and
 * reduced motion apply the end state instantly. Other islands dim to .72 while one is focused.
 * Delight pass (mo-02): the entrance delay (the island appears when the pen reaches it) lives on the outer group only, so dimming after a
 * click answers within 240 ms instead of waiting up to 1.3 s; the terracotta ring is drawn (pathLength 0 → 1, 240 ms) with the scale
 * rather than popping in. `instant` (chart already drawn this session, or reduced motion) renders every end state on the first frame.
 */
export interface ProcedureIslandProps { island: IslandVM; layout: IslandLayout; selected: boolean; dim: boolean; pointer: boolean; drawDelay: number; instant?: boolean }

export function ProcedureIsland({ island, layout, selected, dim, pointer, drawDelay, instant = false }: ProcedureIslandProps) {
  const reduce = useReducedMotion() || instant;
  const animateSelect = !reduce && pointer;
  const { cx, cy, r, plate } = layout;
  const pending = island.state === "pending";
  const n = island.notices.length;
  return (
    <motion.g
      className={`island island-${island.state}`}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? { duration: 0 } : { opacity: { duration: 0.24, delay: Math.max(0, drawDelay - 0.12), ease: [0.2, 0.7, 0.2, 1] } }}
    >
    <motion.g
      initial={false}
      animate={{ opacity: dim ? 0.72 : 1 }}
      transition={reduce ? { duration: 0 } : dim ? { duration: 0.24, ease: [0.2, 0.7, 0.2, 1] } : { duration: 0.17, ease: [0.4, 0, 1, 1] }}
    >
      <motion.g
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" } as React.CSSProperties}
        animate={{ scale: selected ? 1.04 : 1 }}
        transition={animateSelect ? { duration: 0.6, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
      >
        <ellipse cx={cx + 4} cy={cy + plate.h * 0.36} rx={plate.w * 0.42} ry={plate.h * 0.16} fill="var(--water-ink)" opacity={0.22} />
        <g opacity={pending ? 0.55 : 1}>
          <ArtPlate slot={plate.slot} x={plate.x} y={plate.y} w={plate.w} h={plate.h} preserveAspectRatio="xMidYMid meet" fallback={<Island cx={cx} cy={cy} r={r} muted={pending} />} />
        </g>
        {pending && <ellipse cx={cx} cy={cy} rx={r * 1.15} ry={r * 0.82} fill="none" stroke="var(--paper)" strokeWidth={2} strokeDasharray="4 6" />}
        <AnimatePresence initial={false}>
          {selected && (
            <motion.ellipse key="ring" cx={cx} cy={cy + r * 0.1} rx={r * 1.35} ry={r * 0.95} fill="none" stroke="var(--select)" strokeWidth={2.2} strokeLinecap="round"
                            initial={animateSelect ? { pathLength: 0, opacity: 0.9 } : false} animate={{ pathLength: 1, opacity: 0.9 }}
                            exit={animateSelect ? { opacity: 0, transition: { duration: 0.17, ease: [0.4, 0, 1, 1] } } : { opacity: 0, transition: { duration: 0 } }}
                            transition={{ pathLength: { duration: 0.24, ease: [0.2, 0.7, 0.2, 1] } }} />
          )}
        </AnimatePresence>
      </motion.g>
      {/* pennants: one small flag per notice, raised after the markers (pennant-raise, 120 ms) */}
      {n > 0 && (
        <motion.g initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.12, delay: drawDelay + 0.5 }}>
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <g key={i} transform={`translate(${cx + r * 0.95 + i * 9} ${cy - r * 0.55})`}>
              <path d="M0 0 v -22" stroke="var(--ink)" strokeWidth={1.2} />
              <path d="M0 -22 l 10 4 l -10 4 Z" fill="var(--gold)" stroke="var(--ink)" strokeWidth={0.8} />
            </g>
          ))}
        </motion.g>
      )}
    </motion.g>
      {/* dense routes: a single count badge until the island is selected (not a control; the island button carries the count) */}
      {layout.compound && island.checkpoints.length > 0 && (
        <g transform={`translate(${layout.badge.x} ${layout.badge.y})`}>
          <rect x={-20} y={-12} width={40} height={24} rx={6} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.4} />
          <text textAnchor="middle" y={5} fontSize={13} fontFamily="var(--sans)" fontWeight={600} fill="var(--ink)">{island.checkpoints.length}</text>
        </g>
      )}
    </motion.g>
  );
}

export default ProcedureIsland;
