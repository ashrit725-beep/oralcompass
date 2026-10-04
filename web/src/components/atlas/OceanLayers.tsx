import { lazy, Suspense, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReducedMotion } from "@/lib/motion";
import "@/components/vendor/uiverse/seigaiha.css";

const GradualBlur = lazy(() => import("@/components/ui/GradualBlur"));

/**
 * OceanLayers (component plan N13): the painted-water movement over the backdrop, CSS/SVG only, at most three composited layers.
 *  1. Uiverse seigaiha wave pattern as a full-bleed layer at opacity .07, multiply, drifting 40 s (class `motion-drift`).
 *  2. Fog parallax: the two fog plates ride the page scroll at ≤ 0.15 ratio (desktop + fine pointer only; no pointer-driven parallax,
 *     addendum B1/B2), opacity ≤ .3, `will-change: transform`.
 *  3. React Bits GradualBlur as the horizon band (3 layers, desktop only, never over text) with a paper tint so it reads as warm fog.
 * Reduced motion: no drift, fog at rest (y 0), the blur band still renders static. On phones only layer 1 renders.
 */
export function OceanLayers({ desktop }: { desktop: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const fogY = useTransform(scrollY, [0, 600], [0, -90]);
  const finePointer = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const parallax = desktop && finePointer && !reduce;
  return (
    <div ref={ref} className="ocean-layers" aria-hidden="true">
      <div className={`oc-seigaiha oc-seigaiha-layer ocean-seigaiha ${reduce ? "" : "motion-drift"}`} />
      {desktop && (
        <>
          <motion.img src="/art/fog-layer-2.webp" alt="" loading="lazy" decoding="async" className="ocean-fog ocean-fog-far" style={{ y: parallax ? fogY : 0 }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <Suspense fallback={null}>
            <GradualBlur position="top" height="22%" strength={1.2} divCount={3} curve="ease-out" target="parent" zIndex={2} className="ocean-horizon-blur" />
          </Suspense>
          <div className="ocean-horizon-tint" />
        </>
      )}
    </div>
  );
}

export default OceanLayers;
