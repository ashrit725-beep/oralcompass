import { COMPASS } from "@/lib/copy/compass";
import type { CoverageVM } from "@/lib/compass-model";
import type { Stitch } from "@/lib/types";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";

/**
 * CoverageMeter (spec §4.6 "Coverage" quadrant): one row per coverage class: name, `plan pays {pct}%` in tabular numerals, a 6 px meter
 * in `--water`, the out-of-network share in muted text when it differs, and the stitch chip of the clause that states the share.
 * A share the pages do not state renders the UNKNOWN badge and an empty dotted track, never 0 %. Static apart from the fill's
 * CSS transition (zeroed under reduced motion).
 */
export interface CoverageMeterProps {
  cls: CoverageVM;
  stitch?: Stitch;
  selectedStitch?: Stitch;
  onSelectStitch?: (s: Stitch) => void;
}

const pctText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function CoverageMeter({ cls, stitch, selectedStitch, onSelectStitch }: CoverageMeterProps) {
  const known = cls.pctIn != null;
  return (
    <li className="cmp-class">
      <div className="cmp-class-head">
        <span className="cmp-class-name">{cls.name}</span>
        <span className="cmp-class-pct">
          {known ? <span className="num">{COMPASS.planPays(pctText(cls.pctIn!))}</span> : <span className="cmp-word">{COMPASS.shareNotStated}</span>}
          {stitch ? <StitchChip stitch={stitch} selected={selectedStitch?.id === stitch.id} onSelect={onSelectStitch} /> : <EvidenceBadge status={cls.statusIn} />}
        </span>
      </div>
      <div className={`cmp-meter cmp-meter-thin ${known ? "" : "is-unknown"}`} role={known ? "meter" : undefined} aria-valuemin={known ? 0 : undefined} aria-valuemax={known ? 100 : undefined}
           aria-valuenow={known ? cls.pctIn! : undefined} aria-valuetext={known ? `${cls.name}: ${COMPASS.planPays(pctText(cls.pctIn!))}` : undefined} aria-hidden={known ? undefined : true}>
        <span className="cmp-fill" style={{ transform: `scaleX(${known ? Math.max(0, Math.min(100, cls.pctIn!)) / 100 : 0})` }} />
      </div>
      {cls.pctOut != null && cls.pctOut !== cls.pctIn && <p className="cmp-out num">{COMPASS.outOfNetwork(pctText(cls.pctOut))} <EvidenceBadge status={cls.statusOut ?? "DOC"} /></p>}
    </li>
  );
}

export default CoverageMeter;
