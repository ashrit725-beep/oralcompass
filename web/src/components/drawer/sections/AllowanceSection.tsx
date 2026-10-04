import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/Primitives";
import { api } from "@/lib/api";
import { UI } from "@/lib/copy";
import { DRAWER } from "@/lib/copy/drawer";
import { itemFeeCents, missingForLine, networkWord } from "@/lib/drawer";
import { stitchForCite } from "@/lib/stitches";
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
  const missing = missingForLine(estimate?.missing_inputs ?? [], line);
  const [dollars, setDollars] = useState(""); const [source, setSource] = useState(""); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  async function record() {
    if (!item) return;
    const cents = Math.round(Number(dollars.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    if (!source.trim()) { setMsg(DRAWER.allowedSourceRequired); return; }
    setBusy(true); setMsg(null);
    try {
      await api.patchItem(item.id, { allowed_cents: cents, allowed_source: source.trim(), allowed_status: "USER" });
      setMsg(DRAWER.allowedRecorded); onRecordsChanged?.(); window.dispatchEvent(new CustomEvent("oralcompass:records-changed"));
    } catch { setMsg(DRAWER.allowedFailed); } finally { setBusy(false); }
  }

  return (
    <Section k="allowance" title={DRAWER.sAllowance}>
      <div className="dsec-pair">
        <p className="dsec-pair-cell"><span className="dsec-k">{DRAWER.dentistFee}</span><Figure cents={itemFeeCents(item)} evidence="USER" /></p>
        <p className="dsec-pair-cell">
          <span className="dsec-k">{DRAWER.allowedAmount}</span>
          <Figure cents={item?.allowed_cents ?? null} evidence={allowedStatus} stitch={allowedStep?.owner === "nobody" ? oon : null} onSelectStitch={onSelectStitch} />
          {item?.allowed_source ? <span className="dsec-note">{item.allowed_source}</span> : rule?.allowed_amount?.note ? <span className="dsec-note">{rule.allowed_amount.note}</span> : null}
        </p>
      </div>
      <dl className="dsec-dl">
        <Row term={DRAWER.network} note={allowedStep ? allowedStep.explanation : null}>
          {networkWord(net) ? <Fact evidence={netStatus} stitch={oon} onSelectStitch={onSelectStitch}>{networkWord(net)}</Fact> : <Fact evidence="UNKNOWN"><span className="muted">{DRAWER.networkNotProvided}</span></Fact>}
        </Row>
      </dl>
      {(!allowedKnown || line?.status === "unresolved") && item && (
        <div className="missing compact" role="group" aria-labelledby={`allowed-missing-${item.id}`}>
          <p id={`allowed-missing-${item.id}`} className="dsec-k"><EvidenceBadge status="UNKNOWN" /> {DRAWER.allowedMissingTitle}</p>
          <ul>{missing.map((m, i) => <li key={i}><strong>{m.input}</strong> <span className="muted">{m.how}</span></li>)}</ul>
          {!allowedKnown && (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); record(); }}>
              <label>{DRAWER.allowedInputLabel}<input inputMode="decimal" value={dollars} onChange={(e) => setDollars(e.target.value)} placeholder="0.00" required /></label>
              <label>{DRAWER.allowedSourceLabel}<input value={source} onChange={(e) => setSource(e.target.value)} required /></label>
              <Button type="submit" size="touch" variant="outline" disabled={busy}>{DRAWER.allowedRecord}</Button>
              {msg && <p className="note" role="status">{msg}</p>}
            </form>
          )}
        </div>
      )}
      <p className="muted small">{UI.allowedNote}</p>
    </Section>
  );
}

export default AllowanceSection;
