import { useMemo, useState, type ReactNode } from "react";
import { artHref } from "@/lib/art-srcset";

/**
 * ArtPlate (spec §6, addendum A1): an SVG <image> that requests the phone variant of `/art/<slot>.webp` (lib/art-srcset), then the
 * original, then `/art/<slot>.png`, then renders the SVG
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
  // An SVG <image> takes no srcset, so the phone variant is picked here: the smallest one at least w × DPR wide (viewBox units are close
  // to CSS px in the phone atlas), then the original WebP, then the PNG, then the painted SVG fallback.
  const hrefs = useMemo(() => {
    const original = `/art/${slot}.webp`;
    const variant = artHref(slot, w);
    return (variant === original ? [original] : [variant, original]).concat(`/art/${slot}.png`);
  }, [slot, w]);
  const [attempt, setAttempt] = useState(0);
  if (attempt >= hrefs.length) return <>{fallback}</>;
  const href = hrefs[attempt];
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
      onError={() => { const next = attempt + 1; if (next >= hrefs.length) onFallback?.(); setAttempt(next); }}
    />
  );
}

export default ArtPlate;
