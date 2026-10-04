import { useEffect, useId, useRef, useState } from "react";
import { Money } from "@/components/Money";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { UPLOAD } from "@/lib/copy/upload";
import type { ExtractedField, ReviewDecision } from "@/lib/types";
import { decisionCandidate, decisionConfirm, decisionEdit, decisionNotInDocument, formatProposed, parseValueInput } from "@/lib/upload";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { QuotePage } from "./QuotePage";

/**
 * ReviewRow (spec §7.3 step 4): one extracted field. Columns: Field · Proposed value (cents through <Money>, other units as words) ·
 * Confidence (word + glyph + badge) · Quote (sentence, page, verification state, "Open page") · Your decision (three 44 px buttons with
 * `aria-pressed` for the recorded decision; candidates as radios; Edit opens the inline value + required Source form). Nothing is
 * pre-checked: a value enters the plan version only after a decision the user makes here. No animation.
 */
export interface ReviewRowProps {
  docId: string;
  field: ExtractedField;
  classNames: string[];
  busy: boolean;
  error: string | null;
  onDecide: (d: ReviewDecision) => void;
}

function Value({ unit, value, evidence }: { unit: ExtractedField["unit"]; value: unknown; evidence: ExtractedField["evidence_status"] }) {
  const p = formatProposed(unit, value);
  if (p.kind === "money") return <Money cents={p.cents} evidence={evidence} />;
  if (p.kind === "none") return <span className="up-none">{UPLOAD.valueNone}</span>;
  return <span className="up-value">{p.text}</span>;
}

export function ReviewRow({ docId, field: f, classNames, busy, error, onDecide }: ReviewRowProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [source, setSource] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // a11y-30: the error belongs to one field (aria-invalid + aria-describedby on that field); Edit moves focus into the form, Cancel and a
  // successful entry return it to the Edit button
  const [errorField, setErrorField] = useState<"value" | "source" | null>(null);
  const decideRef = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const [pageOpen, setPageOpen] = useState(false);
  const ids = { value: useId(), source: useId(), cands: useId(), err: useId() };
  const kind = f.decision?.kind;
  const canConfirm = (f.confidence === "confirmed" || f.confidence === "likely") && f.proposed_value !== null && f.proposed_value !== undefined;
  const shownValue = kind === "edited" ? f.decision?.value : f.proposed_value;
  const isClass = f.field_path.startsWith("class_of.");

  const fail = (field: "value" | "source", msg: string) => { setFormError(msg); setErrorField(field); document.getElementById(field === "value" ? ids.value : ids.source)?.focus(); };
  const focusEdit = () => decideRef.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
  const closeEdit = () => { setEditing(false); setFormError(null); setErrorField(null); };
  useEffect(() => {
    if (editing) { opened.current = true; document.getElementById(ids.value)?.focus(); }
    else if (opened.current) { opened.current = false; focusEdit(); }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const submitEdit = () => {
    const parsed = parseValueInput(f.unit, raw);
    if (!parsed.ok) { fail("value", UPLOAD.invalidValue); return; }
    if (!source.trim()) { fail("source", UPLOAD.sourceRequired); return; }
    if (isClass && classNames.length && !classNames.includes(String(parsed.value))) { fail("value", UPLOAD.unknownClass); return; }
    closeEdit();
    onDecide(decisionEdit(f, parsed.value, source.trim()));
  };
  const invalid = (field: "value" | "source") => (formError && errorField === field ? { "aria-invalid": true as const, "aria-describedby": ids.err } : {});

  const valueInput = (() => {
    const common = { id: ids.value, className: "min-h-11", disabled: busy, ...invalid("value") };
    switch (f.unit) {
      case "cents": return <input {...common} inputMode="decimal" placeholder="0.00" value={raw} onChange={(e) => setRaw(e.target.value)} />;
      case "bp": return <input {...common} inputMode="decimal" min={0} max={100} placeholder="0" value={raw} onChange={(e) => setRaw(e.target.value)} />;
      case "months": return <input {...common} inputMode="numeric" min={0} value={raw} onChange={(e) => setRaw(e.target.value)} />;
      case "month_index": return (
        <select {...common} value={raw} onChange={(e) => setRaw(e.target.value)}>
          <option value="">{UPLOAD.valueMonth}</option>
          {UPLOAD.monthNames.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      );
      case "bool": return (
        <select {...common} value={raw} onChange={(e) => setRaw(e.target.value)}>
          <option value="">{UPLOAD.newValue}</option><option value="yes">{UPLOAD.valueBool.yes}</option><option value="no">{UPLOAD.valueBool.no}</option>
        </select>
      );
      case "text":
        if (isClass && classNames.length) return (
          <select {...common} value={raw} onChange={(e) => setRaw(e.target.value)}>
            <option value="">{UPLOAD.valueClass}</option>
            {classNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        );
        return <input {...common} value={raw} onChange={(e) => setRaw(e.target.value)} />;
      default: return <textarea {...common} value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} />;
    }
  })();
  const valueLabel = { cents: UPLOAD.valueDollars, bp: UPLOAD.valuePercent, months: UPLOAD.valueMonths, month_index: UPLOAD.valueMonth, bool: UPLOAD.newValue, text: isClass ? UPLOAD.valueClass : UPLOAD.valueText, list: UPLOAD.valueList }[f.unit];

  return (
    <TableRow className="up-row" data-confidence={f.confidence} data-decided={kind ?? undefined} aria-busy={busy || undefined}>
      <TableCell data-label={UPLOAD.colField} className="up-cell whitespace-normal align-top up-cell-field">
        <span className="up-field-label">{f.label}</span>
        {f.required && <span className="up-req">{UPLOAD.required}</span>}
        {kind && <span className="up-decided">{UPLOAD.decided[kind]}</span>}
      </TableCell>
      <TableCell data-label={UPLOAD.colProposed} className="up-cell whitespace-normal align-top up-cell-value">
        <Value unit={f.unit} value={shownValue} evidence={f.evidence_status} />
        {kind === "edited" && f.decision?.source && <span className="up-caption">{UPLOAD.sourceLabel}: {f.decision.source}</span>}
      </TableCell>
      <TableCell data-label={UPLOAD.colConfidence} className="up-cell whitespace-normal align-top">
        <ConfidenceIndicator confidence={f.confidence} evidence={f.evidence_status} reviewStatus={f.review_status} />
      </TableCell>
      <TableCell data-label={UPLOAD.colQuote} className="up-cell whitespace-normal align-top up-cell-quote">
        {f.quote ? (
          <>
            <blockquote className="up-quote">{f.quote}</blockquote>
            <span className="up-caption">
              {f.page !== null && UPLOAD.page(f.page)} · {f.quote_verified ? UPLOAD.quoteVerified : f.review_status === "needs_review" ? UPLOAD.quoteNearby : UPLOAD.confidence.not_found}
              {f.page_note && <> · {UPLOAD.pageNote(f.page_note)}</>}
            </span>
            {f.page !== null && (
              <Button type="button" variant="outline" size="touch" className="up-open-page" aria-expanded={pageOpen} onClick={() => setPageOpen((v) => !v)}>
                {pageOpen ? UPLOAD.closePage : UPLOAD.openPage}
              </Button>
            )}
            {pageOpen && f.page !== null && <QuotePage docId={docId} page={f.page} quote={f.quote} verified={f.quote_verified} />}
          </>
        ) : <span className="up-none">{UPLOAD.noQuote}</span>}
      </TableCell>
      <TableCell data-label={UPLOAD.colDecision} className="up-cell whitespace-normal align-top up-cell-decision">
        <div className="up-decide" role="group" aria-label={`${UPLOAD.colDecision}: ${f.label}`} ref={decideRef}>
          <Button type="button" variant={kind === "confirmed" ? "default" : "outline"} size="touch" aria-pressed={kind === "confirmed"} disabled={!canConfirm} aria-disabled={busy || undefined} onClick={() => { if (!busy) onDecide(decisionConfirm(f)); }}>{UPLOAD.looksRight}</Button>
          <Button type="button" variant={kind === "edited" ? "default" : "outline"} size="touch" aria-pressed={kind === "edited"} aria-expanded={editing} aria-disabled={busy || undefined} onClick={() => { if (!busy) { if (editing) closeEdit(); else setEditing(true); } }}>{UPLOAD.edit}</Button>
          <Button type="button" variant={kind === "not_in_document" ? "default" : "outline"} size="touch" aria-pressed={kind === "not_in_document"} aria-disabled={busy || undefined} onClick={() => { if (!busy) onDecide(decisionNotInDocument(f)); }}>{UPLOAD.notInDocument}</Button>
        </div>
        {f.candidates.length > 0 && (
          <fieldset className="up-candidates" aria-disabled={busy || undefined}>
            <legend className="up-caption">{UPLOAD.candidates}</legend>
            {f.candidates.map((c, i) => {
              const p = formatProposed(f.unit, c.value);
              const text = p.kind === "text" ? p.text : UPLOAD.valueNone;
              return (
                <label key={i} className="up-candidate">
                  <input type="radio" name={ids.cands} className="min-h-11 min-w-11" checked={kind === "candidate" && f.decision?.candidate_index === i} onChange={() => { if (!busy) onDecide(decisionCandidate(f, i)); }} />
                  <span>
                    {p.kind === "money" ? <Money cents={p.cents} evidence="AMBIGUOUS" /> : <span className="up-value">{text}</span>} · {UPLOAD.page(c.page)}
                    <q className="up-candidate-quote">{c.quote}</q>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        {editing && (
          <form className="up-edit" onSubmit={(e) => { e.preventDefault(); submitEdit(); }}>
            <label htmlFor={ids.value}>{valueLabel}</label>
            {valueInput}
            <label htmlFor={ids.source}>{UPLOAD.sourceLabel} <span className="up-req">{UPLOAD.required}</span></label>
            <input id={ids.source} className="min-h-11" value={source} onChange={(e) => setSource(e.target.value)} disabled={busy} placeholder={UPLOAD.sourceHint} {...invalid("source")} />
            {formError && <p id={ids.err} role="alert" className="up-error">{formError}</p>}
            <div className="up-actions">
              <Button type="submit" size="touch" disabled={busy}>{UPLOAD.enterValue}</Button>
              <Button type="button" variant="ghost" size="touch" onClick={closeEdit}>{UPLOAD.cancelEdit}</Button>
            </div>
          </form>
        )}
        {error && <p role="alert" className="up-error">{error}</p>}
      </TableCell>
    </TableRow>
  );
}

export default ReviewRow;
