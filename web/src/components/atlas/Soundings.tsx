import { Money } from "@/components/Money";
import { EvidenceBadge } from "@/components/Primitives";
import { PASSAGE } from "@/lib/copy/passage";
import { moneyText } from "@/lib/passage";
import type { IslandVM } from "@/lib/types";

/**
 * Soundings (spec §1.1, §3.2): the engine's `remaining_after` figures printed on the water after an island, ink on a parchment lozenge.
 * They are HTML (never text on the painting) so every figure renders through <Money>; the remaining amounts derive from the benefit
 * statement the user entered, so the lozenge carries one USER badge. `sounding-roll`: NumberFlow rolls old → new when a new estimate
 * arrives (reduced motion: snaps). `null` annual maximum reads "no maximum applies" (never $0.00).
 */
export interface SoundingsProps { after: NonNullable<IslandVM["soundingsAfter"]>; x?: number; y?: number; className?: string; label?: string; inline?: boolean }

export function Soundings({ after, x, y, className = "", label, inline = false }: SoundingsProps) {
  const maxText = after.unlimited || after.annualMax == null ? PASSAGE.noMaximum : moneyText(after.annualMax);
  const aria = PASSAGE.soundingsAria(moneyText(after.deductible), maxText);
  const style = inline ? undefined : ({ "--px": x, "--py": y } as React.CSSProperties);
  return (
    <p className={`sounding ${inline ? "sounding-inline" : ""} ${className}`} style={style} role="group" aria-label={label ? `${label}: ${aria}` : aria}>
      <span className="sounding-row"><span className="sounding-term">{PASSAGE.soundingsDeductible}</span> <Money cents={after.deductible} evidence="USER" badge={false} /></span>
      <span className="sounding-row"><span className="sounding-term">{PASSAGE.soundingsMax}</span> {after.unlimited || after.annualMax == null ? <span className="sounding-none">{PASSAGE.noMaximum}</span> : <Money cents={after.annualMax} evidence="USER" badge={false} />}</span>
      <EvidenceBadge status="USER" />
    </p>
  );
}

export default Soundings;
