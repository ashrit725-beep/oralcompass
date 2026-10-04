import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { UI } from "../lib/copy";
import { DRAWER } from "../lib/copy/drawer";
import { takeStitchAnchor } from "../lib/drawer";
import { transitions } from "../lib/motion";
import { money } from "../lib/stitches";
import type { AssistScope, LedgerLine, Step, Stitch } from "../lib/types";
import { AskAboutStep } from "./assistant/AskAboutStep";
import { DepthDial } from "./DepthDial";
import { EvidenceBadge, StitchChip } from "./Primitives";
import { PlainWords } from "./PlainWords";
import { Button } from "./ui/button";

interface Props {
  stitch: Stitch; lines: LedgerLine[]; onClose: () => void; onOpenOnPage: (s: Stitch) => void;
  /** Hook point for the assistant agent (spec §13.2): rendered in the footer, before the "Open in Documents" button. */
  askSlot?: ReactNode;
  /** When given (and no `askSlot`), the footer mounts `AskAboutStep` with this clause scope (spec §8.1 placement 2). */
  askScope?: AssistScope;
  /** The pressed stitch chip's rectangle: the origin of the gold `thread-pull` (spec §5.5). Defaults to the last chip pressed inside a drawer. */
  anchorRect?: DOMRect | null;
  /** Focus returns here on close (defaults to the element focused when the card opened). */
  returnFocus?: HTMLElement | null;
}

/** The engine steps this sentence decides: the step's stitch label names the same DOCUMENT and page, and the step's rule is one the
 *  sentence states (web-correctness-35: a page number alone matched page 25 of a second document too). */
export function stepsAffectedBy(stitch: Pick<Stitch, "doc" | "page" | "ruleCodes">, lines: { label: string; steps: Step[] }[]): { line: string; step: Step }[] {
  const label = `${stitch.doc}#p${stitch.page}`;
  return lines.flatMap((l) => l.steps.filter((s) => s.stitch === label && stitch.ruleCodes.includes(s.rule)).map((s) => ({ line: l.label, step: s })));
}

/**
 * Clause card: depth 1 plain sentence · depth 2 the user's numbers · depth 3 exact wording + arithmetic — one element, no new route.
 * `thread-pull`: a 1.5 px gold SVG thread draws from the pressed stitch chip to the card header in 300 ms, holds, and fades (omitted under
 * reduced motion; the card simply appears). Escape closes the card (before any drawer beneath it) and focus returns to the opener.
 */
export function ClauseCard({ stitch, lines, onClose, onOpenOnPage, askSlot, askScope, anchorRect, returnFocus }: Props) {
  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const affected = stepsAffectedBy(stitch, lines);

  // On the phone the card is pressed from inside the modal bottom sheet (vaul over Radix Dialog): a card outside that dialog would sit under
  // its overlay, outside its focus trap and count as an "outside" press. Mount it inside the open sheet instead so it stacks above it.
  const [host] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>('[data-vaul-drawer][data-state="open"]')));

  useLayoutEffect(() => {
    opener.current = (document.activeElement as HTMLElement | null) ?? null;
    const a = anchorRect ?? takeStitchAnchor();
    const h = cardRef.current?.querySelector(".clause-head")?.getBoundingClientRect();
    if (!a || !h || reduce) { setThread(null); return; }
    const o = host?.getBoundingClientRect() ?? { left: 0, top: 0 };      // inside the sheet the svg is positioned against the sheet, not the viewport
    const x1 = a.left + a.width / 2 - o.left, y1 = a.top + a.height / 2 - o.top, x2 = h.left + 12 - o.left, y2 = h.top + h.height / 2 - o.top;
    setThread(`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`);
  }, [stitch.id, anchorRect, reduce, host]);

  // Escape closes the card before anything beneath it: a capture listener on `window` runs before Radix's document-level handlers
  // (vaul sheet, dialogs) and stops the event there, so the sheet or drawer under the card stays open (addendum B1 Escape order).
  // The listener reads the latest onClose through a ref and focus returns only on unmount: App passes a new onClose arrow every render,
  // and re-running the effect used to pull focus out of the card (out of the Ask composer mid-typing) on any re-render (a11y-27).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnRef = useRef(returnFocus);
  returnRef.current = returnFocus;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onCloseRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  useEffect(() => () => {
    const el = returnRef.current ?? opener.current;
    if (el && document.contains(el)) el.focus();
  }, []);
  // A non-modal dialog takes focus when it opens (APG): the heading, so keyboard and screen-reader users land in the card instead of
  // tabbing through the page after the chip to reach it (a11y-5). Re-runs when another clause replaces the open card.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [stitch.id]);

  const card = (
    <>
      {thread && (
        <svg className={`thread-pull ${host ? "thread-pull-in-sheet" : ""}`} aria-hidden="true" focusable="false">
          {/* inside the phone sheet the card lands over the thread's path: fade it as soon as it has landed (≈ 300 ms draw + 200 ms fade)
              instead of holding it across the card's text and depth dial (mobile-20) */}
          <motion.path d={thread} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"
                       initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }}
                       transition={{ pathLength: transitions.threadPull, opacity: host ? { duration: 0.5, times: [0, 0.6, 1] } : { duration: 1.4, times: [0, 0.7, 1] } }} onAnimationComplete={() => setThread(null)} />
        </svg>
      )}
      <div ref={cardRef} className={`clause ${host ? "clause-in-sheet" : ""}`} role="dialog" aria-labelledby="clause-h" aria-modal="false">
        <div className="clause-head">
          <StitchChip stitch={stitch} selected prominent />
          <h3 id="clause-h" ref={headingRef} tabIndex={-1}>{stitch.topic.replace(/[_:]/g, " ")}</h3>
          <EvidenceBadge status="DOC" />
          <Button type="button" variant="ghost" size="icon-touch" className="clause-close" onClick={onClose} aria-label="Close clause card"><X aria-hidden="true" /></Button>
        </div>
        <DepthDial depth={depth} onChange={setDepth} />
        {depth === 1 && <PlainWords planRef={askScope?.plan_ref} stitch={stitch} eyebrow={false} />}
        {depth === 2 && (
          affected.length ? (
            <table className="mini"><caption>In this scenario</caption><tbody>
              {affected.map((a, i) => <tr key={i}><th scope="row">{a.line}: {a.step.label}</th><td className="amt">{money(Math.abs(a.step.cents))} <StitchChip stitch={stitch} /></td></tr>)}
            </tbody></table>
          ) : <p className="plain">This sentence does not change your numbers in this scenario.</p>
        )}
        {depth === 3 && (
          <figure className="wording">
            <blockquote>“{stitch.quote}”</blockquote>
            <figcaption>{stitch.doc}, page {stitch.page}</figcaption>
            {/* a table row quoted alone does not say which column applies (demo-13): name the row and the plan option's column */}
            {stitch.section ? <p className="wording-context">{DRAWER.clauseSection(stitch.section)}</p> : null}
            {stitch.option && /%/.test(stitch.quote) ? <p className="wording-context">{DRAWER.clauseOption(stitch.option)}</p> : null}
          </figure>
        )}
        <div className="clause-foot">
          {askSlot ?? (askScope ? <AskAboutStep scope={askScope} className="clause-ask" /> : null)}
          <button type="button" onClick={() => onOpenOnPage(stitch)}>{UI.showInDocuments}</button>
        </div>
      </div>
    </>
  );
  return host ? createPortal(card, host) : card;
}
