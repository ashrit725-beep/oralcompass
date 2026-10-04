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
}

export function Sheet({ open, onOpenChange, title, description, originRect, returnFocus, children, className, closeLabel = "Close details" }: SheetProps) {
  const wasOpen = useRef(open);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnRef = useRef(returnFocus);
  returnRef.current = returnFocus;
  // Focus return is deferred one task: while the sheet is mounted Radix's FocusScope traps focus, so a synchronous focus() on the island
  // behind it is pulled straight back (mobile-2). Runs on close (`open` → false) and on unmount, the way the ProcedureDrawer closes.
  const restore = () => { const el = returnRef.current; window.setTimeout(() => { if (el && el.isConnected) el.focus({ preventScroll: true }); }, 0); };
  useEffect(() => {
    if (wasOpen.current && !open) restore();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => () => { if (wasOpen.current) restore(); }, []);
  const origin = originRect ? `${originRect.left + originRect.width / 2}px ${Math.max(0, originRect.top)}px` : undefined;
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent
        handleLabel={closeLabel}
        className={cn("max-h-[72vh] supports-[height:1dvh]:max-h-[85dvh] rounded-t-[18px] shadow-3", className)}
        style={origin ? ({ transformOrigin: origin } as React.CSSProperties) : undefined}
        // vaul suppresses Radix's open auto-focus; without it focus stayed on the island card behind the aria-modal sheet and Tab walked the
        // page (mobile-2). Focus the sheet's title instead (a heading, so nothing activates by accident).
        onOpenAutoFocus={(e) => { e.preventDefault(); titleRef.current?.focus({ preventScroll: true }); }}
      >
        <div className="sticky top-0 z-10 flex min-h-12 items-center justify-between gap-2 border-b border-rule bg-paper-deep px-4">
          {/* two lines at most, balanced, instead of an ellipsis that cut the procedure name (layout-11) */}
          <DrawerTitle ref={titleRef} tabIndex={-1} className="min-w-0 py-2 line-clamp-2 [text-wrap:balance] outline-none focus-visible:outline-3 focus-visible:outline-ring">{title}</DrawerTitle>
          <DrawerClose asChild>
            <Button variant="ghost" size="icon-touch" aria-label={closeLabel} className="-mr-2 shrink-0"><X aria-hidden="true" /></Button>
          </DrawerClose>
        </div>
        {description ? <DrawerDescription className="px-4 pt-2">{description}</DrawerDescription> : <DrawerDescription className="sr-only">{typeof title === "string" ? title : "Details"}</DrawerDescription>}
        {/* safe-area padding keeps the last line above the home indicator; contain stops the page scrolling behind at the ends (mobile-12) */}
        <div className="min-w-0 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2 [overflow-wrap:anywhere]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export default Sheet;
