import { Anchor, Compass, FileText } from "lucide-react";
import type { NAV } from "@/lib/copy";

/**
 * Phone dock icons (orchestrator note 7): from the component plan's allowed lucide list — My journey = Compass, My plan = Anchor,
 * Documents = FileText. Decorative: the visible label
 * beside each icon is the tab's name.
 */
export function NavIcon({ tab }: { tab: keyof typeof NAV }) {
  const common = { "aria-hidden": true, focusable: false, className: "size-5 shrink-0", strokeWidth: 1.75 } as const;
  if (tab === "journey") return <Compass {...common} />;
  if (tab === "plan") return <Anchor {...common} />;
  return <FileText {...common} />;
}

export default NavIcon;
