import { useEffect, useMemo, useState } from "react";
import { hasDrawn, markDrawn } from "@/lib/drawRegistry";
import { motion } from "motion/react";
import { PASSAGE } from "@/lib/copy/passage";
import { DUR, useReducedMotion } from "@/lib/motion";
import { layoutPassage, type PassageLayout } from "@/lib/passage";
import type { MapSelection, PassageVM } from "@/lib/types";
import { ArtPlate } from "./ArtPlate";
import { FogLayer } from "./FogLayer";
import { HarborLight } from "./HarborLight";
import { CheckpointDefs, CheckpointMarker } from "./InsuranceCheckpoint";
import { OceanLayers } from "./OceanLayers";
import { AtlasDefs, Compass, Grain, Island, Scenery, Vignette } from "./Paper";
import { PassageControls, PassageLegend, type SelectIsland } from "./PassageControls";
import { ProcedureIsland } from "./ProcedureIsland";
import { RouteLine } from "./RouteLine";
import { StartHarbor } from "./StartHarbor";

/**
 * PassageMap (spec §2.2, §4.1, §6): the desktop Passage. Layers, bottom → top: the painted backdrop (`journey-backdrop` plate with the
 * SVG `Scenery` fallback; the SVG compass rose is drawn only in the fallback because the plate paints its own, addendum §C.1), the
 * OceanLayers movement, the route (`chart-draw` on `drawKey`), START, islands with their painted plates, checkpoint markers (appear
 * in trail order with a 60 ms stagger once the route reaches the island), fog over unresolved islands, the Harbor Light, the vignette;
 * then the HTML control layer (PassageControls) and the legend. The SVG is `aria-hidden`; the controls are the accessible surface.
 * `focus-island` runs on pointer selection only: others dim to .72, the selected plate eases to 1.04; keyboard and reduced motion snap.
 * chart-draw runs once per `drawKey` per session (lib/drawRegistry): returning from another tab shows the drawn chart at once, and a
 * selection made while the pen is still moving snaps the whole chart to its end state before the selection plays (delight pass mo-01 A).
 */
export interface PassageMapProps {
  vm: PassageVM; selected: MapSelection | null; onSelect: SelectIsland; planCode: string; drawKey: string; recalculating?: boolean; pointer: boolean; desktop: boolean; mapId?: string;
  onLayout?: (layout: PassageLayout) => void;
}

export function PassageMap({ vm, selected, onSelect, planCode, drawKey, recalculating = false, pointer, desktop, mapId = "passage-map" }: PassageMapProps) {
  const reduceMotion = useReducedMotion();
  const [drawnAtMount] = useState(() => hasDrawn(drawKey));
  const [snapKey, setSnapKey] = useState<string | null>(drawnAtMount ? drawKey : null);
  useEffect(() => { markDrawn(drawKey); }, [drawKey]);
  // an island or checkpoint chosen mid-draw: finish the drawing at once (remounting the scene with every end state on its first frame)
  useEffect(() => { if (selected && snapKey !== drawKey) setSnapKey(drawKey); }, [selected, drawKey, snapKey]);
  const instant = snapKey === drawKey;
  const reduce = reduceMotion || instant;
  const [backdropFallback, setBackdropFallback] = useState(false);
  const layout = useMemo(() => layoutPassage(vm, "desktop", { selected: selected?.islandId ?? null }), [vm, selected?.islandId]);
  // the pen moves leg by leg in route order; spacing shrinks on long routes so the whole chart lands in about 2 s (addendum B1 asks ≤ 1.4 s of pen)
  const segStep = Math.min(DUR.journey * 0.6, 1.4 / Math.max(1, layout.route.length));
  const segDelay = (i: number) => (reduce ? 0 : i * segStep);
  // the route reaches island i after its approach segment: segments are [approach, arc] per island
  const islandDelay = (i: number) => segDelay(i * 2 + 1);
  const lit = vm.status === "estimate";
  const anySelected = !!selected && selected.islandId !== "start" && selected.islandId !== "destination";
  const visitedWake = layout.visited.length ? { x: layout.visited[layout.visited.length - 1].cx + 40, y: layout.visited[layout.visited.length - 1].cy + 20 } : null;

  return (
    <div className="passage-block">
    <div className={`passage ${recalculating ? "is-recalculating" : ""} ${vm.status === "empty" ? "is-empty" : ""}`} id={mapId}>
      <div className="passage-paint">
        <svg className="passage-svg" viewBox={`0 0 ${layout.w} ${layout.h}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
          <AtlasDefs />
          <CheckpointDefs />
          <ArtPlate slot="journey-backdrop" x={0} y={0} w={layout.w} h={layout.h} preserveAspectRatio="xMidYMid slice" onFallback={() => setBackdropFallback(true)} fallback={
            <g>
              <rect width={layout.w} height={layout.h} fill="url(#oc-water)" />
              <Scenery w={layout.w} h={layout.h} horizon={0.3} />
              <rect width={layout.w} height={layout.h} fill="url(#oc-ripples)" opacity="0.5" className={reduce ? "" : "ripples motion-drift"} />
            </g>
          } />
        </svg>
        <OceanLayers desktop={desktop} />
        <svg key={instant ? "drawn" : "drawing"} className="passage-svg passage-svg-scene" viewBox={`0 0 ${layout.w} ${layout.h}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
          {/* visited islets in the wake */}
          {layout.visited.map((v, j) => (
            <g key={v.id} opacity={0.92}>
              <ArtPlate slot="island-generic" x={v.cx - v.r * 1.5 - 8} y={v.cy - v.r * 1.17 + 2} w={v.r * 3} h={v.r * 2.33} preserveAspectRatio="xMidYMid meet" fallback={<Island cx={v.cx - 8} cy={v.cy + 2} r={v.r} muted />} />
              <circle cx={v.cx + v.r * 1.2} cy={v.cy - v.r * 0.6} r={6} fill="var(--visited)" stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 2" />
              {j === 0 && null}
            </g>
          ))}
          <RouteLine segments={layout.route} drawKey={drawKey} pending={vm.status !== "estimate"} segmentDelay={segDelay} instant={instant} />
          <StartHarbor x={layout.start.x} y={layout.start.y} wakeTo={visitedWake} />
          {vm.islands.map((isl, i) => {
            const L = layout.islands[i];
            const sel = selected?.islandId === isl.id;
            return (
              <g key={isl.id}>
                <ProcedureIsland island={isl} layout={L} selected={sel} dim={anySelected && !sel && pointer} pointer={pointer} drawDelay={islandDelay(i)} instant={instant} />
                <motion.g initial={reduce ? false : "hidden"} animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: islandDelay(i) } } }}>
                  {L.checkpoints.map((c) => {
                    const cp = isl.checkpoints.find((x) => x.key === c.key) ?? null;
                    return (
                      <motion.g key={c.key} variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.12 } } }}>
                        <CheckpointMarker cp={cp} x={c.x} y={c.y} r={c.r} passThrough={c.passThrough} selected={!!selected && selected.islandId === isl.id && selected.checkpointKey === c.key} />
                      </motion.g>
                    );
                  })}
                </motion.g>
                <FogLayer cx={L.cx} cy={L.cy} r={L.r} show={isl.state === "unresolved"} />
              </g>
            );
          })}
          {layout.marginal.map((m) => {
            const isl = vm.marginal.find((x) => x.id === m.id)!;
            const major = isl.category === "major" || isl.category === "major_excluded";
            return (
              <g key={m.id} opacity={0.95}>
                <ArtPlate slot={major ? "island-major" : "island-generic"} x={m.cx - m.r * 1.6} y={m.cy - m.r * 1.25} w={m.r * 3.2} h={m.r * 2.5} preserveAspectRatio="xMidYMid meet" fallback={<Island cx={m.cx} cy={m.cy} r={m.r} muted />} />
                <ellipse cx={m.cx} cy={m.cy + 4} rx={m.r * 1.5} ry={m.r * 1.0} fill="none" stroke="var(--paper)" strokeWidth={1.6} strokeDasharray="4 5" opacity={0.9} />
                {isl.checkpoints.length > 0 && <CheckpointMarker cp={isl.checkpoints[0]} x={m.cx + m.r * 1.3} y={m.cy - m.r * 0.9} r={8} />}
              </g>
            );
          })}
          <HarborLight x={layout.destination.x} y={layout.destination.y} r={layout.destinationR} lit={lit} selected={selected?.islandId === "destination"} />
          {backdropFallback && <Compass x={layout.w - 60} y={58} />}
          {backdropFallback && <Grain />}
          <Vignette />
        </svg>
      </div>
      <PassageControls vm={vm} layout={layout} selected={selected} onSelect={onSelect} planCode={planCode} />
      {vm.status === "empty" && <p className="passage-empty-note">{PASSAGE.noPlannedBody}</p>}
    </div>
    <PassageLegend layout={layout} vm={vm} />
    </div>
  );
}

export default PassageMap;
