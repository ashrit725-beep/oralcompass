/**
 * Motion tokens for JS (design spec §5.4), mirroring the `--dur-*` / `--ease-*` custom properties in styles.css.
 * Only transform, opacity, clip-path, stroke-dashoffset and filter are animated. `exit = enter × 0.7` everywhere.
 * Reduced motion: the app root wraps <MotionConfig reducedMotion="user">; components additionally guard motion values, SVG attributes and
 * CSS loops with `useReducedMotion()` (re-exported here so product code imports one module).
 */
import type { Transition } from "motion/react";
export { useReducedMotion } from "motion/react";

export const DUR = {
  micro: 0.12,     // press, chip, pennant, nav indicator
  standard: 0.24,  // drawer slide, number roll, crossfade
  journey: 0.7,    // route draw, focus-island; fog-lift is 0.9
  fogLift: 0.9,
  page: 0.42,      // view wash-in
} as const;

/** Milliseconds, for CSS-in-JS and timeouts. */
export const DUR_MS = { micro: 120, standard: 240, journey: 700, fogLift: 900, page: 420 } as const;

export const EASE = {
  standard: [0.2, 0.7, 0.2, 1] as [number, number, number, number],   // ease-out: things arriving
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],      // route drawing
  land: [0.16, 1, 0.3, 1] as [number, number, number, number],        // soft landing for focus and the sheet
  exit: [0.4, 0, 1, 1] as [number, number, number, number],           // leaving: accelerate
} as const;

/** Exit duration rule: 0.7 × the entering duration. */
export const exitOf = (enter: number) => enter * 0.7;

/** The bottom sheet spring: no overshoot, settles ≈ 350 ms. */
export const SHEET_SPRING: Transition = { type: "spring", stiffness: 320, damping: 36, mass: 1 };

/** The app-wide default transition (also set on MotionConfig in main.tsx). */
export const UI_SPRING: Transition = { type: "spring", visualDuration: 0.35, bounce: 0 };

/** Money spring for motion-value number rolls (used when NumberFlow is not the renderer). */
export const MONEY_SPRING = { stiffness: 170, damping: 26, mass: 0.6 } as const;

export const transitions = {
  washIn: { duration: DUR.page, ease: EASE.standard } as Transition,
  tabGlide: { duration: 0.2, ease: EASE.standard } as Transition,
  drawerRise: { duration: DUR.standard, ease: EASE.standard } as Transition,
  drawerExit: { duration: exitOf(DUR.standard), ease: EASE.exit } as Transition,
  chartDraw: { duration: DUR.journey, ease: EASE.inOut } as Transition,
  focusIsland: { duration: 0.6, ease: EASE.land } as Transition,
  soundingRoll: { duration: 0.4, ease: EASE.standard } as Transition,
  fogLift: { duration: DUR.fogLift, ease: EASE.standard } as Transition,
  threadPull: { duration: 0.3, ease: EASE.standard } as Transition,
} as const;

/** TransitionPanel variants for the view switch (component plan §2 N3-B). */
export const viewVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};
export const viewTransition: Transition = { duration: 0.2, ease: "easeOut" };
