import type { CheckpointRule } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Checkpoint glyphs (spec §5.6) as SVG paths, never text or emoji: § fee, ≈ allowed, ⇄ alternate, ◐ deductible, ◑ share, ▲ maximum,
 * ≡ listed, ● you pay, ⊘ closed (X / W / F), ? fog. `aria-hidden`: the term is always written next to the glyph. Static (no motion).
 * Colour comes from `currentColor` (ink; terracotta on the you-pay and closed markers via the parent's class).
 */
export function RuleGlyph({ rule, className, size = 20 }: { rule: CheckpointRule; className?: string; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: React.ReactNode;
  switch (rule) {
    case "fee":      // the quay: a receipt with two lines
      body = <><path {...common} d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20z" /><path {...common} d="M9.5 9h5M9.5 12.5h5" /></>; break;
    case "N":        // the reef: two waves
      body = <path {...common} d="M4 10c2-2 4-2 6 0s4 2 6 0 4-2 4 0M4 15c2-2 4-2 6 0s4 2 6 0 4-2 4 0" />; break;
    case "AB":       // the point: two arrows
      body = <path {...common} d="M5 9h13M15 6l3 3-3 3M19 15H6M9 12l-3 3 3 3" />; break;
    case "D":        // the crossing: left half filled
      body = <><circle {...common} cx="12" cy="12" r="7.5" /><path d="M12 4.5a7.5 7.5 0 0 0 0 15z" fill="currentColor" /></>; break;
    case "CO":       // the strait: right half filled
      body = <><circle {...common} cx="12" cy="12" r="7.5" /><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" /></>; break;
    case "M":        // the gate: a triangle
      body = <path {...common} d="M12 5l8 14H4z" />; break;
    case "L":        // the ledger: three lines
      body = <path {...common} d="M5 8h14M5 12h14M5 16h14" />; break;
    case "total":    // the landing: a filled circle
      body = <circle cx="12" cy="12" r="6.5" fill="currentColor" />; break;
    case "X": case "W": case "F":   // the closed channel: ring with a bar
      body = <><circle {...common} cx="12" cy="12" r="7.5" /><path {...common} d="M7 17L17 7" /></>; break;
    default:         // the fog bank: a dotted ring with a question mark
      body = <><circle {...common} cx="12" cy="12" r="7.5" strokeDasharray="2 3" /><path {...common} d="M10 10a2 2 0 1 1 3 1.7c-.8.5-1 1-1 1.8" /><circle cx="12" cy="16.5" r=".9" fill="currentColor" /></>;
  }
  return (
    <svg className={cn("rule-glyph shrink-0", className)} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

export default RuleGlyph;
