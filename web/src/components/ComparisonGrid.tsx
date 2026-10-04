import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { ledgerEvidence } from "@/lib/compass-model";
import { nearestCard, rowDiffers, shortPlanNames } from "@/lib/compare-cards";
import { plainNote } from "@/lib/stitches";
import type { ComparisonResponse, GridCell, PlanFixture } from "@/lib/types";
import { Sheet } from "@/components/Primitives/Sheet";
import { Money } from "@/components/Money";
import { EvidenceBadge } from "@/components/Primitives";

// rough-notation stays out of the main chunk (component plan §3.2): one evidential underline per clause card.
const Highlighter = lazy(() => import("@/components/magicui/highlighter").then((m) => ({ default: m.Highlighter })));

/** One column of the comparison: the plan model the API resolved for that column plus the ref the user picked. */
export interface GridPlan { model: PlanFixture; ref: string }
interface Props {
  data: ComparisonResponse; plans: Record<string, GridPlan>;
  /** Plan refs whose column received entered inputs (spec: "Entered for this plan only"). */ enteredFor?: string[];
  /** Picker labels by column ("Carrier · Option year"); the switcher shortens them. Falls back to the plan title. */ labels?: Record<string, string>;
}
interface OpenClause { cell: GridCell; topic: string; planTitle: string; from: HTMLElement }

const prefersReduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * ComparisonGrid, phone-native (owner direction "its fully a mobile app", part E; CLAUDE.md rule 6). One plan per card in a horizontal
 * scroll-snap track, in the USER's order, no sort, no winner. A sticky segmented switcher names the plans and follows the swipe (tapping a
 * segment moves the track there). The cards share one CSS subgrid, so a topic sits at the same height in every card: swiping sideways
 * keeps the row you were reading in place, which is how the differences stay visible; a row whose printed values differ between the
 * plans carries a "Differs between plans" tag, and the API's factual-differences sentence is read to screen readers in the first card.
 * Each card opens with the same estimate for that plan (totals through <Money>), then the topic rows: every row is one 44 px+ button
 * whose bottom sheet holds the paired clause (document label, page, quote with one terracotta underline, evidence badge).
 */
export function ComparisonGrid({ data, plans, enteredFor = [], labels = {} }: Props) {
  const cols = data.result.columns;
  const rows = data.result.grid;
  const titleOf = (c: string) => plans[c]?.model.title ?? c;
  const names = useMemo(() => shortPlanNames(cols.map((c) => labels[c] ?? titleOf(c))), [cols.join("|"), JSON.stringify(labels)]); // eslint-disable-line react-hooks/exhaustive-deps
  const differs = useMemo(() => rows.map(rowDiffers), [rows]);
  // the premium has its own topic row (with its clause) when the API lists it; the estimate block repeats it only when it does not
  const premiumRow = rows.some((r) => /^premium/i.test(r.topic));
  const uid = useId();
  const cardId = (i: number) => `${uid}-card-${i}`;
  const [active, setActive] = useState(0);
  // the clause stays set while the sheet closes (its title and quote do not vanish mid-exit, and focus returns to the row that opened it)
  const [clause, setClause] = useState<OpenClause | null>(null);
  const [clauseOpen, setClauseOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);

  // the track's scroll position decides the active segment (one setState per change, read once per frame)
  useEffect(() => {
    const el = track.current; if (!el) return;
    let frame = 0;
    const read = () => { frame = 0; const cards = [...el.querySelectorAll<HTMLElement>(":scope > .cmp-card")]; const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0; setActive(nearestCard(el.scrollLeft, cards.map((c) => c.offsetLeft - pad))); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(read); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [cols.length]);
  useEffect(() => { if (active > cols.length - 1) setActive(0); }, [cols.length, active]);

  const go = useCallback((i: number) => {
    const el = track.current; const card = el?.querySelectorAll<HTMLElement>(":scope > .cmp-card")[i]; if (!el || !card) return;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
    setActive(i);
    el.scrollTo({ left: card.offsetLeft - pad, behavior: prefersReduced() ? "auto" : "smooth" });
  }, []);

  return (
    <section className="compare" aria-labelledby="cmp-h">
      <h3 id="cmp-h" className="sr-only">{PLAN.cmpTitle}</h3>
      {cols.length > 1 && (
        <div className="cmp-switch">
          <div className="cmp-seg" role="group" aria-label={PLAN.cmpSwitcher} style={{ "--n": cols.length, "--i": active } as CSSProperties}>
            <span className="cmp-seg-thumb" aria-hidden="true" />
            {cols.map((c, i) => (
              <button key={c} type="button" className="cmp-seg-btn unstyled" aria-controls={cardId(i)} aria-current={i === active ? "true" : undefined}
                      title={labels[c] ?? titleOf(c)} onClick={() => go(i)}>
                {names[i]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={track} className="cmp-track" role="region" aria-label={PLAN.cmpCardsRegion} style={{ "--rows": rows.length + 2 } as CSSProperties}>
        {cols.map((c, ci) => {
          const p = plans[c]?.model;
          const L = data.result.ledgers[c];
          const premium = p?.premium_monthly?.employee_only ?? p?.premium_monthly?.self_only;
          const where = p?.catalog?.where_offered?.text;
          const headId = `${cardId(ci)}-h`;
          return (
            <article key={c} id={cardId(ci)} className="cmp-card" aria-labelledby={headId} data-active={ci === active ? "" : undefined}>
              <header className="cmp-card-head">
                <p className="cmp-card-pos">{PLAN.cmpCardPos(ci + 1, cols.length)}</p>
                <h4 id={headId}>{titleOf(c)}</h4>
                {(p?.is_fictional || p?.source_document.document_type === "uploaded_plan_document") && (
                  <p className="cmp-card-ribbons">
                    {p?.is_fictional && <span className="ribbon">{UI.fictional}</span>}
                    {p?.source_document.document_type === "uploaded_plan_document" && <span className="ribbon">{PLAN.uploadedRibbon(p.source_document.version_label)}</span>}
                  </p>
                )}
                <details className="cmp-elig">
                  <summary>{PLAN.cmpWhoCanEnroll}<ChevronRight aria-hidden="true" className="cmp-elig-chev" /></summary>
                  <p>{where ? `${where} · ` : ""}{PLAN.cmpEligibility}: {eligibilityOnly(p?.catalog?.eligibility?.text) || PLAN.cmpEligibilitySeeDoc}</p>
                </details>
              </header>
              <div className="cmp-est">
                <p className="cmp-est-label">{PLAN.cmpCardEstimate}</p>
                {!L || L.status === "unresolved" ? (
                  <p className="unresolved"><EvidenceBadge status="UNKNOWN" /> {PLAN.cmpUnresolvedFor} {L?.not_provided.join(", ")}</p>
                ) : (
                  <p className="hero">
                    <span className="rail-total"><Money cents={L.patient_total_cents} evidence={ledgerEvidence(L)} className="total" /></span>
                    <span className="sub">{UI.planPays}: <Money cents={L.plan_total_cents} evidence={ledgerEvidence(L)} />{L.plan_total_is_upper_bound ? ` ${PLAN.cmpUpperBound}` : ""}</span>
                  </p>
                )}
                {[...new Set(L?.flags ?? [])].map((f) => <p key={f} className="flag">{plainNote(f)}</p>)}
                <p className="note">{enteredFor.includes(plans[c]?.ref ?? c) ? PLAN.cmpEnteredThisPlan : PLAN.cmpNothingEntered}</p>
                {!premiumRow && <p className="note">{PLAN.cmpPremium}: {premium?.value != null ? <Money cents={premium.value} evidence={premium.status} /> : <><span>{UI.notStated}</span> <EvidenceBadge status="UNKNOWN" /></>}</p>}
              </div>
              {rows.map((row, ri) => (
                <div key={row.topic} className="cmp-row" data-differs={differs[ri] ? "" : undefined}>
                  <ClauseCell cell={row.cells[ci]} topic={row.topic} planTitle={titleOf(c)} differs={differs[ri]}
                              onOpen={(from) => { setClause({ cell: row.cells[ci], topic: row.topic, planTitle: titleOf(c), from }); setClauseOpen(true); }} />
                  {/* the factual-differences sentence repeats every plan's figure for screen readers; once, in the first card */}
                  {ci === 0 && cols.length > 1 && <span className="sr-only">{row.differences}</span>}
                </div>
              ))}
            </article>
          );
        })}
      </div>
      <Sheet open={clauseOpen} onOpenChange={setClauseOpen} title={clause?.topic ?? PLAN.cmpTitle} description={clause?.planTitle}
             closeLabel={PLAN.cmpClose} returnFocus={clause?.from ?? null}>
        {clause && <ClauseCard cell={clause.cell} />}
      </Sheet>
    </section>
  );
}

/** The catalog's eligibility text ends with the availability banner, which the view prints once above the cards; keep the rest. */
function eligibilityOnly(text?: string | null): string {
  if (!text) return "";
  return text.replace(UI.availabilityBanner, "").replace(/Listed here means the document is public[^.]*\./, "").replace(/\s+/g, " ").trim();
}

/** A topic row: the topic, the value + badge + cite, as one full-width trigger for the clause sheet. */
function ClauseCell({ cell, topic, planTitle, differs, onOpen }: { cell: GridCell | undefined; topic: string; planTitle: string; differs: boolean; onOpen: (from: HTMLElement) => void }) {
  const descId = useId();
  if (!cell) return <p className="cmp-cell cmp-cell-empty"><span className="cmp-row-topic">{topic}</span><span><EvidenceBadge status="UNKNOWN" /></span></p>;
  const isAmount = cell.text.includes("$");
  return (
    <button type="button" className="cmp-cell unstyled" aria-describedby={descId} onClick={(e) => onOpen(e.currentTarget)}>
      <span className="cmp-row-top">
        <span className="cmp-row-topic">{topic}</span>
        {differs && <span className="cmp-diff">{PLAN.cmpDiffers}</span>}
      </span>
      <span className="cmp-cell-face">
        <span className={isAmount ? "amt" : "cmp-cell-text"}>{cell.text}</span>
        <EvidenceBadge status={cell.badge} />
        {cell.cite && <small className="cite">{cell.cite}</small>}
      </span>
      <ChevronRight aria-hidden="true" className="cmp-chev" />
      {/* the visible topic, value, badge and cite name the button (SC 2.5.3 label in name); the plan and action are its description.
          `hidden` keeps the sentence out of the name computed from content while aria-describedby still reads it. */}
      <span id={descId} hidden>{PLAN.cmpOpenClause(topic, planTitle)}</span>
    </button>
  );
}

/** The clause behind one row, inside the bottom sheet: the value repeated as plain text, then the quote with its page. */
function ClauseCard({ cell }: { cell: GridCell }) {
  const isAmount = cell.text.includes("$");
  return (
    <div className="cmp-card-clause">
      <p className="cmp-card-figure"><span className={isAmount ? "amt" : undefined}>{cell.text}</span> <EvidenceBadge status={cell.badge} /></p>
      {cell.quote ? (
        <figure className="wording">
          <blockquote><Suspense fallback={<>“{cell.quote}”</>}>“<Highlighter action="underline">{cell.quote}</Highlighter>”</Suspense></blockquote>
          {cell.cite && <figcaption>{cell.cite}</figcaption>}
        </figure>
      ) : (
        <p className="note">{PLAN.cmpNoClause}{cell.cite ? ` (${cell.cite})` : ""}</p>
      )}
    </div>
  );
}
