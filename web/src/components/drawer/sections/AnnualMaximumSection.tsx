import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { stitchForCheckpoint } from "@/lib/drawer";
import { money, stitchForCite } from "@/lib/stitches";
import { docOf, Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * Section 5 · Annual maximum (spec §4.4): plan annual maximum (DOC + stitch, or "Unlimited"), remaining before this procedure (USER + the
 * derivation), consumed by this line (the plan's payment, which counts toward the maximum unless the class is exempt), beyond the maximum
 * (the M step, or "within the remaining maximum"), remaining after (the engine's `remaining_after`), and a compact meter with before/after
 * marks (`role="img"`, dataviz: one hue, thin marks). Collapsed by default on the phone. Omitted when the plan has no annual-maximum field.
 */
export function AnnualMaximumSection({ line, trail, rule, plan, benefits, stitches, onSelectStitch, mobile }: SectionProps) {
  const doc = docOf(plan);
  const mx = plan.annual_max;
  if (!mx) return null;
  const unlimited = !!mx.unlimited || !!benefits?.annual_max_unlimited;
  const planStitch = stitchForCite(mx.cite, stitches, doc);
  const mStep = trail?.steps.find((s) => s.key === "max");
  const mStitch = stitchForCheckpoint("M", mStep?.stitch ?? null, rule, plan, stitches) ?? planStitch;
  const category = rule?.category ?? null;
  const exempt = category ? (plan.annual_max_exempt_classes ?? []).includes(category) : false;
  const before = benefits?.remaining_max_cents ?? null;
  const after = line?.remaining_after?.annual_max_cents ?? null;
  const total = mx.value ?? null;
  const pct = (c: number | null) => (total && c != null ? Math.max(0, Math.min(100, (c / total) * 100)) : null);
  return (
    <Section k="annualMax" title={DRAWER.sAnnualMax} collapsible={mobile} defaultOpen={!mobile}>
      <dl className="dsec-dl">
        <Row term={DRAWER.planAnnualMax}>
          {unlimited ? <Fact evidence={mx.status} stitch={planStitch} onSelectStitch={onSelectStitch}>{DRAWER.unlimited}</Fact>
            : total != null ? <Figure cents={total} evidence={mx.status} stitch={planStitch} onSelectStitch={onSelectStitch} />
            : <Fact evidence={mx.status ?? "UNKNOWN"}><span className="muted">{UI.notStated}</span></Fact>}
        </Row>
        {!unlimited && <Row term={DRAWER.remainingBefore} note={benefits?.derivation?.remaining_max ?? null}><Figure cents={before} evidence="USER" /></Row>}
        {line && line.status === "estimate" && (
          <Row term={DRAWER.consumedByLine} note={exempt ? DRAWER.exemptNote(category ?? "") : DRAWER.consumedNote}>
            <Figure cents={line.plan_cents} evidence="DOC" stitch={mStitch} onSelectStitch={onSelectStitch} className="fig-plan" />
          </Row>
        )}
        {mStep && (
          <Row term={DRAWER.beyondMax} note={mStep.explanation}>
            {mStep.change ? <Figure cents={-mStep.change} evidence="DOC" stitch={mStitch} onSelectStitch={onSelectStitch} className="fig-patient" />
              : <Fact evidence="DOC" stitch={mStitch} onSelectStitch={onSelectStitch}>{DRAWER.withinMax}</Fact>}
          </Row>
        )}
        {line && line.status === "estimate" && (
          <Row term={DRAWER.remainingAfter}>
            {unlimited || (after == null && total == null) ? <Fact evidence={mx.status}>{DRAWER.noMaxApplies}</Fact>
              : <Figure cents={after} evidence="USER" stitch={mStitch} onSelectStitch={onSelectStitch} />}
          </Row>
        )}
      </dl>
      {!unlimited && total != null && before != null && (
        <div className="max-gauge" role="img" aria-label={DRAWER.gaugeLabel(money(before), after == null ? DRAWER.noMaxApplies : money(after))}>
          <span className="max-gauge-track">
            <span className="max-gauge-fill" style={{ width: `${pct(before)}%` }} />
            {after != null && <span className="max-gauge-after" style={{ left: `${pct(after)}%` }} />}
          </span>
          <span className="max-gauge-labels" aria-hidden="true">
            <span>{DRAWER.gaugeBefore} <span className="tabular-nums">{money(before)}</span></span>
            {after != null && <span>{DRAWER.gaugeAfter} <span className="tabular-nums">{money(after)}</span></span>}
          </span>
        </div>
      )}
    </Section>
  );
}

export default AnnualMaximumSection;
