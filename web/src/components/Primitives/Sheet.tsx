import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sheet (spec §4.3 / §6): the phone bottom sheet, built on the shadcn Drawer (vaul over Radix Dialog — role="dialog", aria-modal, focus
 * trap, Escape, scroll lock). max-height 72vh (85dvh where dvh is supported), radius 18 18 0 0, 44 px grab-handle area, 44 × 44 close
 * button `aria-label="Close details"`, sticky 48 px title bar; `originRect` (the island card's top edge) sets the visual origin of
 * `drawer-rise`. Focus returns to the element that opened it (Radix) or to `returnFocus` when given.
 * Motion: vaul's slide uses the CSS duration zeroed under reduced motion (styles.css); the content fade uses the sheet spring values
 * via `--dur-standard`/`--ease-land`. Reduced motion: appears/disappears instantly, end states intact.
 */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  originRect?: DOMRect | null;
  returnFocus?: HTMLElement | null;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  /** Move focus into the sheet when it opens (Radix focuses the first control). Off by default (vaul's default). */
  autoFocus?: boolean;
}

export function Sheet({ open, onOpenChange, title, description, originRect, returnFocus, children, className, closeLabel = "Close details", autoFocus = false }: SheetProps) {
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && returnFocus && document.contains(returnFocus)) returnFocus.focus();
    wasOpen.current = open;
  }, [open, returnFocus]);
  const origin = originRect ? `${originRect.left + originRect.width / 2}px ${Math.max(0, originRect.top)}px` : undefined;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" autoFocus={autoFocus}>
      <DrawerContent
        handleLabel={closeLabel}
        aria-modal="true"
        className={cn("max-h-[72vh] supports-[height:1dvh]:max-h-[85dvh] rounded-t-[18px] shadow-3", className)}
        style={origin ? ({ transformOrigin: origin } as React.CSSProperties) : undefined}
      >
        <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between gap-2 border-b border-rule bg-paper-deep px-4">
          <DrawerTitle className="truncate">{title}</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-touch" aria-label={closeLabel} className="-mr-2 shrink-0"><X aria-hidden="true" /></Button>
          </DrawerClose>
        </div>
        {description ? <DrawerDescription className="px-4 pt-2">{description}</DrawerDescription> : <DrawerDescription className="sr-only">{typeof title === "string" ? title : "Details"}</DrawerDescription>}
        <div className="min-w-0 overflow-y-auto px-4 pb-6 pt-2 [overflow-wrap:anywhere]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export default Sheet;
