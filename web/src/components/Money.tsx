import NumberFlow, { type Format } from "@number-flow/react";
import { BADGE_LABEL, DRAWER } from "@/lib/copy";
import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EvidenceBadge } from "./Primitives";

/**
 * Money (component plan N1): every dollar figure in the UI renders through this wrapper, and `evidence` is REQUIRED by the type —
 * `<Money cents={1} />` does not compile (see __tests__/money.types.test.tsx). The badge is a sibling, never inside the animated node.
 * Digits are tabular ink in the body face; NumberFlow rolls old → new on change (`sounding-roll`) and respects reduced motion itself
 * (`respectMotionPreference`, default true: the value snaps, end state exact). `null` renders "—" (never $0.00 for a missing input;
 * the caller adds the "Waiting for information" words). Colour is never animated.
 */
export interface MoneyProps {
  cents: number | null | undefined;
  /** The evidence status of this figure (CLAUDE.md rule 2). Required. */
  evidence: Evidence;
  className?: string;
  /** Hide the badge visually (e.g. inside a gauge whose legend carries it). The aria-label stays on the wrapper. */
  badge?: boolean;
  /** An engine total (document rules applied to your figures): says "Calculated from the clauses cited" instead of a single evidence
   *  badge (no seventh evidence status; the steps behind it carry their own badges and stitches). Hidden visually with `badge={false}`. */
  calc?: boolean;
  /** Render a signed delta (−$12.00 / +$3.00). */
  signed?: boolean;
  id?: string;
  /** Milliseconds before the roll starts: the pipeline staggers its stages left to right, ~80 ms apart (motionsites technique 7). */
  rollDelay?: number;
}

/** Screen-reader words for a hidden badge: the same plain words the visible badge shows ("From the plan document"), never the code (a11y-23). */
export const evidenceWords = (evidence: Evidence) => `Evidence: ${BADGE_LABEL[evidence] ?? evidence}`;
export const NO_AMOUNT = "no amount";

const FORMAT: Format = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 };
// spec §5.5 `sounding-roll`: 400 ms on --ease-standard (cubic-bezier(.2,.7,.2,1)), not NumberFlow's 900 ms spring default (motion-8).
// NumberFlow still honours prefers-reduced-motion itself (respectMotionPreference defaults to true): the value snaps.
// Re-measure (motionsites technique 7, adapted): 500 ms on the soft-landing ease (--ease-land), inside the spec's 400–600 ms band.
const ROLL = { duration: 500, easing: "cubic-bezier(.16,1,.3,1)" } as const;
const ROLL_FADE = { duration: 240, easing: "ease-out" } as const;

export function Money({ cents, evidence, className, badge = true, calc = false, signed = false, id, rollDelay = 0 }: MoneyProps) {
  const roll = rollDelay ? { ...ROLL, delay: rollDelay } : ROLL;
  const has = typeof cents === "number" && Number.isFinite(cents);
  return (
    <span id={id} className={cn("inline-flex items-baseline gap-1.5 align-baseline", className)}>
      <span className="amt font-sans tabular-nums text-ink" style={{ "--number-flow-mask-height": "0.15em" } as React.CSSProperties}>
        {has ? (
          <NumberFlow value={(signed ? Math.abs(cents) : cents) / 100} locales="en-US" format={FORMAT} transformTiming={roll} spinTiming={roll} opacityTiming={ROLL_FADE} prefix={signed ? (cents < 0 ? "−" : cents > 0 ? "+" : "") : undefined} />
        ) : (
          <><span aria-hidden="true">—</span><span className="sr-only">{NO_AMOUNT}</span></>
        )}
      </span>
      {calc && has ? <span className={badge ? "fig-calc" : "sr-only"}>{DRAWER.calculatedCited}</span>
        : badge ? <EvidenceBadge status={evidence} /> : <span className="sr-only">{evidenceWords(evidence)}</span>}
    </span>
  );
}

export default Money;
