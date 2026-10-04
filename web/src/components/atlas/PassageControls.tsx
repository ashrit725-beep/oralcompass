import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Money } from "@/components/Money";
import { PASSAGE } from "@/lib/copy/passage";
import { CHECKPOINT_TERM, type GlyphId } from "@/lib/islands";
import { checkpointAria, chipTitle, islandAmountText, lightWaitWord, moneyText, type PassageLayout } from "@/lib/passage";
import type { InsuranceCheckpointVM, IslandVM, MapSelection, PassageVM } from "@/lib/types";
import { Glyph, toneOf } from "./InsuranceCheckpoint";
import { Soundings } from "./Soundings";

/**
 * The HTML control layer over the painted passage (spec §9): real <button>s positioned at the same viewBox coordinates as the paint
 * (CSS vars --px/--py → percentages), each with a full-fact accessible name that includes its state (aria-pressed). Tab order follows
 * the document: START → islands in route order, each followed by its checkpoints in trail order → Harbor Light → visited → marginal.
 * Keyboard (§9.2): the chart is ONE tab stop (roving tabindex: the last focused or the selected control holds tabIndex 0, every other
 * control -1), so Tab moves past the map in one press. ← → move between the chart's controls in document order (START, islands, Harbor
 * Light, visited, marginal; wrapping), Home/End first/last, ↓ enters an island's checkpoints and ↑ ↓ move along them, ↑ on the first
 * checkpoint returns to the island. Keyboard activation never animates (`viaKeyboard`).
 * Targets: island/START/Light buttons ≥ 44 px tall; checkpoint buttons are 32 px visual inside a 44 × 44 hit box (the layout proves
 * the boxes never intersect). The legend is `aria-hidden`: every word it explains is already in the control names.
 */
export type SelectIsland = (islandId: string, checkpointKey: string | undefined, el: HTMLElement | null, viaKeyboard: boolean) => void;
export interface PassageControlsProps { vm: PassageVM; layout: PassageLayout; selected: MapSelection | null; onSelect: SelectIsland; planCode: string; groupId?: string }

const stateWord = (isl: IslandVM) => isl.state === "unresolved" ? PASSAGE.waitingLower : isl.state === "not_covered" ? PASSAGE.notCoveredLower : isl.state === "pending" ? PASSAGE.noEstimate.toLowerCase() : "";

export function islandAria(isl: IslandVM): string {
  const calc = (isl.kind === "procedure" || isl.kind === "destination") && isl.youPay != null;
  const parts = [isl.title, isl.subtitle, calc ? `${islandAmountText(isl)} (${PASSAGE.calculatedAria})` : islandAmountText(isl), isl.place];
  if (isl.checkpoints.length) parts.push(PASSAGE.checkpointsCount(isl.checkpoints.length));
  if (isl.notices.length) parts.push(PASSAGE.notices(isl.notices.length));
  return parts.filter(Boolean).join(" · ");
}

export function PassageControls({ vm, layout, selected, onSelect, planCode, groupId = "passage-islands" }: PassageControlsProps) {
  const pos = (x: number, y: number) => ({ "--px": x, "--py": y } as React.CSSProperties);
  const isSel = (id: string, cp?: string) => !!selected && selected.islandId === id && (cp ? selected.checkpointKey === cp : !selected.checkpointKey);
  // roving tabindex: one route control is in the tab order; focus (pointer or keys) moves it, a selection pins it
  const [active, setActive] = useState<string>("start");
  const routeIds = ["start", ...vm.islands.map((i) => i.id), "destination", ...layout.visited.map((v) => v.id), ...(layout.visitedMore ? ["visited:more"] : []), ...layout.marginal.map((m) => m.id), ...(layout.marginalMore ? ["marginal:more"] : [])];
  const current = selected && routeIds.includes(selected.islandId) ? selected.islandId : routeIds.includes(active) ? active : "start";
  const rove = (id: string) => ({ tabIndex: id === current ? 0 : -1, onFocus: () => setActive(id), "data-route-btn": true });
  const pick = (id: string, cp: string | undefined) => (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => onSelect(id, cp, e.currentTarget, (e as MouseEvent).detail === 0);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const root = e.currentTarget;
    const target = e.target as HTMLElement;
    const routeBtns = Array.from(root.querySelectorAll<HTMLElement>("[data-route-btn]"));
    const idx = routeBtns.indexOf(target.closest<HTMLElement>("[data-route-btn]") as HTMLElement);
    const island = target.dataset.island ?? target.closest<HTMLElement>("[data-island]")?.dataset.island;
    const cps = island ? Array.from(root.querySelectorAll<HTMLElement>(`[data-cp-of="${island}"]`)) : [];
    const cpIdx = cps.indexOf(target);
    const go = (el?: HTMLElement) => { if (el) { e.preventDefault(); el.focus(); } };
    switch (e.key) {
      case "ArrowRight": if (routeBtns.length) go(routeBtns[idx < 0 ? 0 : (idx + 1) % routeBtns.length]); break;
      case "ArrowLeft": if (routeBtns.length) go(routeBtns[idx < 0 ? routeBtns.length - 1 : (idx - 1 + routeBtns.length) % routeBtns.length]); break;
      case "Home": go(routeBtns[0]); break;
      case "End": go(routeBtns[routeBtns.length - 1]); break;
      case "ArrowDown": if (cps.length) go(cps[cpIdx < 0 ? 0 : Math.min(cpIdx + 1, cps.length - 1)]); break;
      case "ArrowUp": if (cpIdx > 0) go(cps[cpIdx - 1]); else if (cpIdx === 0 && island) go(root.querySelector<HTMLElement>(`[data-island="${island}"][data-route-btn]`) ?? undefined); break;
      default: return;
    }
  }, []);

  const start = vm.start, light = vm.destination;
  const startName = PASSAGE.startLabel(planCode || "—", start.subtitle?.split(" · ")[1] ?? PASSAGE.networkNotProvided);
  const lightName = PASSAGE.lightLabel(light.youPay != null ? `${PASSAGE.youPay} ${moneyText(light.youPay)} (${PASSAGE.calculatedAria})` : lightWaitWord(vm));

  return (
    <div className="passage-controls" id={groupId} role="group" aria-label={PASSAGE.islandsGroup} onKeyDown={onKeyDown} tabIndex={-1}>
      {/* START */}
      <button type="button" className={`unstyled ctl frame-btn start-btn ${isSel("start") ? "is-selected" : ""}`} style={pos(layout.startButton.x + layout.startButton.w / 2, layout.startButton.y + layout.startButton.h / 2)}
              {...rove("start")} data-island="start" aria-pressed={isSel("start")} aria-label={`${startName}${start.notices.length ? ` · ${start.notices[0]}` : ""}`} onClick={pick("start", undefined)}>
        <span className="ctl-title">{start.title}</span>
        <span className="ctl-sub">{planCode} · {start.subtitle?.split(" · ")[1]}</span>
        {start.notices.length > 0 && <span className="ctl-pennant">{PASSAGE.waiting}</span>}
      </button>

      {/* islands in route order, each followed by its checkpoints */}
      {vm.islands.map((isl, i) => {
        const L = layout.islands[i];
        const sel = isSel(isl.id);
        return (
          <div key={isl.id} className="ctl-island-group">
            <button type="button" className={`unstyled ctl island-btn is-${isl.state} ${sel ? "is-selected" : ""} ${selected && !sel && selected.islandId !== isl.id ? "is-dim" : ""} ${isl.state === "unresolved" ? "is-fog" : ""} ${isl.state === "not_covered" ? "is-closed" : ""}`}
                    style={pos(L.button.x + L.button.w / 2, L.button.y + L.button.h / 2)} {...rove(isl.id)} data-island={isl.id}
                    aria-pressed={sel} aria-label={islandAria(isl)} onClick={pick(isl.id, undefined)}>
              <span className="ctl-title">{isl.title}</span>
              {isl.subtitle && <span className="ctl-sub">{isl.subtitle}</span>}
              <span className={`ctl-amt ${isl.state}`}>
                {isl.state === "estimate" ? <>{PASSAGE.youPay} <Money cents={isl.youPay} evidence={isl.checkpoints.find((c) => c.rule === "CO")?.badge ?? "UNKNOWN"} badge={false} calc /></>
                  : isl.state === "not_covered" ? <>{PASSAGE.notCoveredLower} · <Money cents={isl.youPay} evidence="USER" badge={false} calc /></>
                  : <>{stateWord(isl) || PASSAGE.waitingLower}</>}
              </span>
            </button>
            {L.checkpoints.map((c) => {
              const cp = isl.checkpoints.find((x) => x.key === c.key) ?? null;
              const names = c.collapsedKeys ? c.collapsedKeys.map((k) => isl.checkpoints.find((x) => x.key === k)?.term ?? "").filter(Boolean) : [];
              const label = cp ? checkpointAria(cp) : c.collapsedKeys && !cp ? PASSAGE.passed(names.join(", ")) : "";
              const selCp = cp ? isSel(isl.id, cp.key) : false;
              const tone = toneOf(cp, c.passThrough);
              const glyph: GlyphId = cp ? (cp.glyph as GlyphId) : "passed";
              return (
                <button key={c.key} type="button" className={`unstyled ctl cp-btn tone-${tone} ${c.passThrough ? "is-passed" : ""} ${selCp ? "is-selected" : ""}`} style={pos(c.x, c.y)}
                        data-cp-of={isl.id} tabIndex={-1} aria-pressed={selCp} aria-label={label} title={cp ? `${cp.term} · ${cp.place}` : names.join(", ")}
                        onClick={pick(isl.id, cp?.key ?? c.collapsedKeys?.[0])}>
                  <span className="cp-visual"><Glyph id={glyph} size={14} /></span>
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Harbor Light */}
      <button type="button" className={`unstyled ctl frame-btn light-btn ${isSel("destination") ? "is-selected" : ""}`} style={pos(layout.destinationButton.x + layout.destinationButton.w / 2, layout.destinationButton.y + layout.destinationButton.h / 2)}
              {...rove("destination")} data-island="destination" aria-pressed={isSel("destination")} aria-label={`${lightName}${light.planPays != null ? ` · ${PASSAGE.plan} ${moneyText(light.planPays)}${light.upperBound ? ` ${PASSAGE.upperBoundParen}` : ""}` : ""}`} onClick={pick("destination", undefined)}>
        <span className="ctl-title">{light.title}</span>
        <span className={`ctl-amt ${light.youPay != null ? "estimate" : "unresolved"}`}>
          {light.youPay != null ? <>{PASSAGE.youPay} <Money cents={light.youPay} evidence="DOC" badge={false} calc /></> : lightWaitWord(vm)}
        </span>
      </button>

      {/* visited islets (completed on the statement) */}
      {layout.visited.map((v) => {
        const isl = vm.visited.find((x) => x.id === v.id)!;
        return (
          <button key={v.id} type="button" className={`unstyled ctl visited-btn ${isSel(isl.id) ? "is-selected" : ""}`} style={pos(v.button.x + v.button.w / 2, v.button.y + v.button.h / 2)} {...rove(isl.id)} data-island={isl.id}
                  aria-pressed={isSel(isl.id)} aria-label={`${isl.title}${isl.subtitle ? ` · ${isl.subtitle}` : ""} · ${PASSAGE.legendVisited} · ${islandAmountText(isl)}`} onClick={pick(isl.id, undefined)}>
            <span className="visited-mark"><Glyph id="visited" size={12} /></span>
            <span className="ctl-title" title={isl.title}>{chipTitle(isl.title)}</span>
            <span className="ctl-sub">{isl.claim?.date ?? isl.item?.appointment_date ?? PASSAGE.visitedStamp}</span>
          </button>
        );
      })}
      {layout.visitedMore && layout.visitedOverflow > 0 && (
        <button type="button" className="unstyled ctl visited-btn visited-more" style={pos(layout.visitedMore.x + layout.visitedMore.w / 2, layout.visitedMore.y + layout.visitedMore.h / 2)} {...rove("visited:more")}
                aria-label={PASSAGE.earlierVisits(vm.visited.length)} onClick={pick(vm.visited[3].id, undefined)}>
          <span className="ctl-title">{PASSAGE.moreVisited(layout.visitedOverflow)}</span>
        </button>
      )}

      {/* marginal islands (mentioned at the consultation) */}
      {layout.marginal.map((m) => {
        const isl = vm.marginal.find((x) => x.id === m.id)!;
        return (
          <button key={m.id} type="button" className={`unstyled ctl island-btn marginal-btn ${isSel(isl.id) ? "is-selected" : ""}`} style={pos(m.button.x + m.button.w / 2, m.button.y + m.button.h / 2)} {...rove(isl.id)} data-island={isl.id}
                  aria-pressed={isSel(isl.id)} aria-label={`${isl.title} · ${PASSAGE.legendMarginal} · ${islandAmountText(isl)} · ${isl.place}`} onClick={pick(isl.id, undefined)}>
            <span className="ctl-title">{isl.title}</span>
            <span className={`ctl-amt ${isl.checkpoints.length ? "not_covered" : "mentioned"}`}>{isl.checkpoints.length ? <><Glyph id="closed" size={12} /> {PASSAGE.notCoveredLower}</> : PASSAGE.noEstimateCalculated}</span>
          </button>
        );
      })}

      {layout.marginalMore && layout.marginalOverflow > 0 && (
        <button type="button" className="unstyled ctl island-btn marginal-btn marginal-more" style={pos(layout.marginalMore.x + layout.marginalMore.w / 2, layout.marginalMore.y + layout.marginalMore.h / 2)} {...rove("marginal:more")}
                aria-label={PASSAGE.mentionedCount(vm.marginal.length)} onClick={pick(vm.marginal[layout.marginal.length].id, undefined)}>
          <span className="ctl-title">{PASSAGE.moreMentioned(layout.marginalOverflow)}</span>
        </button>
      )}

      {/* soundings: ink on parchment, never on the painting */}
      {layout.soundings.map((s) => {
        const isl = vm.islands.find((x) => x.id === s.islandId)!;
        return isl.soundingsAfter ? <Soundings key={s.islandId} after={isl.soundingsAfter} x={s.x} y={s.y} className="ctl" label={isl.title} /> : null;
      })}
    </div>
  );
}

/** The legend under the map (§3.5): glyphs as SVG, words beside them; `aria-hidden` because every control name carries the words. */
export function PassageLegend({ layout, vm }: { layout: PassageLayout; vm: PassageVM }) {
  const hasClosed = vm.islands.some((i) => i.state === "not_covered") || vm.marginal.some((m) => m.checkpoints.length);
  const hasFog = vm.islands.some((i) => i.state === "unresolved");
  return (
    <div className="passage-legend" aria-hidden="true">
      <span className="lg"><span className="lg-mark tone-plan"><Glyph id="share" size={12} /></span>{PASSAGE.legendCheckpoint} · {CHECKPOINT_TERM.CO}</span>
      <span className="lg"><span className="lg-mark tone-patient"><Glyph id="youpay" size={12} /></span>{CHECKPOINT_TERM.total}</span>
      <span className="lg"><span className="lg-mark tone-passed"><Glyph id="passed" size={12} /></span>{PASSAGE.legendPassed}</span>
      {hasClosed && <span className="lg"><span className="lg-mark tone-closed"><Glyph id="closed" size={12} /></span>{PASSAGE.legendClosed}</span>}
      {hasFog && <span className="lg"><span className="lg-mark tone-fog"><Glyph id="fog" size={12} /></span>{PASSAGE.legendFog}</span>}
      {vm.visited.length > 0 && <span className="lg"><span className="lg-mark tone-visited"><Glyph id="visited" size={12} /></span>{PASSAGE.legendVisited}</span>}
      {vm.marginal.length > 0 && <span className="lg"><span className="lg-mark tone-marginal" />{PASSAGE.legendMarginal}</span>}
      {(vm.islands.some((i) => i.youPay != null) || vm.destination.youPay != null) && <span className="lg lg-note">{PASSAGE.legendAmounts}</span>}
      {layout.dense && <span className="lg lg-note">{PASSAGE.denseNote}</span>}
      {layout.collapsed && <span className="lg lg-note">{PASSAGE.collapsedNote}</span>}
    </div>
  );
}

export type { InsuranceCheckpointVM };
export default PassageControls;
