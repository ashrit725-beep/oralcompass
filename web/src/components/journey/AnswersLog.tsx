import { DRAWER } from "@/lib/copy";
import { answersLog, type AnswerTarget } from "@/lib/passage";
import type { JourneyView, PassageVM, PlanFixture, SavedEstimate } from "@/lib/types";

/**
 * The Answers log (spec §2.4): the five answers as one <dl class="log"> in the serif, two rows on desktop and five on phones; a log
 * line, not stat tiles (hairlines only, tabular numbers). Each <dd> is a `linklike` button that moves focus to the thing it names.
 * Row 3 never prints $0.00 for a missing estimate: the unresolved and none branches live in `answersLog` (tested). While a new estimate
 * is being computed row 3 reads "Recalculating…"; the live announcement belongs to JourneyView's single aria-live region.
 * Row 3's figures are engine totals: they carry "We did the math with the plan rules" (row 4 counts the cited steps behind them).
 */
export interface AnswersLogProps { vm: PassageVM; view: JourneyView | null; plan: PlanFixture | null; estimate: SavedEstimate | null; recalculating?: boolean; onFocus: (target: AnswerTarget) => void }

export function AnswersLog({ vm, view, plan, estimate, recalculating = false, onFocus }: AnswersLogProps) {
  const rows = answersLog(vm, view, plan, estimate, recalculating);
  return (
    <dl className="log">
      {rows.map((r) => (
        <div key={r.key} className={`log-row log-${r.key}`}>
          <dt>{r.dt}</dt>
          <dd>
            <button type="button" className="linklike log-link num" title={r.title ?? r.dd} onClick={() => onFocus(r.target)}>{r.dd}</button>
            {r.calc && <span className="fig-calc log-calc">{DRAWER.calculatedCited}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default AnswersLog;
