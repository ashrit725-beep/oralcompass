/**
 * Hover.dev "Draw Circle Text" — technique re-implemented by hand from the description at https://www.hover.dev/components/text
 * (Draw Circle Text): one `motion.path` whose `pathLength` animates 0 → 1 once the label scrolls into view. Licence: Hover.dev
 * free-component licence (use in unlimited end products; not redistributable as a component library). No Hover.dev asset is copied;
 * written from the component plan's description (§2 N9), 2026-10-03.
 *
 * OralCompass use: the selected-island accent — a hand-drawn gold loop (2 px, round caps) around an island name, ≤ 0.45 s, `aria-hidden`,
 * `viewport={{ once: true }}`. The loop is authored per label through the `d` prop (a wobble baked into the path, never animated).
 * Reduced motion: `initial={false}` → the loop renders fully drawn.
 */
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface InkLoopProps {
  children: React.ReactNode;
  /** Whether the loop is drawn (e.g. the island is selected). */
  active?: boolean;
  /** Path in a 0–100 × 0–40 viewBox. Default: a slightly wobbly ellipse around the text. */
  d?: string;
  stroke?: string;
  strokeWidth?: number;
  duration?: number;
  className?: string;
}

const DEFAULT_D = "M 8 21 C 6 9, 32 4, 54 5 C 80 6, 97 11, 95 21 C 93 32, 70 37, 48 36 C 24 35, 4 31, 8 21 Z";

export function InkLoop({ children, active = true, d = DEFAULT_D, stroke = "var(--gold)", strokeWidth = 2, duration = 0.45, className }: InkLoopProps) {
  const reduce = useReducedMotion();
  return (
    <span className={cn("relative inline-block", className)}>
      {children}
      {active && (
        <svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-2 -inset-y-1 h-[calc(100%+0.5rem)] w-[calc(100%+1rem)] overflow-visible">
          <motion.path
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: reduce ? 0 : duration, ease: "easeOut" }}
          />
        </svg>
      )}
    </span>
  );
}

export default InkLoop;
