import { useReducedMotion } from "@/lib/motion";
import "@/components/vendor/uiverse/seigaiha.css";

/**
 * OceanLayers (component plan N13): the painted-water movement over the backdrop, CSS/SVG only, at most three composited layers.
 *  1. Uiverse seigaiha wave pattern as a full-bleed layer at opacity .07, multiply, drifting 40 s (class `motion-drift`).
 *  2. One still fog plate (desktop only), opacity ≤ .3. Spec §5.5 forbids parallax on scroll, so it no longer rides the page scroll.
 *  3. A static paper tint across the top of the horizon (no blur: GradualBlur put a glass band over the painting; delight pass mo-07b).
 * Reduced motion: no drift. On phones only layer 1 renders.
 */
export function OceanLayers({ desktop }: { desktop: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="ocean-layers" aria-hidden="true">
      <div className={`oc-seigaiha oc-seigaiha-layer ocean-seigaiha ${reduce ? "" : "motion-drift"}`} />
      {desktop && (
        <>
          <img src="/art/fog-layer-2.webp" alt="" loading="lazy" decoding="async" className="ocean-fog ocean-fog-far" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <div className="ocean-horizon-tint" />
        </>
      )}
    </div>
  );
}

export default OceanLayers;
