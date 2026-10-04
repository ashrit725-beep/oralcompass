import { Fragment, Suspense, lazy, useId, useState } from "react";
import { UI } from "@/lib/copy";
import { PLAN } from "@/lib/copy/plan";
import { ledgerEvidence } from "@/lib/compass-model";
import type { ComparisonResponse, GridCell, PlanFixture } from "@/lib/types";
import { useMobile } from "@/hooks/useMobile";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/Money";
import { EvidenceBadge } from "@/components/Primitives";

// rough-notation stays out of the main chunk (component plan §3.2): one evidential underline per clause card.
const Highlighter = lazy(() => import("@/components/magicui/highlighter").then((m) => ({ default: m.Highlighter })));

/** One column of the grid: the plan model the API resolved for that column plus the ref the user picked. */
export interface GridPlan { model: PlanFixture; ref: string }
interface Props { data: ComparisonResponse; plans: Record<string, GridPlan>; /** Plan refs whose column received entered inputs (spec: "Entered for this plan only"). */ enteredFor?: string[] }

/**
 * ComparisonGrid (component plan N12; CLAUDE.md rule 6). shadcn Table, `table-fixed` + `<colgroup>` for equal columns, in a
 * horizontal-only `scroll-fade-x` container: the table takes its natural height and scrolls with the page (no nested vertical scroll box
 * that slices a row; layout-22 / mobile-10 / slop-10); columns in the USER's order, no sort, no winner; the eligibility quote
 * under every column header; the factual-differences sentence under every row. Every cell is a 44 px PopoverTrigger whose card is the
 * paired clause (document label, page, quote with one terracotta Highlighter underline, evidence badge); at phone width the card opens
 * in the Drawer instead. The cell keeps its value printed while the card is open and the card repeats it as plain text (integration: the
 * earlier shared-layoutId hop emptied the cell and left a ghost figure outside the card). Rails: the same estimate per plan, totals through <Money>.
 */
export function ComparisonGrid({ data, plans, enteredFor = [] }: Props) {
  const cols = data.result.columns;
  const titleOf = (c: string) => plans[c]?.model.title ?? c;
  return (
      <section className="compare" aria-labelledby="cmp-h">
        <h3 id="cmp-h">{PLAN.cmpTitle}</h3>
        <Table containerClassName="grid-scroll overflow-x-auto overflow-y-visible overscroll-x-contain scroll-fade-x rounded-xl border border-rule" className="grid table-fixed min-w-[640px] text-[.9rem]">
          <colgroup><col style={{ width: "20%" }} />{cols.map((c) => <col key={c} />)}</colgroup>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="bg-paper-deep align-top whitespace-normal">{PLAN.cmpTopic}</TableHead>
              {cols.map((c) => {
                const p = plans[c]?.model;
                return (
                  <TableHead scope="col" key={c} className="bg-paper-deep align-top whitespace-normal">
                    <div className="plan-h">
                      <strong>{titleOf(c)}</strong>
                      {p?.is_fictional && <span className="ribbon">{UI.fictional}</span>}
                      {p?.source_document.document_type === "uploaded_plan_document" && <span className="ribbon">{PLAN.uploadedRibbon(p.source_document.version_label)}</span>}
                      <small>{p?.catalog?.where_offered?.text ? `${p.catalog.where_offered.text} · ` : ""}{PLAN.cmpEligibility}: {eligibilityOnly(p?.catalog?.eligibility?.text) || PLAN.cmpEligibilitySeeDoc}</small>
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.result.grid.map((row, ri) => (
              <Fragment key={row.topic}>
                <TableRow>
                  <TableHead scope="row" className="align-top whitespace-normal font-medium">{row.topic}</TableHead>
                  {row.cells.map((cell, i) => (
                    <TableCell key={i} className="align-top whitespace-normal p-1">
                      <ClauseCell cell={cell} topic={row.topic} planTitle={titleOf(cols[i])} />
                    </TableCell>
                  ))}
                </TableRow>
                {/* the factual-differences sentence repeats the row's figures for screen readers; visually the row already shows them */}
                <TableRow className="differences"><TableCell colSpan={cols.length + 1} className="p-0"><span className="sr-only">{row.differences}</span></TableCell></TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>

        <h3>{PLAN.cmpLedgers}</h3>
        <div className="rails">
          {cols.map((c) => {
            const L = data.result.ledgers[c];
            const p = plans[c]?.model;
            const premium = p?.premium_monthly?.employee_only ?? p?.premium_monthly?.self_only;
            return (
              <article key={c} className="rail" aria-label={PLAN.cmpLedgerOf(titleOf(c))}>
                <h4>{titleOf(c)}</h4>
                {!L || L.status === "unresolved" ? (
                  <p className="unresolved"><EvidenceBadge status="UNKNOWN" /> {PLAN.cmpUnresolvedFor} {L?.not_provided.join(", ")}</p>
                ) : (
                  <p className="hero">
                    <span className="rail-total"><Money cents={L.patient_total_cents} evidence={ledgerEvidence(L)} className="total" /></span>
                    <span className="sub">{UI.planPays}: <Money cents={L.plan_total_cents} evidence={ledgerEvidence(L)} />{L.plan_total_is_upper_bound ? ` ${PLAN.cmpUpperBound}` : ""}</span>
                  </p>
                )}
                {[...new Set(L?.flags ?? [])].map((f) => <p key={f} className="flag">{f}</p>)}
                <p className="note">{enteredFor.includes(plans[c]?.ref ?? c) ? PLAN.cmpEnteredThisPlan : PLAN.cmpNothingEntered}</p>
                <p className="note">{PLAN.cmpPremium}: {premium?.value != null ? <Money cents={premium.value} evidence={premium.status} /> : <><span>{UI.notStated}</span> <EvidenceBadge status="UNKNOWN" /></>}</p>
              </article>
            );
          })}
        </div>
      </section>
  );
}

/** The catalog's eligibility text ends with the availability banner, which the view prints once above the grid; keep the rest. */
function eligibilityOnly(text?: string | null): string {
  if (!text) return "";
  return text.replace(UI.availabilityBanner, "").replace(/Listed here means the document is public[^.]*\./, "").replace(/\s+/g, " ").trim();
}

/** A grid cell: value + badge as a 44 px trigger; the paired clause opens in a Popover (desktop) or the Drawer (phone). */
function ClauseCell({ cell, topic, planTitle }: { cell: GridCell; topic: string; planTitle: string }) {
  const mobile = useMobile();
  const [open, setOpen] = useState(false);
  const descId = useId();
  const isAmount = cell.text.includes("$");
  const face = (
    <span className="cmp-cell-face">
      <span className={isAmount ? "amt" : "cmp-cell-text"}>{cell.text}</span>
      <EvidenceBadge status={cell.badge} />
      {cell.cite && <small className="cite">{cell.cite}</small>}
    </span>
  );
  const trigger = (
    <Button variant="ghost" size="touch" className="cmp-cell h-auto w-full justify-start px-2 py-1.5 text-left font-normal whitespace-normal" aria-describedby={descId} aria-expanded={open}>
      {face}
      {/* the visible value + badge + cite name the button (SC 2.5.3 label in name); the topic, plan and action are its description.
          `hidden` keeps the sentence out of the name computed from content while aria-describedby still reads it. */}
      <span id={descId} hidden>{PLAN.cmpOpenClause(topic, planTitle)}</span>
    </Button>
  );
  const card = (
    <div className="cmp-card">
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
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} direction="bottom">
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent handleLabel={PLAN.cmpClose}>
          <div className="px-4 pb-6">
            <DrawerTitle>{topic}</DrawerTitle>
            <DrawerDescription>{planTitle}</DrawerDescription>
            {card}
            <DrawerClose asChild><Button variant="outline" size="touch" className="mt-3">{PLAN.cmpClose}</Button></DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader><PopoverTitle>{topic}</PopoverTitle><PopoverDescription>{planTitle}</PopoverDescription></PopoverHeader>
        {card}
      </PopoverContent>
    </Popover>
  );
}
