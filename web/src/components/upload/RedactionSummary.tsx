import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import NumberFlow from "@number-flow/react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { UPLOAD } from "@/lib/copy/upload";
import { useReducedMotion } from "@/lib/motion";
import { applyRedaction, maskValue, type FoundIdentifier, type RedactionResult } from "@/lib/redact";
import { categoryCounts, maskedVisible, pageRanges, previewPages, sortIdentifiers, termOccurrences, tokenize } from "@/lib/redaction-view";
import { CLIENT_REDACTION_LIMITS } from "@/lib/upload";
import { PaneHeading } from "./PaneHeading";

/**
 * RedactionSummary (client redaction design point 2): the review step that runs ON THIS DEVICE before anything is uploaded.
 * - Headline (the pane's h3 and focus target): "12 personal identifiers removed before AI analysis", the count in the display serif with
 *   tabular figures. The count reveals once (NumberFlow 0 → n, 700 ms on --ease-land); reduced motion shows the end state at once
 *   (NumberFlow also honours the preference itself). Singular and zero copy come from UPLOAD.
 * - The count is DISTINCT identifiers (`RedactionResult.total`); every change made here (a "Keep in text" switch, a term) recomputes the
 *   result at once and is announced politely, once, in a status region (never the heading, never on mount).
 * - Category chips, the identifier list (masked values with a Show toggle, "removed in N places", a real switch named per row), the
 *   person's own terms, and the redacted text with each placeholder drawn as a small ink token.
 * - Continue hands the result and the terms to the wizard, which uploads with `client_redaction` (lib/upload.ts buildClientRedaction).
 * Raw values exist only in this component's memory: never in a URL, storage or a log.
 */
export interface RedactionSummaryProps {
  /** The pdf.js text layer, one string per page (lib/upload.ts inspectPdf). */
  pageTexts: string[];
  /** The detector's finds for those pages (lib/redact.ts detectIdentifiers). */
  found: FoundIdentifier[];
  onContinue: (r: { result: RedactionResult; terms: string[] }) => void;
  /** Back to step 1 with another file (before upload only). */
  onChooseAnother?: () => void;
  /** "uploading" while POST /upload runs, "starting" while POST /extract runs. */
  busy?: "uploading" | "starting" | null;
  /** The document is stored with these removals (the upload succeeded): the controls are read-only, Continue only restarts extraction. */
  stored?: boolean;
  error?: string | null;
}

/** The preview's character budget (the whole text is redacted; only this much is drawn). */
export const PREVIEW_BUDGET = 4000;
/** The count reveal: --ease-land (lib/motion.ts EASE.land), long enough to read as a count, short enough not to delay reading. */
const REVEAL = { duration: 700, easing: "cubic-bezier(.16,1,.3,1)" } as const;
const REVEAL_FADE = { duration: 240, easing: "ease-out" } as const;

export function RedactionSummary({ pageTexts, found, onContinue, onChooseAnother, busy = null, stored = false, error = null }: RedactionSummaryProps) {
  const [keep, setKeep] = useState<ReadonlySet<string>>(() => new Set());
  const [terms, setTerms] = useState<string[]>([]);
  const result = useMemo(() => applyRedaction(pageTexts, found, keep, terms), [pageTexts, found, keep, terms]);
  const locked = stored || !!busy;
  const toggleKeep = (id: string) => {
    if (locked) return;
    setKeep((k) => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  // kept = switched to "Keep in text" AND not removed anyway (one of the person's own terms can still remove a kept value)
  const removedIds = useMemo(() => new Set(result.removed.map((f) => f.id)), [result.removed]);
  const isKept = (id: string) => keep.has(id) && !removedIds.has(id);
  const keptCount = found.filter((f) => isKept(f.id)).length;

  const noteId = useId();
  const nothingRemoved = result.total === 0;

  return (
    <div className="up-redaction rs">
      <Headline total={result.total} anyFound={found.length > 0 || result.total > 0} />
      <p className="rs-caption">{nothingRemoved ? UPLOAD.noneFoundBody : UPLOAD.summaryCaption}</p>
      <Chips result={result} />
      {keptCount > 0 && <p className="rs-kept">{UPLOAD.keptCount(keptCount)}</p>}

      {found.length > 0 && <IdentifierList found={found} result={result} isKept={isKept} locked={locked} onToggle={toggleKeep} />}
      <Terms terms={terms} result={result} locked={locked} onChange={setTerms} />
      <RedactedText pages={result.pages} />
      {onChooseAnother && !stored && (
        <Button type="button" variant="outline" size="touch" className="rs-another" aria-disabled={!!busy || undefined} onClick={() => { if (!busy) onChooseAnother(); }}>{UPLOAD.chooseAnother}</Button>
      )}

      {/* the thumb zone: sticky at the bottom of the dialog (the dialog is the scroller), last in reading and tab order */}
      <footer className="rs-footer">
        {error && <p role="alert" className="up-error">{error}</p>}
        <p id={noteId} className="up-caption rs-continue-note">{stored ? UPLOAD.storedNote : UPLOAD.continueNote}</p>
        <div className="rs-footer-row">
          <Button type="button" size="touch" className="rs-continue" aria-disabled={!!busy || undefined} aria-describedby={noteId}
                  onClick={() => { if (!busy) onContinue({ result, terms }); }}>
            {busy === "uploading" ? UPLOAD.phaseUploading : busy === "starting" ? UPLOAD.startingExtraction : UPLOAD.continueUpload}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/** The step heading: the count in the display serif, the whole sentence as the accessible name. Polite announcement on change only. */
function Headline({ total, anyFound }: { total: number; anyFound: boolean }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? total : 0);
  useEffect(() => { setShown(total); }, [total]);
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setAnnounce(UPLOAD.liveCount(total));
  }, [total]);

  return (
    <>
      <PaneHeading className="rs-headline">
        {anyFound ? (
          <>
            <span className="sr-only" data-rs-headline="">{UPLOAD.identifiersRemoved(total)}</span>
            <span className="rs-headline-visual" aria-hidden="true">
              <span className="rs-count" data-count={total}>
                <NumberFlow value={shown} locales="en-US" transformTiming={REVEAL} spinTiming={REVEAL} opacityTiming={REVEAL_FADE} />
              </span>
              <span className="rs-words">{UPLOAD.identifiersRemovedWords(total)}</span>
            </span>
          </>
        ) : (
          <span data-rs-headline="">{UPLOAD.noneFoundTitle}</span>
        )}
      </PaneHeading>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>
    </>
  );
}

function Chips({ result }: { result: RedactionResult }) {
  const counts = categoryCounts(result.byCategory);
  if (!counts.length) return null;
  return (
    <ul className="rs-chips" aria-label={UPLOAD.categoriesLabel}>
      {counts.map(({ category, count }) => {
        const [n, ...words] = UPLOAD.categoryCount(category, count).split(" ");
        return <li key={category} className="rs-chip" data-category={category}><span className="rs-chip-n">{n}</span> {words.join(" ")}</li>;
      })}
    </ul>
  );
}

function IdentifierList({ found, result, isKept, locked, onToggle }: { found: FoundIdentifier[]; result: RedactionResult; isKept: (id: string) => boolean; locked: boolean; onToggle: (id: string) => void }) {
  const rows = useMemo(() => sortIdentifiers(found), [found]);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleReveal = (id: string) => setRevealed((r) => { const n = new Set(r); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // occurrences come from the result (the same numbers the replacement used); a kept row shows the finder's own count
  const removedById = useMemo(() => new Map(result.removed.map((f) => [f.id, f])), [result.removed]);
  return (
    <details className="rs-list">
      <summary className="rs-list-summary">{UPLOAD.listSummary(found.length)}</summary>
      <p className="up-caption rs-list-intro">{UPLOAD.listIntro}</p>
      <ul className="rs-rows">
        {rows.map((f) => (
          <IdentifierRow key={f.id} f={removedById.get(f.id) ?? f} kept={isKept(f.id)} shown={revealed.has(f.id)} locked={locked}
                         onToggleKeep={() => onToggle(f.id)} onToggleShow={() => toggleReveal(f.id)} />
        ))}
      </ul>
    </details>
  );
}

function IdentifierRow({ f, kept, shown, locked, onToggleKeep, onToggleShow }: { f: FoundIdentifier; kept: boolean; shown: boolean; locked: boolean; onToggleKeep: () => void; onToggleShow: () => void }) {
  const id = useId();
  const masked = maskValue(f.category, f.value);
  const name = UPLOAD.categoryName(f.category);
  return (
    <li className="rs-row" data-kept={kept || undefined} data-category={f.category}>
      <div className="rs-row-text">
        <span className="rs-cat" id={`${id}-cat`}>{name}</span>
        <span className="rs-value" id={`${id}-val`} data-shown={shown || undefined}>
          {shown ? f.value : <><span aria-hidden="true">{masked}</span><span className="sr-only">{UPLOAD.maskedSr(maskedVisible(masked))}</span></>}
        </span>
        <span className="rs-where">
          {kept ? UPLOAD.keptIn(f.occurrences) : UPLOAD.removedIn(f.occurrences)}
          {f.pages.length > 0 && <>, {UPLOAD.onPages(pageRanges(f.pages), f.pages.length > 1)}</>}
        </span>
      </div>
      <div className="rs-row-actions">
        <button type="button" className="unstyled rs-show" aria-pressed={shown} aria-label={shown ? UPLOAD.hideValue(f.category) : UPLOAD.showValue(f.category)}
                aria-describedby={`${id}-cat ${id}-val`} onClick={onToggleShow}>
          {shown ? UPLOAD.hide : UPLOAD.show}
        </button>
        <label className="rs-keep" htmlFor={`${id}-keep`} data-locked={locked || undefined}>
          <span id={`${id}-keep-label`}>{UPLOAD.keepInText}</span>
          <SwitchPrimitive.Root id={`${id}-keep`} className="unstyled rs-switch" checked={kept} onCheckedChange={onToggleKeep} disabled={locked}
                                aria-labelledby={`${id}-keep-label ${id}-cat ${id}-val`}>
            <SwitchPrimitive.Thumb className="rs-switch-thumb" />
          </SwitchPrimitive.Root>
        </label>
      </div>
    </li>
  );
}

function Terms({ terms, result, locked, onChange }: { terms: string[]; result: RedactionResult; locked: boolean; onChange: (t: string[]) => void }) {
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const L = CLIENT_REDACTION_LIMITS;

  // a11y-6: the add button stays enabled (aria-disabled while locked) and validates on submit, so it never drops keyboard focus
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const t = term.trim().replace(/\s+/g, " ");
    if (!t) { inputRef.current?.focus(); return; }
    if (t.length < L.valueMin) { setError(UPLOAD.termTooShort); return; }
    if (t.length > L.termMax) { setError(UPLOAD.termTooLong); return; }
    if (terms.some((x) => x.toLowerCase() === t.toLowerCase())) { setError(UPLOAD.termDuplicate); return; }
    if (terms.length >= L.terms) { setError(UPLOAD.termLimit); return; }
    setError(null); setTerm("");
    onChange([...terms, t]);
    inputRef.current?.focus();
  };
  const remove = (t: string) => {
    if (locked) return;
    onChange(terms.filter((x) => x !== t));
    inputRef.current?.focus();
  };

  return (
    <section className="rs-terms">
      <h4 id={`${inputId}-h`} className="up-h4">{UPLOAD.termsTitle}</h4>
      <form className="up-term" onSubmit={add}>
        <label htmlFor={inputId}>{UPLOAD.addTerm}</label>
        <div className="up-term-row">
          <input ref={inputRef} id={inputId} value={term} maxLength={L.termMax} onChange={(e) => { setTerm(e.target.value); if (error) setError(null); }}
                 aria-describedby={error ? `${hintId} ${errorId}` : hintId} aria-invalid={error ? true : undefined} readOnly={locked} className="min-h-11" autoComplete="off" spellCheck={false} />
          <Button type="submit" variant="outline" size="touch" aria-disabled={locked || undefined}>{UPLOAD.addTermButton}</Button>
        </div>
        <p id={hintId} className="up-caption">{UPLOAD.addTermHint}</p>
        {error && <p id={errorId} role="alert" className="up-error">{error}</p>}
      </form>
      {terms.length > 0 && (
        <ul className="rs-term-list">
          {terms.map((t) => {
            const n = termOccurrences(result, t);
            return (
              <li key={t} className="rs-term" data-missing={n === null || undefined}>
                <span className="rs-term-text">{t}</span>
                <span className="rs-where">{n === null ? UPLOAD.termNotFound : UPLOAD.termIn(n)}</span>
                <button type="button" className="unstyled rs-term-remove" aria-label={UPLOAD.termRemove(t)} aria-disabled={locked || undefined} onClick={() => remove(t)}>
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RedactedText({ pages }: { pages: string[] }) {
  const id = useId();
  const view = useMemo(() => previewPages(pages, PREVIEW_BUDGET), [pages]);
  return (
    <section className="rs-text">
      <h4 id={`${id}-h`} className="up-h4">{UPLOAD.previewTitle}</h4>
      {view.pages.length === 0 ? (
        <p className="up-caption">{UPLOAD.previewEmpty}</p>
      ) : (
        <>
          <p className="up-caption">{UPLOAD.previewNote(view.shown, view.total)}</p>
          <pre className="up-pre rs-pre" tabIndex={0} role="region" aria-labelledby={`${id}-h`}>
            {view.pages.map((p) => (
              <span key={p.page} className="rs-page">
                <span className="rs-page-mark">{UPLOAD.previewPage(p.page)}</span>{"\n"}
                {tokenize(p.text).map((s, i) => ("token" in s
                  ? <span key={i} className="rs-token" data-category={s.token}>{s.text}</span>
                  : <span key={i}>{s.text}</span>))}
                {"\n"}
              </span>
            ))}
          </pre>
        </>
      )}
    </section>
  );
}

export default RedactionSummary;
