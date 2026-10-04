import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { TextAnimate } from "@/components/magicui/text-animate";
import { RuleGlyph } from "@/components/pipeline/RuleGlyph";
import { Sheet } from "@/components/Primitives/Sheet";
import { Button } from "@/components/ui/button";
import { DRAWER } from "@/lib/copy/drawer";
import { calcInputs, checkpointAriaName, drawerPlanRef, remainingBeforeLine, rememberStitchAnchor, ruleFor, sectionForRule, type DrawerSectionKey } from "@/lib/drawer";
import { transitions } from "@/lib/motion";
import { stepContextFor, stitchesForLine, stitchForCite } from "@/lib/stitches";
import { buildTrail } from "@/lib/trail";
import type { AssistScope, Benefits, CoverageRule, InsuranceCheckpointVM, IslandVM, LedgerLine, PassageVM, PlanFixture, Progress, SavedEstimate, Stitch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AskSection } from "./sections/AskSection";
import { AllowanceSection } from "./sections/AllowanceSection";
import { AlternateBenefitSection } from "./sections/AlternateBenefitSection";
import { AnnualMaximumSection } from "./sections/AnnualMaximumSection";
import { CalculationSection } from "./sections/CalculationSection";
import { ClauseEvidenceSection } from "./sections/ClauseEvidenceSection";
import { CoverageShareSection } from "./sections/CoverageShareSection";
import { DeductibleSection } from "./sections/DeductibleSection";
import { ExclusionsSection } from "./sections/ExclusionsSection";
import { FinalCostSection } from "./sections/FinalCostSection";
import { FrequencySection } from "./sections/FrequencySection";
import { HarborSections } from "./sections/HarborSections";
import { MarginalSection } from "./sections/MarginalSection";
import { ProcedureSection } from "./sections/ProcedureSection";
import { StartSections } from "./sections/StartSections";
import { VisitedSection } from "./sections/VisitedSection";
import { WaitingSection } from "./sections/WaitingSection";
import { Figure, type SectionProps } from "./sections/shared";

/**
 * ProcedureDrawer (spec §4.4, §5.5 `drawer-rise`; component plan N3-A / N4 / N9). The shell that renders the drawer sections in the fixed
 * order (Procedure … Clause evidence, then `AskSection`), the sticky header (crumbs `Island {order} of {n} · {place}` + 44 × 44 close
 * "Close details"), the serif title (Magic UI TextAnimate by word, ≤ 500 ms, opacity only; `initial={false}` under reduced motion), the
 * checkpoint strip (SVG glyph chips in trail order; the selected one wears the terracotta ring; pressing one scrolls to its section and
 * focuses the heading), and focus management (title on open, section heading when opened from a checkpoint, `returnFocus` on close,
 * Escape closes the drawer unless a ClauseCard is open above it).
 * Desktop: a `role="region" aria-label="Procedure details"` column that enters from the right (24 px + fade, 240 ms) while a 1 px gold cast
 * line is drawn from the island button to the drawer edge and fades (omitted under reduced motion). Phone: the foundation `Sheet` (vaul over
 * Radix Dialog: focus trap, Escape, handle drag, focus return to the island button) with the Kokonut smooth-drawer stagger
 * (staggerChildren 0.07, delayChildren 0.2, children y 8 → 0 + opacity; static under reduced motion) in the order title → Final cost →
 * pipeline → evidence; sections 5–8 are collapsed by default on the phone and You pay sits above the fold.
 * START and Harbor Light use the same shell with their own section lists (spec §3.4); visited and marginal islands likewise.
 */
export interface ProcedureDrawerProps {
  island: IslandVM;
  vm: PassageVM;
  plan: PlanFixture;
  rules: CoverageRule[];
  benefits: Benefits | null;
  estimate: SavedEstimate | null;
  stitches: Stitch[];
  selectedCheckpoint?: string;
  onSelectStitch: (s: Stitch) => void;
  onOpenDocuments: () => void;
  onClose: () => void;
  mobile: boolean;
  /** The island button that opened the drawer; focus returns to it on close. */
  returnFocus?: HTMLElement | null;
  /** Additive (optional): called after the drawer records a figure (allowed amount, benefit statement) so the host re-estimates. */
  onRecordsChanged?: () => void;
  /** Additive (optional): false when the drawer was opened from the keyboard; the gold cast line then stays off (opacity-only entrance). */
  castLine?: boolean;
  /** Additive (optional): the journey's stage progress; the Harbor Light lists each care stage after the route with its checkpoints completed. */
  stageProgress?: Progress["stages"];
  /** Additive (optional): the selected plan reference ("ML26" or "upload:<id>") for API calls; preferred over the model's plan_code. */
  planRef?: string;
}

const SHEET_STAGGER = {
  list: { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } } },
  item: { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: transitions.drawerRise } },
};

export function ProcedureDrawer(props: ProcedureDrawerProps) {
  const { island, vm, plan, rules, benefits, estimate, stitches, selectedCheckpoint, onSelectStitch, onOpenDocuments, onClose, mobile, returnFocus, onRecordsChanged, castLine = true, stageProgress, planRef: planRefProp } = props;
  const reduce = useReducedMotion();
  const item = island.item;
  // A planned island whose estimate has no ledger lines at all (usage not provided) is in fog: give the sections an unresolved pseudo-line so
  // the Final cost reads "—" + Waiting for information and the pipeline shows the fee and the fog node (spec §3.3). Nothing is invented.
  const line = useMemo<LedgerLine | undefined>(() => island.line ?? (island.kind === "procedure" && island.state === "unresolved"
    ? { label: island.title + (item?.tooth ? ` (tooth ${item.tooth})` : ""), status: "unresolved", steps: [], patient_cents: null, plan_cents: null, plan_is_upper_bound: false, flags: estimate?.ledger.flags ?? [], remaining_after: {}, benefit_year: null, treatment_item_id: item?.id, procedure_key: item?.procedure_key }
    : undefined), [island, item, estimate]);
  const key = line?.procedure_key ?? item?.procedure_key;
  const rule = ruleFor(rules, key);
  const trail = useMemo(() => (line ? buildTrail(line) : undefined), [line]);
  const cps: InsuranceCheckpointVM[] = island.checkpoints ?? [];
  const selectedCp = cps.find((c) => c.key === selectedCheckpoint || c.rule === selectedCheckpoint);
  const arrivedAt: DrawerSectionKey | undefined = selectedCp ? sectionForRule(selectedCp.rule) : undefined;
  const bodyRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  const titleId = `drawer-title-${island.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const close = useCallback(() => {
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    onClose();
  }, [onClose, returnFocus]);

  const goTo = useCallback((k: DrawerSectionKey, focus = true) => {
    const root = bodyRef.current; if (!root) return;
    const sec = root.querySelector<HTMLElement>(`[data-section="${k}"]`);
    if (!sec) return;
    if (sec instanceof HTMLDetailsElement) sec.open = true;
    const h = sec.querySelector<HTMLElement>("h3");
    sec.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    if (focus) h?.focus({ preventScroll: true });
  }, [reduce]);

  // focus on open: the matching section heading when arrived from a checkpoint, else the title
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (arrivedAt) goTo(arrivedAt);
      else if (!mobile) document.getElementById(titleId)?.focus({ preventScroll: true });
    }, mobile ? 80 : 0);
    return () => window.clearTimeout(t);
  }, [island.id, selectedCheckpoint, arrivedAt, goTo, mobile, titleId]);

  const planRef = drawerPlanRef(planRefProp, estimate, plan);
  const sectionProps: SectionProps = { island, line, item, rule, trail, plan, rules, benefits, estimate, stitches, onSelectStitch, onOpenDocuments, mobile, arrivedAt, onRecordsChanged, planRef };
  const scope: AssistScope = {
    plan_ref: planRef, estimate_id: estimate?.id, treatment_item_id: item?.id, line_index: island.lineIndex,
    step_key: selectedCp && selectedCp.rule !== "missing" ? selectedCp.rule : undefined, checkpoint_key: selectedCp?.key,
  };
  const openStitch = (id: string) => { const s = stitches.find((x) => x.id === id || `${x.doc}#p${x.page}` === id); if (s) onSelectStitch(s); };

  const sections = useMemo<ReactNode[]>(() => {
    if (island.kind === "start") return [<StartSections key="start" {...sectionProps} />];
    if (island.kind === "destination") return [<HarborSections key="harbor" {...sectionProps} vm={vm} stageProgress={stageProgress} />];
    if (island.kind === "visited") return [<VisitedSection key="visited" {...sectionProps} />];
    if (island.kind === "marginal") return [<MarginalSection key="marginal" {...sectionProps} />, <ClauseEvidenceSection key="evidence" {...sectionProps} />];
    const core = [
      <ProcedureSection key="procedure" {...sectionProps} />, <AllowanceSection key={`allowance-${item?.id ?? island.id}`} {...sectionProps} />, <DeductibleSection key="deductible" {...sectionProps} />,
      <CoverageShareSection key="share" {...sectionProps} />, <AnnualMaximumSection key="annualMax" {...sectionProps} />, <FrequencySection key="frequency" {...sectionProps} />,
      <WaitingSection key="waiting" {...sectionProps} />, <AlternateBenefitSection key="alternate" {...sectionProps} />, <ExclusionsSection key="exclusions" {...sectionProps} />,
    ];
    const finalCost = <FinalCostSection key="finalCost" {...sectionProps} estimateId={estimate?.id} first={mobile} />;
    const tail = [<CalculationSection key="calculation" {...sectionProps} />, <ClauseEvidenceSection key="evidence" {...sectionProps} />, <AskSection key={`ask-${island.id}`} scope={scope} onOpenStitch={openStitch} />];
    return mobile ? [finalCost, ...core, ...tail] : [...core, finalCost, ...tail];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [island, vm, plan, rules, benefits, estimate, stitches, mobile, arrivedAt, selectedCp?.key, stageProgress, planRef]);

  const crumbs = island.kind === "start" ? DRAWER.crumbsStart(island.place) : island.kind === "destination" ? DRAWER.crumbsLight(island.place)
    : island.kind === "visited" ? DRAWER.crumbsVisited(island.place) : island.kind === "marginal" ? DRAWER.crumbsMarginal(island.place)
    : DRAWER.crumbs(island.order, vm.islands.length, island.place);
  const lineStitches = line ? stitchesForLine(line, stitches, stepContextFor(line, rules)) : [];
  // the plan's figure carries the coverage-share clause (its own class row), not whichever clause the first step cites
  const shareStitch = stitchForCite(rule?.coverage_cite, stitches, plan.source_document.version_label) ?? lineStitches[0];
  const unresolved = island.kind === "procedure" && (island.state === "unresolved" || island.state === "pending");

  const header = (
    <>
      <div className="drawer-bar">
        <p className="crumbs">{crumbs}</p>
        {!mobile && <Button type="button" variant="ghost" size="icon-touch" aria-label={DRAWER.close} className="drawer-close" onClick={close}><X aria-hidden="true" /></Button>}
      </div>
      {!mobile && (
        <div id={titleId} tabIndex={-1} className="drawer-title-wrap">
          <TextAnimate as="h2" by="word" startOnView={false} once duration={0.25} className="drawer-title"
                       initial={reduce ? false : "hidden"} variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }}>
            {island.title}
          </TextAnimate>
        </div>
      )}
      {island.subtitle && <p className="drawer-subtitle">{island.subtitle}</p>}
      {!mobile && island.kind === "procedure" && line && (
        <div className={cn("drawer-lede", unresolved && "drawer-lede-unresolved")}>
          <p className="drawer-lede-row">
            <span className="drawer-lede-term">{DRAWER.youPayLede}</span>{" "}
            <Figure cents={line.patient_cents} evidence="DOC" calc inputs={calcInputs(item, estimate, benefits)} className="drawer-lede-amt" stitches={lineStitches.slice(0, 2)} onSelectStitch={onSelectStitch} />
          </p>
          {!unresolved && (
            <p className="drawer-lede-row drawer-lede-plan">
              <span className="drawer-lede-term-plan">{DRAWER.planPaysRow}</span>{" "}
              <Figure cents={line.plan_cents} evidence="DOC" calc inputs={calcInputs(item, estimate, benefits)} calcLabel={null} className="fig-plan" stitch={shareStitch} onSelectStitch={onSelectStitch} />
            </p>
          )}
        </div>
      )}
      {island.kind === "procedure" && cps.length > 0 && (
        <ol className="cp-strip" aria-label={DRAWER.checkpointStrip}>
          {cps.map((cp) => {
            const sel = selectedCp?.key === cp.key;
            return (
              <li key={cp.key}>
                <button type="button" className={cn("unstyled cp-chip", sel && "is-selected", `cp-chip-${cp.rule}`)} aria-pressed={sel} aria-label={checkpointAriaName(cp)} onClick={() => goTo(sectionForRule(cp.rule))}>
                  <RuleGlyph rule={cp.rule} size={18} /><span className="cp-chip-term">{cp.term}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {island.kind === "procedure" && <RemainingBefore island={island} plan={plan} benefits={benefits} estimate={estimate} />}
    </>
  );

  // remember the pressed stitch chip for the ClauseCard's thread-pull
  const onClickCapture = (e: React.MouseEvent) => { const chip = (e.target as HTMLElement).closest?.(".stitch"); if (chip) rememberStitchAnchor(chip.getBoundingClientRect()); };

  if (mobile) {
    return (
      <Sheet open onOpenChange={(o) => { if (!o) close(); }} title={island.title} returnFocus={returnFocus ?? undefined} className="drawer drawer-sheet">
        <div ref={(el) => { (bodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el; el?.closest('[role="dialog"]')?.setAttribute("aria-modal", "true"); }} className="drawer-body" onClickCapture={onClickCapture}>
          {header}
          <motion.div className="drawer-sections" variants={SHEET_STAGGER.list} initial={reduce ? false : "hidden"} animate="show">
            {sections.map((s, i) => <motion.div key={i} variants={SHEET_STAGGER.item}>{s}</motion.div>)}
          </motion.div>
        </div>
      </Sheet>
    );
  }
  return (
    <motion.aside
      ref={regionRef} role="region" aria-label={DRAWER.region} className="drawer drawer-desktop detail side"
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1, transition: transitions.drawerRise }}
      onKeyDown={(e) => { if (e.key === "Escape" && !document.querySelector('.clause[role="dialog"]')) { e.stopPropagation(); close(); } }}
      onClickCapture={onClickCapture}
    >
      {!reduce && castLine && <CastLine key={island.id} from={returnFocus ?? null} to={regionRef} />}
      <div ref={bodyRef} className="drawer-body">
        {/* switching islands while open crossfades the body only; the column stays put (no second drawer-rise) */}
        <motion.div key={island.id} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={transitions.drawerRise}>
          <div className="drawer-head">{header}</div>
          <div className="drawer-sections">{sections}</div>
        </motion.div>
      </div>
    </motion.aside>
  );
}

/**
 * The header's remaining strip (demo-4, slop-16, layout-24): the deductible and annual maximum left BEFORE this island, an unboxed caption
 * line. The first island starts from the benefit statement (USER); later islands start from the previous line's `remaining_after`, so the
 * crown reads $672.00 after the root canal, not the statement's $1,260.00, and says it is calculated. No separators that can orphan.
 */
function RemainingBefore({ island, plan, benefits, estimate }: { island: IslandVM; plan: PlanFixture; benefits: Benefits | null; estimate: SavedEstimate | null }) {
  const lines = estimate?.ledger.lines ?? [];
  const d = remainingBeforeLine("deductible", island.lineIndex, lines, benefits);
  const m = remainingBeforeLine("max", island.lineIndex, lines, benefits);
  const unlimited = !!plan.annual_max?.unlimited || !!benefits?.annual_max_unlimited;
  const fig = (r: { cents: number | null; calculated: boolean }) => r.calculated
    ? <Figure cents={r.cents} evidence="USER" calc inputs={["USER"]} calcLabel={DRAWER.calculatedShort} waiting={false} />
    : <Figure cents={r.cents} evidence="USER" waiting={false} />;
  return (
    <p className="drawer-remaining">
      <span className="drawer-remaining-k">{DRAWER.beforeIsland}</span>
      <span className="drawer-remaining-item">{DRAWER.deductibleLeft} {fig(d)}</span>
      <span className="drawer-remaining-item">{DRAWER.maximumLeft} {unlimited ? <span className="muted">{DRAWER.noMaxApplies}</span> : fig(m)}</span>
    </p>
  );
}

/** Left edge of an element once every transform on it and its ancestors has settled (the drawer is still translated while it rises). */
function settledLeft(el: HTMLElement): number {
  let x = el.getBoundingClientRect().left;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const t = getComputedStyle(n).transform;
    if (t && t !== "none") { try { x -= new DOMMatrixReadOnly(t).m41; } catch { /* unparsable transform: keep the measured edge */ } }
  }
  return x;
}

/**
 * The gold cast line (spec §5.5 `drawer-rise`): 1 px, from the island button's edge to the drawer's final edge, drawn in 240 ms with the
 * drawer, held, then faded (≈ 700 ms in all) and unmounted. Keyed on the island so a switch re-casts it; scrolling cancels it (the line
 * is fixed-position and would otherwise point at the wrong place). Pointer opens only; never under reduced motion.
 */
function CastLine({ from, to }: { from: HTMLElement | null; to: React.RefObject<HTMLElement | null> }) {
  const [d, setD] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useLayoutEffect(() => {
    if (!from || !to.current || !document.contains(from)) return;
    const a = from.getBoundingClientRect(); const b = to.current.getBoundingClientRect();
    const x2 = settledLeft(to.current);
    const x1 = a.right, y1 = a.top + a.height / 2, y2 = Math.min(Math.max(y1, b.top + 24), b.bottom - 24);
    if (x2 - x1 < 12) return;
    setD(`M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`);
  }, [from, to]);
  useEffect(() => {
    const cancel = () => setDone(true);
    window.addEventListener("scroll", cancel, { passive: true, once: true });
    return () => window.removeEventListener("scroll", cancel);
  }, []);
  if (!d || done) return null;
  return (
    <svg className="cast-line" aria-hidden="true" focusable="false">
      <motion.path d={d} fill="none" stroke="var(--gold)" strokeWidth="1" strokeLinecap="round"
                   initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }}
                   transition={{ pathLength: transitions.drawerRise, opacity: { duration: 0.7, times: [0, 0.5, 1] } }} onAnimationComplete={() => setDone(true)} />
    </svg>
  );
}

export default ProcedureDrawer;
