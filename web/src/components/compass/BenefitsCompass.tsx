import { useMemo, useState } from "react";
import { COMPASS } from "@/lib/copy/compass";
import type { LandmarkId } from "@/lib/copy";
import { compassModel } from "@/lib/compass-model";
import { money, stitchForCite } from "@/lib/stitches";
import type { Benefits, PlanFixture, SavedEstimate, Stitch } from "@/lib/types";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { CoverageMeter } from "./CoverageMeter";
import { Gauge } from "./Gauge";
import { RestrictionsList } from "./RestrictionsList";

/**
 * BenefitsCompass (spec §4.6; addendum B2/B3 grafts). One parchment panel divided by hairlines into four quadrants around the
 * navigator's chest (`benefits-chest.webp`, ≤ 96 px, decorative), titled by the question it answers from fields:
 * "How much of the $1,500.00 maximum remains after the planned work? $162.00". Quadrants: Deductible and Annual maximum (Gauge:
 * bullet-bar meters, no radial dial), Coverage (CoverageMeter per class), Restrictions (RestrictionsList). `compact` renders the
 * one-line strip for a drawer header ("Deductible remaining $0.00 · Annual maximum remaining $1,260.00").
 * Evidence: the limit and the after-planned-work figure wear the clause stitch (DOC); met / remaining wear USER with the server's
 * derivation sentence; anything not stated or not provided is the word plus the UNKNOWN badge, never 0. A visually hidden table
 * repeats every figure for screen readers. Motion: figures roll through <Money>; the fills use a CSS transform transition zeroed under
 * reduced motion; nothing loops. Colour: one sequential hue (`--water`) for all fills; status is never colour alone.
 */
export interface BenefitsCompassProps {
  plan: PlanFixture;
  benefits: Benefits | null;
  estimate: SavedEstimate | null;
  stitches: Stitch[];
  compact?: boolean;
  onOpenLandmark: (id: LandmarkId) => void;
  onSelectStitch: (s: Stitch) => void;
  selectedStitch?: Stitch;
}

export function BenefitsCompass({ plan, benefits, estimate, stitches, compact = false, onOpenLandmark, onSelectStitch, selectedStitch }: BenefitsCompassProps) {
  const vm = useMemo(() => compassModel(plan, benefits, estimate), [plan, benefits, estimate]);
  const doc = plan.source_document.version_label;
  const maxStitch = stitchForCite(vm.annualMax.limitCite, stitches, doc);
  const dedStitch = stitchForCite(vm.deductible.limitCite, stitches, doc);
  const [chestFailed, setChestFailed] = useState(false);
  const dedWord = vm.deductible.remainingCents == null ? COMPASS.notProvided : money(vm.deductible.remainingCents);
  const maxWord = vm.annualMax.unlimited ? COMPASS.unlimited : vm.annualMax.remainingCents == null ? COMPASS.notProvided : money(vm.annualMax.remainingCents);

  if (compact) {
    return (
      <p className="cmp-strip" aria-label={COMPASS.panelLabel(plan.title, dedWord, maxWord)}>
        <span className="cmp-strip-item">{COMPASS.stripDeductible} {vm.deductible.remainingCents == null ? <><span className="cmp-word">{COMPASS.notProvided}</span> <EvidenceBadge status="UNKNOWN" /></> : <Money cents={vm.deductible.remainingCents} evidence="USER" />}</span>
        <span className="cmp-strip-sep" aria-hidden="true">·</span>
        <span className="cmp-strip-item">{COMPASS.stripMax} {vm.annualMax.unlimited ? <><span className="cmp-word">{COMPASS.unlimited}</span> <EvidenceBadge status={vm.annualMax.limitStatus} /></> : vm.annualMax.remainingCents == null ? <><span className="cmp-word">{COMPASS.notProvided}</span> <EvidenceBadge status="UNKNOWN" /></> : <Money cents={vm.annualMax.remainingCents} evidence="USER" />}</span>
      </p>
    );
  }

  const h = vm.headline;
  return (
    <section className="compass" aria-label={COMPASS.panelLabel(plan.title, dedWord, maxWord)}>
      <header className="cmp-head">
        {!chestFailed && <img className="cmp-chest" src="/art/benefits-chest.webp" alt="" width={72} height={72} loading="lazy" decoding="async" onError={() => setChestFailed(true)} />}
        <div className="cmp-head-text">
          <p className="cmp-kicker">{COMPASS.title}</p>
          <h3 className="cmp-q">
            {h.kind === "unlimited" && COMPASS.qUnlimited}
            {h.kind === "unknown" && COMPASS.qUnknownMax}
            {h.kind === "unresolved" && COMPASS.qUnresolved}
            {(h.kind === "after" || h.kind === "remaining" || h.kind === "no_usage") && (
              <>{COMPASS.qBefore} <Money cents={h.limitCents} evidence={vm.annualMax.limitStatus} badge={false} /> {h.kind === "after" ? COMPASS.qAfterPlanned : COMPASS.qRemaining}</>
            )}
          </h3>
          <p className="cmp-a">
            {/* a calculated figure (the document's limit, your statement, the planned work): the limit's clause stitch plus the word
                "calculated", never a lone "From the plan document" badge (orchestrator note 1) */}
            {h.kind === "after" && <><Money cents={h.answerCents} evidence={vm.annualMax.limitStatus} badge={false} className="cmp-a-amt" />{maxStitch && <StitchChip stitch={maxStitch} selected={selectedStitch?.id === maxStitch.id} onSelect={onSelectStitch} />}<small className="calc-note cmp-calc">{COMPASS.afterCalculated}</small></>}
            {h.kind === "remaining" && <Money cents={h.answerCents} evidence="USER" className="cmp-a-amt" />}
            {h.kind === "no_usage" && <><span className="cmp-word">{COMPASS.notProvided}</span> <EvidenceBadge status="UNKNOWN" /></>}
            {h.kind === "unresolved" && <EvidenceBadge status="UNKNOWN" />}
            {h.kind === "unknown" && <EvidenceBadge status={vm.annualMax.limitStatus} />}
            {h.kind === "unlimited" && <EvidenceBadge status={vm.annualMax.limitStatus} />}
          </p>
        </div>
      </header>

      <div className="cmp-grid">
        <div className="cmp-quad cmp-nw">
          <Gauge label={COMPASS.deductible} meter={vm.deductible} stitch={dedStitch} selectedStitch={selectedStitch} onSelectStitch={onSelectStitch} usedWord={COMPASS.met} />
        </div>
        <div className="cmp-quad cmp-ne">
          <Gauge label={COMPASS.annualMax} meter={vm.annualMax} stitch={maxStitch} selectedStitch={selectedStitch} onSelectStitch={onSelectStitch} usedWord={COMPASS.used} />
        </div>
        <div className="cmp-quad cmp-sw">
          <h4 className="cmp-h">{COMPASS.coverage}</h4>
          {vm.coverage.length === 0 ? <p className="cmp-word">{COMPASS.noClasses} <EvidenceBadge status="UNKNOWN" /></p> : (
            <ul className="cmp-classes">
              {vm.coverage.map((c) => <CoverageMeter key={c.name} cls={c} stitch={stitchForCite(c.citeIn, stitches, doc) ?? stitchForCite(c.classCite, stitches, doc)} selectedStitch={selectedStitch} onSelectStitch={onSelectStitch} />)}
            </ul>
          )}
        </div>
        <div className="cmp-quad cmp-se">
          <h4 className="cmp-h">{COMPASS.restrictions}</h4>
          <RestrictionsList restrictions={vm.restrictions} onOpen={onOpenLandmark} />
        </div>
      </div>
      {vm.conflict && <p className="cmp-conflict"><EvidenceBadge status="CONFLICT" /> {vm.conflict.note}</p>}
      <p className="cmp-note">{COMPASS.derivedNote}</p>

      <table className="sr-only">
        <caption>{COMPASS.tableCaption}</caption>
        <thead><tr><th scope="col">{COMPASS.colFigure}</th><th scope="col">{COMPASS.colAmount}</th><th scope="col">{COMPASS.colEvidence}</th></tr></thead>
        <tbody>
          <tr><th scope="row">{COMPASS.deductible} {COMPASS.limit}</th><td>{vm.deductible.limitCents == null ? COMPASS.notStated : money(vm.deductible.limitCents)}</td><td>{vm.deductible.limitStatus}</td></tr>
          <tr><th scope="row">{COMPASS.deductible} {COMPASS.met}</th><td>{vm.deductible.usedCents == null ? COMPASS.notProvided : money(vm.deductible.usedCents)}</td><td>{vm.deductible.usedCents == null ? "UNKNOWN" : "USER"}</td></tr>
          <tr><th scope="row">{COMPASS.deductible} {COMPASS.remaining}</th><td>{vm.deductible.remainingCents == null ? COMPASS.notProvided : money(vm.deductible.remainingCents)}</td><td>{vm.deductible.remainingCents == null ? "UNKNOWN" : "USER"}</td></tr>
          <tr><th scope="row">{COMPASS.annualMax} {COMPASS.limit}</th><td>{vm.annualMax.unlimited ? COMPASS.unlimited : vm.annualMax.limitCents == null ? COMPASS.notStated : money(vm.annualMax.limitCents)}</td><td>{vm.annualMax.limitStatus}</td></tr>
          <tr><th scope="row">{COMPASS.annualMax} {COMPASS.used}</th><td>{vm.annualMax.usedCents == null ? COMPASS.notProvided : money(vm.annualMax.usedCents)}</td><td>{vm.annualMax.usedCents == null ? "UNKNOWN" : "USER"}</td></tr>
          <tr><th scope="row">{COMPASS.annualMax} {COMPASS.remaining}</th><td>{vm.annualMax.remainingCents == null ? COMPASS.notProvided : money(vm.annualMax.remainingCents)}</td><td>{vm.annualMax.remainingCents == null ? "UNKNOWN" : "USER"}</td></tr>
          <tr><th scope="row">{COMPASS.annualMax} {COMPASS.afterPlanned}</th><td>{vm.annualMax.afterCents == null ? (vm.annualMax.afterWaiting ? COMPASS.waiting : COMPASS.notProvided) : money(vm.annualMax.afterCents)}</td><td>{vm.annualMax.afterCents == null ? "UNKNOWN" : vm.annualMax.limitStatus}</td></tr>
          {vm.coverage.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{c.pctIn == null ? COMPASS.shareNotStated : COMPASS.planPays(String(c.pctIn))}</td><td>{c.statusIn}</td></tr>)}
        </tbody>
      </table>
    </section>
  );
}

export default BenefitsCompass;
