/**
 * From Uiverse.io by Nawsome — MIT (https://uiverse.io/Nawsome/ancient-yak-42). Compass-rose loader, rewritten as React with the
 * OralCompass tokens (component plan §2 N7), 2026-10-03. Internal `grad`/`mask` ids are prefixed with `useId()` so two instances never
 * collide. Determinate mode: `progress` (0–1) turns the needle once around the dial (0 → 360°) with a Motion spring, so the compass
 * turns once per stage instead of spinning; indeterminate mode keeps the Uiverse 2 s ring sweep for the brief "uploading…" phase.
 * Never render this without a real stage label (StageLoader.tsx owns the label); `role="img"` + `aria-label` here is the fallback name.
 * Reduced motion: compass-loader.css stops every loop (ring fully drawn, needle static), and the needle jumps (`mv.jump`).
 */
import { useEffect, useId } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { cn } from "@/lib/utils";
import "./compass-loader.css";

export interface CompassLoaderProps {
  /** 0–1 for a determinate stage; omit for indeterminate (ring sweep). */
  progress?: number;
  label: string;
  size?: string;
  className?: string;
}

export function CompassLoader({ progress, label, size = "3.5em", className }: CompassLoaderProps) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const target = useMotionValue(0);
  const rotate = useSpring(target, { stiffness: 170, damping: 26, mass: 0.6 });
  useEffect(() => {
    const deg = determinate ? Math.max(0, Math.min(1, progress as number)) * 360 : 0;
    if (reduce) { target.jump(deg); rotate.jump(deg); } else target.set(deg);
  }, [determinate, progress, reduce, target, rotate]);

  return (
    <span className={cn("oc-compass", className)} style={{ "--oc-size": size } as React.CSSProperties} data-indeterminate={determinate ? undefined : ""} role="img" aria-label={label}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--water-light)" />
            <stop offset="1" stopColor="var(--water-ink)" />
          </linearGradient>
          <mask id={`${id}-mask`}>
            <rect width="128" height="128" fill="var(--paper)" />
            <circle cx="64" cy="64" r="44" fill="black" />
          </mask>
        </defs>
        <circle className="pl__track" cx="64" cy="64" r="56" fill="none" strokeWidth="6" />
        <g className="pl__ring-rotate">
          <circle className="pl__ring-stroke" cx="64" cy="64" r="56" fill="none" strokeWidth="6" strokeLinecap="round" stroke={`url(#${id}-grad)`} />
        </g>
        <g className="pl__ticks" fill="none" strokeWidth="2" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4, major = i % 2 === 0, r1 = major ? 38 : 42, r2 = 46;
            return <line key={i} className="pl__tick" x1={64 + Math.sin(a) * r1} y1={64 - Math.cos(a) * r1} x2={64 + Math.sin(a) * r2} y2={64 - Math.cos(a) * r2} />;
          })}
        </g>
        <circle cx="64" cy="64" r="34" fill="var(--paper)" stroke="var(--rule)" strokeWidth="1" />
        <motion.g className="pl__needle" style={{ rotate, transformOrigin: "64px 64px" }}>
          <g className="pl__arrows">
            <path className="pl__north" d="M64 30 L70 64 L58 64 Z" />
            <path className="pl__south" d="M64 98 L70 64 L58 64 Z" />
          </g>
        </motion.g>
        <circle cx="64" cy="64" r="4" fill="var(--ink)" />
        <text x="64" y="22" textAnchor="middle" fontSize="9" fontFamily="var(--serif)" fill="var(--ink)">N</text>
      </svg>
    </span>
  );
}

export default CompassLoader;
