import { COMPASS } from "@/lib/copy/compass";
import { money } from "@/lib/stitches";
import type { Evidence, Stitch } from "@/lib/types";
import type { MeterVM } from "@/lib/compass-model";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";

/**
 * Gauge (spec §4.6 "Deductible" / "Annual maximum" quadrants; addendum: bullet-bar meters, never a radial dial). One horizontal meter,
 * 8 px: track parchment, fill `--water` for the part already met / paid (USER figures from the statement), a thin terracotta tick for
 * the level after the planned work (the engine's `remaining_after`, stitched to the clause). Labels in ink: limit (DOC + stitch),
 * met / remaining (USER + derivation), after the planned work (DOC via the clause stitch). UNKNOWN limit → empty dotted track and
 * "Not stated in this document"; unlimited → the words and no meter; no statement → a hatched dashed track (never the plain track of
 * "$0 used") with "Not provided".
 * Motion: the fill scales on the x axis with a CSS transition (`--dur-standard`), zeroed under reduced motion; the figures roll through
 * <Money> (NumberFlow) which respects the user's motion preference itself. Status is never colour alone: glyph + word on every badge.
 */
export interface GaugeProps {
  label: string;
  meter: MeterVM;
  /** The stitch for the limit's clause, resolved by the caller from `meter.limitCite`. */
  stitch?: Stitch;
  selectedStitch?: Stitch;
  onSelectStitch?: (s: Stitch) => void;
  usedWord: string;
  compact?: boolean;
}

export function Gauge({ label, meter, stitch, selectedStitch, onSelectStitch, usedWord, compact }: GaugeProps) {
  const known = meter.limitCents != null && !meter.unlimited;
  const limitEvidence: Evidence = meter.limitStatus;
  const usedPct = meter.usedFraction == null ? 0 : meter.usedFraction * 100;
  const afterPct = meter.afterFraction == null ? null : meter.afterFraction * 100;
  const valueText = known
    ? COMPASS.meterName(label, meter.usedCents == null ? COMPASS.notProvided : money(meter.usedCents), money(meter.limitCents))
    : meter.unlimited ? `${label}: ${COMPASS.unlimited}` : `${label}: ${COMPASS.notStated}`;

  return (
    <div className={`cmp-gauge ${compact ? "is-compact" : ""}`}>
      <h4 className="cmp-h">{label}</h4>
      <div className="cmp-limit">
        {meter.unlimited ? (
          <><span className="cmp-word">{COMPASS.unlimited}</span> <EvidenceBadge status={limitEvidence} /></>
        ) : known ? (
          <><Money cents={meter.limitCents} evidence={limitEvidence} badge={!stitch} /> <span className="cmp-word">{COMPASS.limit}</span></>
        ) : (
          <><span className="cmp-word">{COMPASS.notStated}</span> <EvidenceBadge status={limitEvidence === "UNKNOWN" ? "UNKNOWN" : limitEvidence} /></>
        )}
        {stitch && <StitchChip stitch={stitch} selected={selectedStitch?.id === stitch.id} onSelect={onSelectStitch} />}
      </div>

      {!meter.unlimited && (
        <div
          className={`cmp-meter ${known ? "" : "is-unknown"} ${meter.usedCents == null ? "is-empty" : ""}`}
          role={known && meter.usedCents != null ? "meter" : undefined}
          aria-label={known && meter.usedCents != null ? label : undefined}
          aria-valuemin={known && meter.usedCents != null ? 0 : undefined}
          aria-valuemax={known && meter.usedCents != null ? meter.limitCents! / 100 : undefined}
          aria-valuenow={known && meter.usedCents != null ? meter.usedCents / 100 : undefined}
          aria-valuetext={known && meter.usedCents != null ? valueText : undefined}
          aria-hidden={known && meter.usedCents != null ? undefined : true}
        >
          <span className="cmp-fill" style={{ transform: `scaleX(${usedPct / 100})` }} />
          {afterPct != null && <span className="cmp-tick" style={{ left: `${afterPct}%` }} />}
        </div>
      )}
      {/* usage not provided: the hatched track must never read as "$0 used" (info-only-8); the compact gauge has no figure list, so it says so */}
      {compact && known && meter.usedCents == null && <p className="cmp-meter-word"><span className="cmp-word">{COMPASS.notProvided}</span> <EvidenceBadge status="UNKNOWN" /></p>}

      {!compact && !meter.unlimited && (
        <dl className="cmp-figures">
          <dt>{usedWord}</dt>
          <dd>{meter.usedCents == null ? <><span className="cmp-word">{COMPASS.notProvided}</span> <EvidenceBadge status="UNKNOWN" /></> : <Money cents={meter.usedCents} evidence="USER" />}</dd>
          <dt>{COMPASS.remaining}</dt>
          <dd>{meter.remainingCents == null ? <><span className="cmp-word">{known ? COMPASS.notProvided : COMPASS.notStated}</span> <EvidenceBadge status="UNKNOWN" /></> : <Money cents={meter.remainingCents} evidence="USER" />}</dd>
          {(meter.afterCents != null || meter.afterWaiting) && (
            <>
              <dt><span className="cmp-tick-glyph" aria-hidden="true">▏</span> {COMPASS.afterPlanned}</dt>
              <dd>{meter.afterCents == null ? <><span className="cmp-word">{COMPASS.waiting}</span> <EvidenceBadge status="UNKNOWN" /></> : <><Money cents={meter.afterCents} evidence={limitEvidence} calc />{stitch && <StitchChip stitch={stitch} selected={selectedStitch?.id === stitch.id} onSelect={onSelectStitch} />}</>}</dd>
            </>
          )}
        </dl>
      )}
      {!compact && meter.unlimited && meter.usedCents != null && (
        <dl className="cmp-figures"><dt>{usedWord}</dt><dd><Money cents={meter.usedCents} evidence="USER" /></dd></dl>
      )}
      {!compact && meter.derivation && <p className="cmp-derivation">{meter.derivation}</p>}
    </div>
  );
}

export default Gauge;
