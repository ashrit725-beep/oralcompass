import { useState, type ReactNode } from "react";

/**
 * ArtPlate (spec §6, addendum A1): an SVG <image> that requests `/art/<slot>.webp`, then `/art/<slot>.png`, then renders the SVG
 * `fallback` (the painted scenes in atlas/*). Load errors are swallowed (the scene never blocks on an asset). Fog and chest plates load
 * lazily; everything else eagerly (the backdrop is the LCP image and is preloaded from index.html).
 */
export type ArtSlot =
  | "journey-backdrop" | "island-generic" | "island-major" | "island-lighthouse" | "benefits-chest" | "fog-layer-1" | "fog-layer-2" | "paper-texture" | (string & {});

export interface ArtPlateProps {
  slot: ArtSlot;
  x: number; y: number; w: number; h: number;
  fallback: ReactNode;
  opacity?: number;
  preserveAspectRatio?: string;
  className?: string;
  /** Called once both formats failed (the fallback is shown). */
  onFallback?: () => void;
}

const LAZY: ReadonlySet<string> = new Set(["fog-layer-1", "fog-layer-2", "benefits-chest"]);

export function ArtPlate({ slot, x, y, w, h, fallback, opacity = 1, preserveAspectRatio = "xMidYMid slice", className, onFallback }: ArtPlateProps) {
  const [attempt, setAttempt] = useState<0 | 1 | 2>(0);   // 0 webp → 1 png → 2 fallback
  if (attempt === 2) return <>{fallback}</>;
  const href = `/art/${slot}.${attempt === 0 ? "webp" : "png"}`;
  const lazy = LAZY.has(slot) ? ({ loading: "lazy", decoding: "async" } as Record<string, string>) : ({ decoding: "async" } as Record<string, string>);
  return (
    <image
      href={href}
      x={x} y={y} width={w} height={h}
      opacity={opacity}
      preserveAspectRatio={preserveAspectRatio}
      className={className}
      aria-hidden="true"
      {...lazy}
      onError={() => { setAttempt((a) => { const next = (a + 1) as 0 | 1 | 2; if (next === 2) onFallback?.(); return next; }); }}
    />
  );
}

export default ArtPlate;
