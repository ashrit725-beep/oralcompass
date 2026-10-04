import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { DRAWER } from "@/lib/copy";
import { PASSAGE } from "@/lib/copy/passage";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import type { GlyphId } from "@/lib/islands";
import { DUR } from "@/lib/motion";
import { checkpointAria, islandAmountText, moneyText, smoothRoute, type RoutePoint, type RouteSegment } from "@/lib/passage";
import type { InsuranceCheckpointVM, IslandVM, MapSelection, PassageVM, Stitch } from "@/lib/types";
import { STAGE_FOCUS_ATTR } from "./CinematicStage";
import { FogLayer } from "./FogLayer";
import { HarborLight } from "./HarborLight";
import { Glyph, toneOf } from "./InsuranceCheckpoint";
import { ProcedureIsland } from "./ProcedureIsland";
import { RouteLine } from "./RouteLine";
import { Soundings } from "./Soundings";
import { StartHarbor } from "./StartHarbor";

/** Layout effects measure the page; on the server (static render in tests) they become plain effects. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * PassageVertical (spec §4.3, owner direction: the cinematic full-bleed map): the phone Passage painted down the coast of the
 * CinematicStage plate. The START pier with its boat, each procedure island as a painted plate (island-major / island-generic, fog over
 * unresolved islands, pennants for notices, the terracotta ring when selected), its checkpoints as markers on the inked route with
 * their term, signed amount and evidence, the soundings after each leg, and the Harbor Light; the route is one dashed ink line through
 * them (a closed channel leaves a not-covered island dotted), drawn once per session per `drawKey` (lib/drawRegistry).
 * The route is measured from the HTML it connects: every waypoint is a `[data-wp]` element (the pier tip, each island's landing and
 * departure shores, each checkpoint marker, the Light's shore), so wrapping text at 320–480 px never detaches the line from its stops.
 * Every control is a real <button> in reading order with a full-fact accessible name (the paint is aria-hidden); the selected island,
 * pier or Light carries `data-stage-focus` so the stage camera dollies it above the bottom sheet.
 */
export type SelectIsland = (islandId: string, checkpointKey: string | undefined, el: HTMLElement | null, viaKeyboard: boolean) => void;
export interface PassageVerticalProps { vm: PassageVM; selected: MapSelection | null; onSelect: SelectIsland; planCode: string; onSelectStitch?: (s: Stitch) => void; drawKey?: string }

/** The island button's accessible name: title · subtitle · amount (calculated) · place · checkpoints · notices. */
export function islandAria(isl: IslandVM): string {
  const calc = (isl.kind === "procedure" || isl.kind === "destination") && isl.youPay != null;
  const parts = [isl.title, isl.subtitle, calc ? `${islandAmountText(isl)} (${PASSAGE.calculatedAria})` : islandAmountText(isl), isl.place];
  if (isl.checkpoints.length) parts.push(PASSAGE.checkpointsCount(isl.checkpoints.length));
  if (isl.notices.length) parts.push(PASSAGE.notices(isl.notices.length));
  return parts.filter(Boolean).join(" · ");
}

const isPass = (cp: InsuranceCheckpointVM) => cp.change === 0 && cp.stepIndexes.length === 0 && cp.rule !== "fee" && cp.rule !== "total";

/** The painted island plate in its own 300 × 233 box (the plate's aspect); the ring, pennants and fog come from ProcedureIsland/FogLayer. */
const PLATE = { w: 300, h: 233 };
function IslandPlate({ isl, selected }: { isl: IslandVM; selected: boolean }) {
  const major = isl.category === "major" || isl.category === "major_excluded";
  const scale = major ? 3.4 : 3;
  const r = PLATE.w / scale;
  const layout = {
    id: isl.id, cx: PLATE.w / 2, cy: PLATE.h / 2, r, compound: false, badge: { x: 0, y: 0 },
    plate: { x: 0, y: 0, w: PLATE.w, h: PLATE.h, slot: major ? "island-major" : "island-generic", scale },
  };
  return (
    <svg className="pv-plate-svg" viewBox={`0 0 ${PLATE.w} ${PLATE.h}`} aria-hidden="true" focusable="false" overflow="visible">
      <ProcedureIsland island={isl} layout={layout} selected={selected} dim={false} pointer drawDelay={0} instant />
      <FogLayer cx={PLATE.w / 2} cy={PLATE.h / 2} r={r * 0.95} show={isl.state === "unresolved"} />
    </svg>
  );
}

function CheckpointRow({ cp, islandId, closed, selected, onSelect, onSelectStitch }: { cp: InsuranceCheckpointVM; islandId: string; closed: boolean; selected: boolean; onSelect: SelectIsland; onSelectStitch?: (s: Stitch) => void }) {
  const pass = isPass(cp);
  const tone = toneOf(cp, pass);
  const amount = cp.rule === "fee" || cp.rule === "total" ? <Money cents={cp.amountOut} evidence={cp.badge} badge={false} />
    : cp.rule === "X" || cp.rule === "W" || cp.rule === "F" ? <Money cents={cp.amountOut} evidence={cp.badge} badge={false} />
    : cp.rule === "missing" ? <span className="pv-wait">{PASSAGE.waitingLower}</span>
    : cp.split ? <span className="pv-split"><span>{PASSAGE.plan} <Money cents={cp.split.plan} evidence={cp.badge} badge={false} /></span><span>{PASSAGE.you} <Money cents={cp.split.patient} evidence={cp.badge} badge={false} /></span></span>
    : cp.change === 0 ? <span className="pv-nochange">{PASSAGE.noChange}</span> : <Money cents={cp.change} evidence={cp.badge} badge={false} signed />;
  return (
    <li className="pv-cp-item">
      <button type="button" className={`unstyled pv-cp tone-${tone} ${pass ? "is-passed" : ""} ${selected ? "is-selected" : ""}`} aria-pressed={selected} aria-label={checkpointAria(cp)} onClick={(e) => onSelect(islandId, cp.key, e.currentTarget, e.detail === 0)}>
        <span className="cp-visual" data-wp={`${islandId}:${cp.key}`} data-wp-closed={closed ? "" : undefined}><Glyph id={(pass ? "passed" : cp.glyph) as GlyphId} size={14} /></span>
        <span className="pv-term">{cp.term}{cp.owner === "nobody" && cp.change ? <small className="pv-owner"><span className="pv-owner-sep" aria-hidden="true"> · </span>{PASSAGE.notOwedByYou}</small> : null}</span>
        <span className={`pv-amt ${cp.change != null && cp.change < 0 && cp.owner === "patient" ? "is-yours" : ""}`}>{amount}</span>
      </button>
      {(cp.stitch || cp.badge) && (
        <span className="pv-evidence">{cp.stitch && onSelectStitch ? <StitchChip stitch={cp.stitch} onSelect={onSelectStitch} />
          : cp.rule === "total" && cp.amountOut != null ? <span className="fig-calc">{DRAWER.calculatedCited}</span>   /* an engine total, not a quote from the document */
          : <EvidenceBadge status={cp.badge} />}</span>
      )}
    </li>
  );
}

/** Waypoints in document order, in the wrap's own coordinates (offsets: immune to the stage camera's transform). */
function readWaypoints(wrap: HTMLElement): RoutePoint[] {
  const out: RoutePoint[] = [];
  wrap.querySelectorAll<HTMLElement>("[data-wp]").forEach((el) => {
    let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
    let node: HTMLElement | null = el;
    while (node && node !== wrap) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
    if (node !== wrap) return;
    out.push({ id: el.dataset.wp!, x, y, closed: el.dataset.wpClosed != null });
  });
  return out;
}

export function PassageVertical({ vm, selected, onSelect, planCode, onSelectStitch, drawKey = "passage" }: PassageVerticalProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [route, setRoute] = useState<{ w: number; h: number; segments: RouteSegment[] } | null>(null);
  const [drawnAtMount] = useState(() => hasDrawn(drawKey));
  const [snapKey, setSnapKey] = useState<string | null>(drawnAtMount ? drawKey : null);
  // a selection made while the pen is moving finishes the drawing at once
  useEffect(() => { if (selected && snapKey !== drawKey) setSnapKey(drawKey); }, [selected, drawKey, snapKey]);
  useEffect(() => { if (route) markDrawn(drawKey); }, [route, drawKey]);
  const instant = snapKey === drawKey;

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !wrap.offsetWidth) return;
    const pts = readWaypoints(wrap);
    const segments = smoothRoute(pts);
    setRoute((prev) => {
      const next = { w: wrap.offsetWidth, h: wrap.offsetHeight, segments };
      if (prev && prev.w === next.w && prev.h === next.h && prev.segments.length === segments.length && prev.segments.every((s, i) => s.d === segments[i].d && s.closed === segments[i].closed)) return prev;
      return next;
    });
  }, []);
  useIsoLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    document.fonts?.ready.then(() => measure()).catch(() => undefined);
    return () => ro.disconnect();
  }, [measure, vm]);

  // the pen crosses the whole coast in about 1.6 s (the establishing shot), however many legs the route has
  const n = route?.segments.length ?? 1;
  const step = Math.min(DUR.journey * 0.6, 1.1 / Math.max(1, n));
  const segDelay = (i: number) => 0.2 + i * step;

  const isSel = (id: string) => !!selected && selected.islandId === id && !selected.checkpointKey;
  const focusAttr = (id: string) => (selected && selected.islandId === id ? { [STAGE_FOCUS_ATTR]: "true" } : {});
  const start = vm.start, light = vm.destination;
  const lit = vm.status === "estimate";

  return (
    <div className={`passage-vertical-wrap ${vm.status === "empty" ? "is-empty" : ""}`} id="passage-islands" tabIndex={-1} ref={wrapRef}>
      {route && (
        <svg className="pv-route" width={route.w} height={route.h} viewBox={`0 0 ${route.w} ${route.h}`} aria-hidden="true" focusable="false">
          <RouteLine segments={route.segments} drawKey={drawKey} pending={vm.status !== "estimate"} segmentDelay={segDelay} instant={instant} />
        </svg>
      )}
      <ol className="passage-vertical" aria-label={PASSAGE.mapLabel}>
        <li className="pv-item pv-start">
          <button type="button" className={`unstyled pv-card pv-station pv-frame ${isSel("start") ? "is-selected" : ""}`} aria-pressed={isSel("start")} {...focusAttr("start")}
                  aria-label={PASSAGE.startLabel(planCode || "—", start.subtitle?.split(" · ")[1] ?? PASSAGE.networkNotProvided)} onClick={(e) => onSelect("start", undefined, e.currentTarget, e.detail === 0)}>
            <span className="pv-pier" aria-hidden="true">
              <svg viewBox="-80 -52 160 84" focusable="false"><StartHarbor x={0} y={0} /></svg>
              <span className="pv-anchor pv-anchor-pier" data-wp="start" />
            </span>
            <span className="pv-label">
              <span className="pv-title">{start.title}</span>
              <span className="pv-sub">{planCode} · {start.subtitle?.split(" · ")[1]}</span>
              {start.notices.length > 0 && <span className="ctl-pennant">{start.notices[0]}</span>}
              <span className="pv-place">{start.place}</span>
            </span>
          </button>
          {start.soundingsAfter && <Soundings after={start.soundingsAfter} inline label={PASSAGE.soundingsBefore} className="pv-sounding" />}
        </li>
        {vm.islands.map((isl, i) => {
          const closed = isl.state === "not_covered";
          const side = i % 2 === 0 ? "right" : "left";
          return (
            <li key={isl.id} className={`pv-item pv-island is-${isl.state}`}>
              <button type="button" className={`unstyled pv-card pv-station pv-island-card side-${side} ${isSel(isl.id) ? "is-selected" : ""} ${isl.state === "unresolved" ? "is-fog" : ""} ${closed ? "is-closed" : ""}`}
                      aria-pressed={isSel(isl.id)} aria-label={islandAria(isl)} data-island={isl.id} {...focusAttr(isl.id)} onClick={(e) => onSelect(isl.id, undefined, e.currentTarget, e.detail === 0)}>
                <span className="pv-plate" aria-hidden="true">
                  <IslandPlate isl={isl} selected={isSel(isl.id)} />
                  <span className="pv-anchor pv-anchor-in" data-wp={`${isl.id}:in`} />
                  <span className="pv-anchor pv-anchor-out" data-wp={`${isl.id}:out`} data-wp-closed={closed ? "" : undefined} />
                </span>
                <span className="pv-label">
                  <span className="pv-title">{isl.title}</span>
                  {isl.subtitle && <span className="pv-sub">{isl.subtitle}</span>}
                  <span className={`pv-amt-line ${isl.state}`}>{isl.state === "estimate" ? <>{PASSAGE.youPay} <Money cents={isl.youPay} evidence={isl.checkpoints.find((c) => c.rule === "CO")?.badge ?? "UNKNOWN"} badge={false} calc /></> : closed ? <>{PASSAGE.notCoveredLower} · <Money cents={isl.youPay} evidence="USER" badge={false} calc /></> : islandAmountText(isl)}</span>
                  <span className="pv-place">{isl.place}</span>
                  {isl.notices.length > 0 && <span className="pv-notices">{PASSAGE.notices(isl.notices.length)}</span>}
                </span>
              </button>
              {isl.checkpoints.length > 0 && (
                <ol className="pv-cps" aria-label={PASSAGE.checkpointsOf(isl.title)}>
                  {isl.checkpoints.map((cp) => <CheckpointRow key={cp.key} cp={cp} islandId={isl.id} closed={closed} selected={!!selected && selected.islandId === isl.id && selected.checkpointKey === cp.key} onSelect={onSelect} onSelectStitch={onSelectStitch} />)}
                </ol>
              )}
              {isl.soundingsAfter && <Soundings after={isl.soundingsAfter} inline label={isl.title} className="pv-sounding" />}
            </li>
          );
        })}
        <li className="pv-item pv-light">
          <button type="button" className={`unstyled pv-card pv-station pv-frame ${isSel("destination") ? "is-selected" : ""}`} aria-pressed={isSel("destination")} {...focusAttr("destination")}
                  aria-label={`${PASSAGE.lightLabel(light.youPay != null ? `${PASSAGE.youPay} ${moneyText(light.youPay)}` : PASSAGE.waitingLower)}${light.planPays != null ? ` · ${PASSAGE.plan} ${moneyText(light.planPays)}` : ""}`}
                  onClick={(e) => onSelect("destination", undefined, e.currentTarget, e.detail === 0)}>
            <span className="pv-lighthouse" aria-hidden="true">
              <svg viewBox="-110 -92 220 176" focusable="false" overflow="visible"><HarborLight x={0} y={0} r={62} lit={lit} selected={isSel("destination")} /></svg>
              <span className="pv-anchor pv-anchor-light" data-wp="destination" />
            </span>
            <span className="pv-label">
              <span className="pv-title">{light.title}</span>
              <span className={`pv-amt-line ${light.youPay != null ? "estimate" : "unresolved"}`}>{light.youPay != null ? <>{PASSAGE.youPay} <Money cents={light.youPay} evidence="DOC" badge={false} calc /> · {PASSAGE.plan} <Money cents={light.planPays} evidence="DOC" badge={false} calc /></> : PASSAGE.waitingLower}</span>
              {light.youPay != null && <span className="fig-calc" aria-hidden="true">{DRAWER.calculatedCited}</span>}
              {light.subtitle && <span className="pv-place">{light.subtitle}</span>}
            </span>
          </button>
        </li>
      </ol>
      {vm.status === "empty" && <p className="pv-empty-note">{PASSAGE.noPlannedBody}</p>}
    </div>
  );
}

/** Below the stage (native list sections): the islets completed on the benefit statement, the islands mentioned at the consultation, the legend. */
export function PassageSides({ vm, selected, onSelect }: Pick<PassageVerticalProps, "vm" | "selected" | "onSelect">) {
  const isSel = (id: string) => !!selected && selected.islandId === id && !selected.checkpointKey;
  return (
    <>
      {vm.visited.length > 0 && (
        <section className="pv-side" aria-labelledby="pv-visited-h">
          <h3 id="pv-visited-h" className="pv-side-h">{PASSAGE.visitedTable}</h3>
          <p className="pv-side-note">{PASSAGE.visitedFigures} <EvidenceBadge status="USER" /></p>
          <ul className="pv-side-list">
            {vm.visited.map((v) => (
              <li key={v.id}><button type="button" className={`unstyled pv-mini ${isSel(v.id) ? "is-selected" : ""}`} aria-pressed={isSel(v.id)} data-island={v.id} aria-label={`${v.title}${v.subtitle ? ` · ${v.subtitle}` : ""} · ${PASSAGE.legendVisited} · ${islandAmountText(v)}`} onClick={(e) => onSelect(v.id, undefined, e.currentTarget, e.detail === 0)}>
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
              <li key={m.id}><button type="button" className={`unstyled pv-mini pv-marginal ${isSel(m.id) ? "is-selected" : ""}`} aria-pressed={isSel(m.id)} data-island={m.id} aria-label={`${m.title} · ${PASSAGE.legendMarginal} · ${islandAmountText(m)} · ${m.place}`} onClick={(e) => onSelect(m.id, undefined, e.currentTarget, e.detail === 0)}>
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
    </>
  );
}

export default PassageVertical;
