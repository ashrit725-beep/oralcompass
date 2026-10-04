/**
 * Phone variants of the painted plates (tools/art_variants.py writes web/public/art/<name>-<480|720|960>.webp/.avif and sizes.json).
 * The app is phone-only, so a plate never needs its full 1080+ px original on a 390 px screen: a <picture> offers the AVIF variants
 * (when every width has one) and a WebP srcset that ends with the original, and the browser picks by `sizes` and the device pixel ratio.
 * The original stays the <img src> fallback, so a browser without srcset support (or a missing variant) still gets the plate.
 */
import manifest from "../../public/art/sizes.json";

interface Variant { w: number; h: number; webp: string; bytes: number; avif?: string; avifBytes?: number }
interface Plate { w: number; h: number; src: string; bytes: number; variants: Variant[] }

const PLATES = manifest as Record<string, Plate>;

/** Full-bleed in the phone column (the column is at most 480 CSS px wide). */
export const FULL_BLEED_SIZES = "min(100vw, 480px)";

export interface ArtSources {
  /** The original plate: the <img src> fallback. */
  src: string;
  /** `srcset` for <source type="image/webp">: the variants, then the original at its own width. */
  webp: string;
  /** `srcset` for <source type="image/avif">, or undefined when any width lacks an AVIF (a gap would make the browser under-fetch). */
  avif?: string;
}

/** The sources for `/art/<name>.webp`; a plate the manifest does not know gets its original only. */
export function artSources(name: string): ArtSources {
  const plate = PLATES[name];
  const src = plate?.src ?? `/art/${name}.webp`;
  if (!plate || plate.variants.length === 0) return { src, webp: src };
  const webp = [...plate.variants.map((v) => `${v.webp} ${v.w}w`), `${plate.src} ${plate.w}w`].join(", ");
  const avif = plate.variants.every((v) => v.avif) ? plate.variants.map((v) => `${v.avif} ${v.w}w`).join(", ") : undefined;
  return { src, webp, avif };
}

/**
 * One URL for places that cannot take a srcset (an SVG <image>, a CSS background): the smallest WebP variant at least `cssPx * dpr`
 * wide, else the original. `dpr` defaults to the device's ratio, capped at 3.
 */
export function artHref(name: string, cssPx: number, dpr: number = typeof window === "undefined" ? 2 : Math.min(3, window.devicePixelRatio || 1)): string {
  const plate = PLATES[name];
  if (!plate) return `/art/${name}.webp`;
  const need = cssPx * dpr;
  const fit = plate.variants.find((v) => v.w >= need);
  return fit ? fit.webp : plate.src;
}

