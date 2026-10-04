import { Anchor, Compass, FileText } from "lucide-react";
import type { NAV } from "@/lib/copy";

/**
 * Phone dock icons (orchestrator note 7): from the component plan's allowed lucide list — My journey = Compass, My plan = Anchor,
 * Documents = FileText — and a small custom two-column glyph for Compare (no allowed lucide icon fits). Decorative: the visible label
 * beside each icon is the tab's name.
 */
export function NavIcon({ tab }: { tab: keyof typeof NAV }) {
  const common = { "aria-hidden": true, focusable: false, className: "size-5 shrink-0", strokeWidth: 1.75 } as const;
  if (tab === "journey") return <Compass {...common} />;
  if (tab === "plan") return <Anchor {...common} />;
  if (tab === "documents") return <FileText {...common} />;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...common}>
      <rect x="3.5" y="4" width="7" height="16" rx="1.5" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.5" />
      <path d="M5.75 9h2.5M5.75 12.5h2.5M15.75 9h2.5M15.75 12.5h2.5" />
    </svg>
  );
}

export default NavIcon;
