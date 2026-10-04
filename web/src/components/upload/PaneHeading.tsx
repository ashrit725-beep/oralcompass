import { useEffect, useRef, type ReactNode } from "react";

/**
 * PaneHeading (a11y-7): the h3 of an upload wizard pane. When a pane mounts (the wizard moved to a new step) focus moves to its heading,
 * so keyboard users continue from the new step and screen readers announce it (the Stepper unmounts the old pane, which would otherwise
 * drop focus to the dialog). tabIndex -1: focusable by script only, never a tab stop.
 */
export function PaneHeading({ children, className = "up-h3" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); ref.current?.scrollIntoView?.({ block: "nearest" }); }, []);
  return <h3 ref={ref} tabIndex={-1} className={className}>{children}</h3>;
}

export default PaneHeading;
