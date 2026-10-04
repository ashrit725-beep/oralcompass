/**
 * Dock — adapted from Eldora UI's portfolio website: https://github.com/eldorauiofficial/portfolio-website (src/components/ui/dock.tsx).
 * © 2024 Mudunuri bhaskara karthikeya varma, MIT licence. Copied 2026-10-04 for the PHONE bottom tab bar (orchestrator note 7, master
 * prompt §22 thumb reach); the four items are the existing Radix tab triggers (not duplicates), so keyboard, roving focus and the
 * screenshot walk's role=tab names are unchanged.
 *
 * Patches: `framer-motion` → `motion/react`; "use client" stripped; the pointer position is shared through context instead of
 * `cloneElement` (the dock's child is the Radix TabsList, the items are nested inside it); magnification is a transform scale capped at
 * 1.15× on the UI spring (no overshoot) instead of a width spring, and it runs ONLY on `(hover: hover) and (pointer: fine)` — never on
 * touch — and never under reduced motion; the bar is solid `--paper-deep` with a hairline `--rule` top border and `--shadow-1` (no
 * backdrop blur, no glass); palette tokens only; the rounded floating pill became a full-width bar with safe-area padding (styles.css `.dock`).
 */
import { createContext, forwardRef, useContext, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";

const MAX_MAGNIFICATION = 1.15;
const DEFAULT_DISTANCE = 140;
const UI_SPRING = { stiffness: 320, damping: 40, mass: 0.6 } as const;   // critically damped: no overshoot

interface DockCtx { pointerX: MotionValue<number>; magnification: number; distance: number; enabled: boolean }
const Ctx = createContext<DockCtx | null>(null);

function useFinePointer() {
  const q = "(hover: hover) and (pointer: fine)";
  const [fine, setFine] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q); if (!m) return;
    const f = () => setFine(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f);
  }, []);
  return fine;
}

export interface DockProps extends HTMLAttributes<HTMLDivElement> {
  /** Peak scale of the item under the pointer (capped at 1.15). */
  magnification?: number;
  distance?: number;
  children: ReactNode;
}

export const Dock = forwardRef<HTMLDivElement, DockProps>(({ className, children, magnification = MAX_MAGNIFICATION, distance = DEFAULT_DISTANCE, ...props }, ref) => {
  const pointerX = useMotionValue(Infinity);
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const enabled = fine && !reduce;
  return (
    <Ctx.Provider value={{ pointerX, magnification: Math.min(magnification, MAX_MAGNIFICATION), distance, enabled }}>
      <div ref={ref} className={cn("dock", className)} {...props}
           onMouseMove={enabled ? (e) => pointerX.set(e.clientX) : undefined} onMouseLeave={enabled ? () => pointerX.set(Infinity) : undefined}>
        {children}
      </div>
    </Ctx.Provider>
  );
});
Dock.displayName = "Dock";

export interface DockIconProps { className?: string; children?: ReactNode }

/** One dock item: magnifies (transform only) toward the pointer on fine-pointer devices; a plain wrapper everywhere else. */
export function DockIcon({ className, children }: DockIconProps) {
  const ctx = useContext(Ctx);
  if (!ctx?.enabled) return <div className={cn("dock-item", className)}>{children}</div>;
  return <MagnifiedIcon ctx={ctx} className={className}>{children}</MagnifiedIcon>;
}

function MagnifiedIcon({ ctx, className, children }: DockIconProps & { ctx: DockCtx }) {
  const ref = useRef<HTMLDivElement>(null);
  const offset = useTransform(ctx.pointerX, (x: number) => {
    const b = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return x - b.x - b.width / 2;
  });
  const target = useTransform(offset, [-ctx.distance, 0, ctx.distance], [1, ctx.magnification, 1], { clamp: true });
  const scale = useSpring(target, UI_SPRING);
  return <motion.div ref={ref} style={{ scale }} className={cn("dock-item", className)}>{children}</motion.div>;
}

export default Dock;
