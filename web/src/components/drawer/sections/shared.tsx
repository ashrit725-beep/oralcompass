import { useId, type ReactNode } from "react";
import { Money } from "@/components/Money";
import { EvidenceBadge, StitchChip } from "@/components/Primitives";
import { DRAWER } from "@/lib/copy/drawer";
import type { DrawerSectionKey } from "@/lib/drawer";
import { money, signed } from "@/lib/stitches";
import type { Benefits, CoverageRule, Evidence, IslandVM, LedgerLine, PlanFixture, SavedEstimate, Stitch, TreatmentItem } from "@/lib/types";
import type { Trail } from "@/lib/trail";
import { cn } from "@/lib/utils";

/**
 * Shared pieces for the drawer sections (spec §4.4): the section frame, the figure (Money + badge + stitch chip), the `<dl>` row and the
 * unresolved mark. Every amount in a section passes through `Figure`/`Money`, so a figure without evidence does not compile; the stitch
 * chip sits beside the badge whenever the clause is known ("every figure badge + stitch").
 */
export interface SectionProps {
  island: IslandVM;
  line?: LedgerLine;
  item?: TreatmentItem;
  rule?: CoverageRule;
  trail?: Trail;
  plan: PlanFixture;
  rules: CoverageRule[];
  benefits: Benefits | null;
  estimate: SavedEstimate | null;
  stitches: Stitch[];
  onSelectStitch: (s: Stitch) => void;
  onOpenDocuments: () => void;
  mobile: boolean;
  /** The checkpoint the drawer was opened from (its section opens and its heading takes focus). */
  arrivedAt?: DrawerSectionKey;
  /** Additive: the Allowance section PATCHes an item and asks the host to re-estimate. */
  onRecordsChanged?: () => void;
}

/** The section frame: `<section aria-labelledby>` + focusable `<h3>` (tabindex -1); collapsible sections render as `<details>` on request. */
export function Section({ k, title, children, collapsible, defaultOpen = true, className, lede }: {
  k: DrawerSectionKey; title: string; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean; className?: string; lede?: ReactNode;
}) {
  const id = useId();
  const hid = `dsec-${k}-${id}`;
  if (collapsible) {
    return (
      <details className={cn("dsec dsec-collapsible", className)} data-section={k} open={defaultOpen} aria-labelledby={hid}>
        <summary className="dsec-summary">
          <h3 id={hid} tabIndex={-1} className="dsec-h">{title}</h3>
          {lede}
          <span className="dsec-toggle" aria-hidden="true" />
        </summary>
        <div className="dsec-body">{children}</div>
      </details>
    );
  }
  return (
    <section className={cn("dsec", className)} data-section={k} aria-labelledby={hid}>
      <h3 id={hid} tabIndex={-1} className="dsec-h">{title}</h3>
      {lede}
      <div className="dsec-body">{children}</div>
    </section>
  );
}

/**
 * A money figure with its badge and, when the clause is known, its stitch chip. Static figures render `money()` as plain tabular text in
 * `.amt` (stable for assistive tech and for the screenshot checks; NumberFlow's rolled digits live in a shadow root) with the badge as a
 * sibling; `roll` switches to `Money`/NumberFlow where the amount re-measures on a new estimate. `null` cents render the em dash plus the
 * waiting words with the UNKNOWN badge, never $0.00.
 */
export function Figure({ cents, evidence, stitch, stitches, onSelectStitch, signed: isSigned, waiting = true, className, hero, roll, calc }: {
  cents: number | null | undefined; evidence: Evidence; stitch?: Stitch | null; stitches?: Stitch[]; onSelectStitch?: (s: Stitch) => void; signed?: boolean; waiting?: boolean; className?: string; hero?: boolean; roll?: boolean;
  /** An engine total (document rules applied to your figures): instead of a single evidence badge it says it was calculated and carries
   *  the stitches of the clauses behind it (orchestrator note 1; no seventh evidence status). Falls back to the badge without stitches. */
  calc?: boolean;
}) {
  const missing = cents == null;
  const chips = (stitches ?? (stitch ? [stitch] : [])).filter(Boolean) as Stitch[];
  const asCalc = !!calc && !missing && chips.length > 0 && !!onSelectStitch;
  const text = missing ? "—" : isSigned ? signed(cents) : money(cents);
  return (
    <span className={cn("fig", hero && "fig-hero", missing && "fig-missing", className)} data-amount={missing ? undefined : text}>
      {roll && !missing ? <Money cents={cents} evidence={evidence} signed={isSigned} /> : (
        <>
          <span className="amt font-sans tabular-nums text-ink">{missing ? <><span aria-hidden="true">{text}</span><span className="sr-only">{DRAWER.noAmount}</span></> : text}</span>
          {asCalc ? <span className="fig-calc">{DRAWER.calculated}</span> : <EvidenceBadge status={missing ? "UNKNOWN" : evidence} />}
        </>
      )}
      {missing && waiting ? <span className="fig-waiting">{DRAWER.waitingInfo}</span> : null}
      {!missing && onSelectStitch ? chips.map((s) => <StitchChip key={s.id} stitch={s} onSelect={onSelectStitch} />) : null}
    </span>
  );
}

/** One `<dt>/<dd>` row of a section's key-value list. */
export function Row({ term, children, note }: { term: string; children: ReactNode; note?: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{children}{note ? <span className="dsec-note">{note}</span> : null}</dd>
    </>
  );
}

/** A non-money fact with its evidence badge and optional stitch chip. */
export function Fact({ children, evidence, stitch, onSelectStitch, className }: { children: ReactNode; evidence?: Evidence; stitch?: Stitch | null; onSelectStitch?: (s: Stitch) => void; className?: string }) {
  return (
    <span className={cn("fact", className)}>
      <span className="fact-text">{children}</span>
      {evidence ? <EvidenceBadge status={evidence} /> : null}
      {stitch && onSelectStitch ? <StitchChip stitch={stitch} onSelect={onSelectStitch} /> : null}
    </span>
  );
}

/** The engine flag paragraph, shown verbatim (its em dashes are engine text). */
export function Flag({ text }: { text: string }) {
  return <p className="flag">{text}</p>;
}

export const docOf = (plan: PlanFixture) => plan.source_document.version_label;
