import type { CSSProperties, ImgHTMLAttributes } from "react";
import { artSources } from "@/lib/art-srcset";

/**
 * A painted plate as a <picture> (lib/art-srcset): the AVIF variants, the WebP variants with the original as the widest candidate,
 * and an <img> that carries NO src. React builds the <img> before it joins its <picture>, and WebKit starts an <img src> fetch at
 * once, even detached: with a src, iPhones downloaded the 1080 px original as well as the chosen variant. Without one, the image is
 * chosen only once the <source>s are in place. The WebP <source> ends with the original, so every browser still gets a plate.
 */
export interface ArtPictureProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes"> {
  /** The plate name: `/art/<name>.webp`. */
  name: string;
  /** The `sizes` for both sources, e.g. FULL_BLEED_SIZES or the slot width in px. */
  sizes: string;
  style?: CSSProperties;
}

export function ArtPicture({ name, sizes, alt = "", ...img }: ArtPictureProps) {
  const art = artSources(name);
  return (
    <picture>
      {art.avif && <source type="image/avif" srcSet={art.avif} sizes={sizes} />}
      <source type="image/webp" srcSet={art.webp} sizes={sizes} />
      <img alt={alt} {...img} />
    </picture>
  );
}

export default ArtPicture;
