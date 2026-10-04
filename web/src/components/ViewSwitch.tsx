import type { ReactNode } from "react";
import { TransitionPanel } from "@/components/ui/transition-panel";
import { viewTransition, viewVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * ViewSwitch (component plan N3-B): ONE Motion Primitives TransitionPanel per view (My journey / My plan / Documents) and for
 * wizard panes — never per heading or card. `wash-in`: enter y 8 → 0 + fade over 420 ms; exit is a 120 ms fade only. The container has a `min-h`
 * so the map does not collapse mid-transition (popLayout). Reduced motion: MotionConfig drops the transforms; the opacity crossfade
 * remains and the active panel renders in full.
 */
export interface ViewSwitchProps {
  /** Index of the active child. */
  index: number;
  children: ReactNode[];
  /** Wizard panes pass ±1 to slide ±12 px horizontally instead of vertically. */
  direction?: number;
  className?: string;
}

const paneVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 12 : -12 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -12 : 12 }),
};

export function ViewSwitch({ index, children, direction, className }: ViewSwitchProps) {
  const horizontal = typeof direction === "number";
  return (
    <TransitionPanel
      activeIndex={index}
      className={cn("min-h-[40vh]", className)}
      transition={viewTransition}
      variants={horizontal ? paneVariants : viewVariants}
      custom={direction}
    >
      {children}
    </TransitionPanel>
  );
}

export default ViewSwitch;
