import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/Primitives";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { allowedFigure, itemFeeCents, missingForLine, networkWord, parseAllowedCents } from "@/lib/drawer";
import { stitchForCite, stitchForStep } from "@/lib/stitches";
import type { Evidence } from "@/lib/types";
import { docOf, Fact, Figure, Row, Section, type SectionProps } from "./shared";

/**
 * Section 2 · Allowance (spec §4.4): the dentist's fee (USER) and the allowed amount (badge from the item's allowed status, source line) side by
 * side, then the network word with its status badge and the out-of-network clause stitch, the Allowed checkpoint's explanation and the
 * fee/allowed note. When the allowed amount is unknown this is the fog section: the line's missing inputs plus an inline allowed-amount
 * input (dollars + source) that PATCHes the item and asks the host to re-estimate (`onRecordsChanged`, plus a window event as a fallback).
 */
export function AllowanceSection({ item, line, trail, rule, plan, estimate, stitches, onSelectStitch, onRecordsChanged }: SectionProps) {
  const doc = docOf(plan);
  const allowedKnown = item?.allowed_cents != null;
  const allowedStatus: Evidence = (item?.allowed_status as Evidence) ?? rule?.allowed_amount?.status ?? "UNKNOWN";
  const net = estimate?.inputs.network ?? item?.network ?? null;
  const netStatus: Evidence = estimate?.inputs.network_status ?? (item?.network ? "USER" : "UNKNOWN");
  const oon = stitchForCite(plan.oon_rule?.cite, stitches, doc);
  const allowedStep = trail?.steps.find((s) => s.key === "allowed");
  // the engine may resolve the allowed amount from the plan's own allowance schedule (HB26 Appendix A): show that cited figure (numbers-4)
  const shown = allowedFigure(item, line, allowedStep, allowedStatus);
  const planAllowedStitch = shown.fromPlan && allowedStep?.stitch ? stitchForStep({ label: "", cents: 0, owner: "", rule: "N", stitch: allowedStep.stitch }, stitches) : undefined;
  const resolved = allowedKnown || shown.fromPlan;
  const missing = missingForLine(estimate?.missing_inputs ?? [], line);
  // The drawer keys this section by item (ProcedureDrawer), so a figure typed for one island never carries over to the next (web-correctness-8).
  const [dollars, setDollars] = useState(""); const [source, setSource] = useState(""); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const errId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  async function record() {
    if (!item) return;
    // the strict parser the benefit statement and the reader use: "1,5", "1O0" or "12abc" are refused, not misread (web-correctness-9)
    const cents = parseAllowedCents(dollars);
    if (cents == null) { setInvalid(true); setMsg(null); amountRef.current?.focus(); return; }
    setInvalid(false);
    if (!source.trim()) { setMsg(DRAWER.allowedSourceRequired); return; }
    setBusy(true); setMsg(null);
    try {
      await api.patchItem(item.id, { allowed_cents: cents, allowed_source: source.trim(), allowed_status: "USER" });
      setMsg(DRAWER.allowedRecorded); onRecordsChanged?.(); window.dispatchEvent(new CustomEvent("oralcompass:records-changed"));
      // the form unmounts once the re-estimate knows the amount: move focus to the section heading so it is not dropped on <body> (a11y-10)
      statusRef.current?.closest<HTMLElement>("[data-section]")?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    } catch { setMsg(DRAWER.allowedFailed); } finally { setBusy(false); }
  }

  return (
    <Section k="allowance" title={DRAWER.sAllowance}>
      <div className="dsec-pair">
        <p className="dsec-pair-cell"><span className="dsec-k">{DRAWER.dentistFee}</span><Figure cents={itemFeeCents(item)} evidence="USER" /></p>
        <p className="dsec-pair-cell">
          <span className="dsec-k">{DRAWER.allowedAmount}</span>
          <Figure cents={shown.cents} evidence={shown.evidence} stitch={shown.fromPlan ? planAllowedStitch ?? null : allowedStep?.owner === "nobody" ? oon : null} onSelectStitch={onSelectStitch} />
          {item?.allowed_source ? <span className="dsec-note">{item.allowed_source}</span> : rule?.allowed_amount?.note ? <span className="dsec-note">{rule.allowed_amount.note}</span> : null}
        </p>
      </div>
      <dl className="dsec-dl">
        <Row term={DRAWER.network} note={allowedStep ? allowedStep.explanation : null}>
          {networkWord(net) ? <Fact evidence={netStatus} stitch={oon} onSelectStitch={onSelectStitch}>{networkWord(net)}</Fact> : <Fact evidence="UNKNOWN"><span className="muted">{DRAWER.networkNotProvided}</span></Fact>}
        </Row>
      </dl>
      {(!resolved || line?.status === "unresolved") && item && (
        <div className="missing compact" role="group" aria-labelledby={`allowed-missing-${item.id}`}>
          <p id={`allowed-missing-${item.id}`} className="dsec-k"><EvidenceBadge status="UNKNOWN" /> {DRAWER.allowedMissingTitle}</p>
          <ul>{missing.map((m, i) => <li key={i}><strong>{m.input}</strong> <span className="muted">{m.how}</span></li>)}</ul>
          {!allowedKnown && (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); record(); }}>
              <label>{DRAWER.allowedInputLabel}<input ref={amountRef} inputMode="decimal" value={dollars} onChange={(e) => { setDollars(e.target.value); if (invalid) setInvalid(false); }} placeholder="0.00" required aria-invalid={invalid || undefined} aria-describedby={invalid ? errId : undefined} /></label>
              {invalid && <p id={errId} className="field-error" role="alert">{DRAWER.allowedInvalid}</p>}
              <label>{DRAWER.allowedSourceLabel}<input value={source} onChange={(e) => setSource(e.target.value)} required /></label>
              <Button type="submit" size="touch" variant="outline" disabled={busy}>{DRAWER.allowedRecord}</Button>
            </form>
          )}
        </div>
      )}
      {/* persistent live region outside the form, so "Recorded" survives the form unmounting and is announced */}
      <p ref={statusRef} className="note" role="status" aria-live="polite">{msg}</p>
      <p className="muted small">{UI.allowedNote}</p>
    </Section>
  );
}

export default AllowanceSection;
