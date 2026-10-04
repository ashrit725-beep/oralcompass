/**
 * Hover.dev "Draw Outline Button" — technique re-implemented by hand from the description at https://www.hover.dev/components/buttons
 * (Draw Outline Button). Licence: Hover.dev free-component licence (use in unlimited end products; not redistributable as a component
 * library). No Hover.dev asset is copied; this file is written from the component plan's description (§2 N10), 2026-10-03.
 *
 * Four 2 px spans draw an ink frame in sequence (100 ms × 4 = 400 ms) on hover AND focus-visible; `data-state="selected"` keeps the frame
 * drawn for the active checkpoint. Patches vs the original idea: indigo → ink, every `group-hover:` has a `group-focus-visible:` twin,
 * spans are `aria-hidden`, the button is ≥ 44 px, and `motion-reduce:transition-none motion-reduce:delay-0` snaps the frame.
 * Reduced motion: the frame appears instantly (CSS transitions off); hover/focus/selected states stay legible.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface DrawOutlineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

const edge = "pointer-events-none absolute bg-ink transition-all duration-100 motion-reduce:transition-none motion-reduce:delay-0 group-hover:delay-0 group-focus-visible:delay-0 group-data-[state=selected]:delay-0";

export function DrawOutlineButton({ children, className, selected = false, type = "button", ...rest }: DrawOutlineButtonProps) {
  return (
    <button
      type={type}
      data-state={selected ? "selected" : undefined}
      className={cn(
        "unstyled group relative inline-flex min-h-11 items-center justify-center bg-transparent px-4 py-2 font-medium text-ink-soft transition-colors duration-[400ms] motion-reduce:transition-none hover:text-ink focus-visible:text-ink data-[state=selected]:text-ink",
        "outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {/* TOP → RIGHT → BOTTOM → LEFT, 100 ms each */}
      <span aria-hidden="true" className={cn(edge, "left-0 top-0 h-[2px] w-0 group-hover:w-full group-focus-visible:w-full group-data-[state=selected]:w-full")} />
      <span aria-hidden="true" className={cn(edge, "right-0 top-0 h-0 w-[2px] delay-100 group-hover:h-full group-focus-visible:h-full group-data-[state=selected]:h-full group-hover:delay-100 group-focus-visible:delay-100")} />
      <span aria-hidden="true" className={cn(edge, "bottom-0 right-0 h-[2px] w-0 delay-200 group-hover:w-full group-focus-visible:w-full group-data-[state=selected]:w-full group-hover:delay-200 group-focus-visible:delay-200")} />
      <span aria-hidden="true" className={cn(edge, "bottom-0 left-0 h-0 w-[2px] delay-300 group-hover:h-full group-focus-visible:h-full group-data-[state=selected]:h-full group-hover:delay-300 group-focus-visible:delay-300")} />
    </button>
  );
}

export default DrawOutlineButton;
