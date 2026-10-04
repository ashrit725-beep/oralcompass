import NumberFlow, { type Format } from "@number-flow/react";
import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BADGE_LABEL } from "@/lib/copy";
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
  /** Render a signed delta (−$12.00 / +$3.00). */
  signed?: boolean;
  id?: string;
}

/** Screen-reader words for a hidden badge: the same plain words the visible badge shows ("From the plan document"), never the code (a11y-23). */
export const evidenceWords = (evidence: Evidence) => `Evidence: ${BADGE_LABEL[evidence] ?? evidence}`;
export const NO_AMOUNT = "no amount";

const FORMAT: Format = { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function Money({ cents, evidence, className, badge = true, signed = false, id }: MoneyProps) {
  const has = typeof cents === "number" && Number.isFinite(cents);
  return (
    <span id={id} className={cn("inline-flex items-baseline gap-1.5 align-baseline", className)}>
      <span className="amt font-sans tabular-nums text-ink" style={{ "--number-flow-mask-height": "0.15em" } as React.CSSProperties}>
        {has ? (
          <NumberFlow value={(signed ? Math.abs(cents) : cents) / 100} locales="en-US" format={FORMAT} prefix={signed ? (cents < 0 ? "−" : cents > 0 ? "+" : "") : undefined} />
        ) : (
          <><span aria-hidden="true">—</span><span className="sr-only">{NO_AMOUNT}</span></>
        )}
      </span>
      {badge ? <EvidenceBadge status={evidence} /> : <span className="sr-only">{evidenceWords(evidence)}</span>}
    </span>
  );
}

export default Money;
