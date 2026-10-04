import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { DRAWER } from "@/lib/copy";
import { PASSAGE } from "@/lib/copy/passage";
import type { GlyphId } from "@/lib/islands";
import { checkpointAria, islandAmountText, moneyText } from "@/lib/passage";
import type { InsuranceCheckpointVM, IslandVM, MapSelection, PassageVM, Stitch } from "@/lib/types";
import { Glyph, toneOf } from "./InsuranceCheckpoint";
import { islandAria, type SelectIsland } from "./PassageControls";
import { Soundings } from "./Soundings";

/**
 * PassageVertical (spec §4.3): the phone passage as an <ol> with a dashed route down the left edge (aria-hidden). START card →
 * island cards (name, tooth, you pay, place) each followed by its checkpoint rows (44 px buttons: glyph · term · signed amount, the
 * mini-receipt of the leg, addendum graft) and a soundings line → the Harbor Light card; visited islets and marginal islands follow.
 * Opening a card selects the island (the ProcedureDrawer renders the bottom sheet). The legend row is included (addendum B2).
 * Every text container has min-width 0 and overflow-wrap anywhere so 360 px never scrolls horizontally.
 */
export interface PassageVerticalProps { vm: PassageVM; selected: MapSelection | null; onSelect: SelectIsland; planCode: string; onSelectStitch?: (s: Stitch) => void }

const isPass = (cp: InsuranceCheckpointVM) => cp.change === 0 && cp.stepIndexes.length === 0 && cp.rule !== "fee" && cp.rule !== "total";

function CheckpointRow({ cp, islandId, selected, onSelect, onSelectStitch }: { cp: InsuranceCheckpointVM; islandId: string; selected: boolean; onSelect: SelectIsland; onSelectStitch?: (s: Stitch) => void }) {
  const pass = isPass(cp);
  const tone = toneOf(cp, pass);
  const amount = cp.rule === "fee" || cp.rule === "total" ? <Money cents={cp.amountOut} evidence={cp.badge} badge={false} />
    : cp.rule === "X" || cp.rule === "W" || cp.rule === "F" ? <Money cents={cp.amountOut} evidence={cp.badge} badge={false} />
    : cp.rule === "missing" ? <span className="pv-wait">{PASSAGE.waitingLower}</span>
    : cp.split ? <span className="pv-split"><Money cents={cp.split.plan} evidence={cp.badge} badge={false} /> · <Money cents={cp.split.patient} evidence={cp.badge} badge={false} /></span>
    : cp.change === 0 ? <span className="pv-nochange">{PASSAGE.noChange}</span> : <Money cents={cp.change} evidence={cp.badge} badge={false} signed />;
  return (
    <li className="pv-cp-item">
      <button type="button" className={`unstyled pv-cp tone-${tone} ${pass ? "is-passed" : ""} ${selected ? "is-selected" : ""}`} aria-pressed={selected} aria-label={checkpointAria(cp)} onClick={(e) => onSelect(islandId, cp.key, e.currentTarget, e.detail === 0)}>
        <span className="cp-visual"><Glyph id={(pass ? "passed" : cp.glyph) as GlyphId} size={14} /></span>
        <span className="pv-term">{cp.term}{cp.owner === "nobody" && cp.change ? <small className="pv-owner"> · {PASSAGE.notOwedByYou}</small> : null}</span>
        <span className={`pv-amt ${cp.change != null && cp.change < 0 && cp.owner === "patient" ? "is-yours" : ""}`}>{amount}</span>
      </button>
      {(cp.stitch || cp.badge) && (
        <span className="pv-evidence">{cp.stitch && onSelectStitch ? <StitchChip stitch={cp.stitch} onSelect={onSelectStitch} />
          : cp.rule === "total" && cp.amountOut != null ? <span className="fig-calc">{DRAWER.calculated}</span>   /* an engine total, not a quote from the document */
          : <EvidenceBadge status={cp.badge} />}</span>
      )}
    </li>
  );
}

export function PassageVertical({ vm, selected, onSelect, planCode, onSelectStitch }: PassageVerticalProps) {
  const isSel = (id: string) => !!selected && selected.islandId === id && !selected.checkpointKey;
  const card = (isl: IslandVM, cls: string, body?: React.ReactNode) => (
    <button type="button" className={`unstyled pv-card ${cls} ${isSel(isl.id) ? "is-selected" : ""} ${isl.state === "unresolved" ? "is-fog" : ""} ${isl.state === "not_covered" ? "is-closed" : ""}`} aria-pressed={isSel(isl.id)} aria-label={islandAria(isl)} onClick={(e) => onSelect(isl.id, undefined, e.currentTarget, e.detail === 0)}>
      <span className="pv-title">{isl.title}</span>
      {isl.subtitle && <span className="pv-sub">{isl.subtitle}</span>}
      {body}
      <span className="pv-place">{isl.place}</span>
    </button>
  );
  const start = vm.start, light = vm.destination;
  return (
    <div className="passage-vertical-wrap" id="passage-islands" tabIndex={-1}>
      <div className="pv-header" aria-hidden="true" />
      <ol className="passage-vertical" aria-label={PASSAGE.mapLabel}>
        <li className="pv-item pv-start">
          <button type="button" className={`unstyled pv-card pv-frame ${isSel("start") ? "is-selected" : ""}`} aria-pressed={isSel("start")} aria-label={PASSAGE.startLabel(planCode || "—", start.subtitle?.split(" · ")[1] ?? PASSAGE.networkNotProvided)} onClick={(e) => onSelect("start", undefined, e.currentTarget, e.detail === 0)}>
            <span className="pv-title">{start.title}</span>
            <span className="pv-sub">{planCode} · {start.subtitle?.split(" · ")[1]}</span>
            {start.notices.length > 0 && <span className="ctl-pennant">{start.notices[0]}</span>}
            <span className="pv-place">{start.place}</span>
          </button>
          {start.soundingsAfter && <Soundings after={start.soundingsAfter} inline label={PASSAGE.soundingsBefore} />}
        </li>
        {vm.islands.map((isl) => (
          <li key={isl.id} className={`pv-item pv-island is-${isl.state}`}>
            {card(isl, "pv-island-card", <span className={`pv-amt-line ${isl.state}`}>{isl.state === "estimate" ? <>{PASSAGE.youPay} <Money cents={isl.youPay} evidence={isl.checkpoints.find((c) => c.rule === "CO")?.badge ?? "UNKNOWN"} badge={false} calc /></> : isl.state === "not_covered" ? <>{PASSAGE.notCoveredLower} · <Money cents={isl.youPay} evidence="USER" badge={false} calc /></> : islandAmountText(isl)}</span>)}
            {isl.checkpoints.length > 0 && (
              <ol className="pv-cps" aria-label={PASSAGE.checkpointsOf(isl.title)}>
                {isl.checkpoints.map((cp) => <CheckpointRow key={cp.key} cp={cp} islandId={isl.id} selected={!!selected && selected.islandId === isl.id && selected.checkpointKey === cp.key} onSelect={onSelect} onSelectStitch={onSelectStitch} />)}
              </ol>
            )}
            {isl.notices.length > 0 && <p className="pv-notices">{PASSAGE.notices(isl.notices.length)}</p>}
            {isl.soundingsAfter && <Soundings after={isl.soundingsAfter} inline label={isl.title} />}
          </li>
        ))}
        <li className="pv-item pv-light">
          <button type="button" className={`unstyled pv-card pv-frame ${isSel("destination") ? "is-selected" : ""}`} aria-pressed={isSel("destination")} aria-label={`${PASSAGE.lightLabel(light.youPay != null ? `${PASSAGE.youPay} ${moneyText(light.youPay)}` : PASSAGE.waitingLower)}${light.planPays != null ? ` · ${PASSAGE.plan} ${moneyText(light.planPays)}` : ""}`} onClick={(e) => onSelect("destination", undefined, e.currentTarget, e.detail === 0)}>
            <span className="pv-title">{light.title}</span>
            <span className={`pv-amt-line ${light.youPay != null ? "estimate" : "unresolved"}`}>{light.youPay != null ? <>{PASSAGE.youPay} <Money cents={light.youPay} evidence="DOC" badge={false} calc /> · {PASSAGE.plan} <Money cents={light.planPays} evidence="DOC" badge={false} calc /></> : PASSAGE.waitingLower}</span>
            {light.youPay != null && <span className="fig-calc" aria-hidden="true">{DRAWER.calculated}</span>}
            {light.subtitle && <span className="pv-place">{light.subtitle}</span>}
          </button>
        </li>
      </ol>
      {vm.visited.length > 0 && (
        <section className="pv-side" aria-labelledby="pv-visited-h">
          <h3 id="pv-visited-h" className="pv-side-h">{PASSAGE.visitedTable}</h3>
          <p className="pv-side-note">{PASSAGE.visitedFigures} <EvidenceBadge status="USER" /></p>
          <ul className="pv-side-list">
            {vm.visited.map((v) => (
              <li key={v.id}><button type="button" className={`unstyled pv-mini ${isSel(v.id) ? "is-selected" : ""}`} aria-pressed={isSel(v.id)} aria-label={`${v.title}${v.subtitle ? ` · ${v.subtitle}` : ""} · ${PASSAGE.legendVisited} · ${islandAmountText(v)}`} onClick={(e) => onSelect(v.id, undefined, e.currentTarget, e.detail === 0)}>
                <span className="visited-mark"><Glyph id="visited" size={12} /></span><span className="pv-title">{v.title}</span><span className="pv-sub">{v.claim?.date ?? v.item?.appointment_date ?? ""}</span>
                <span className="pv-amt">{v.planPays != null ? <Money cents={v.planPays} evidence="USER" badge={false} /> : <span className="pv-wait">{PASSAGE.planPaidNotProvided}</span>}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
      {vm.marginal.length > 0 && (
        <section className="pv-side" aria-labelledby="pv-marginal-h">
          <h3 id="pv-marginal-h" className="pv-side-h">{PASSAGE.marginalTable}</h3>
          <ul className="pv-side-list">
            {vm.marginal.map((m) => (
              <li key={m.id}><button type="button" className={`unstyled pv-mini pv-marginal ${isSel(m.id) ? "is-selected" : ""}`} aria-pressed={isSel(m.id)} aria-label={`${m.title} · ${PASSAGE.legendMarginal} · ${islandAmountText(m)} · ${m.place}`} onClick={(e) => onSelect(m.id, undefined, e.currentTarget, e.detail === 0)}>
                <span className="pv-title">{m.title}</span><span className="pv-sub">{m.place}</span>
                <span className={`pv-amt ${m.checkpoints.length ? "is-closed" : ""}`}>{m.checkpoints.length ? <><Glyph id="closed" size={12} /> {PASSAGE.notCoveredLower}</> : PASSAGE.noEstimateCalculated}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
      <div className="passage-legend pv-legend" aria-hidden="true">
        <span className="lg"><span className="lg-mark tone-plan"><Glyph id="share" size={12} /></span>{PASSAGE.legendCheckpoint}</span>
        <span className="lg"><span className="lg-mark tone-patient"><Glyph id="youpay" size={12} /></span>{PASSAGE.youPay}</span>
        <span className="lg"><span className="lg-mark tone-passed"><Glyph id="passed" size={12} /></span>{PASSAGE.legendPassed}</span>
        <span className="lg"><span className="lg-mark tone-closed"><Glyph id="closed" size={12} /></span>{PASSAGE.legendClosed}</span>
        <span className="lg"><span className="lg-mark tone-fog"><Glyph id="fog" size={12} /></span>{PASSAGE.legendFog}</span>
        <span className="lg lg-note">{PASSAGE.legendAmounts}</span>
      </div>
    </div>
  );
}

export default PassageVertical;
