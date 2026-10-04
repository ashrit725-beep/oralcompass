import { Compass, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import AI_Prompt from "@/components/kokonutui/ai-prompt";
import ThoughtLine from "@/components/ui/ThoughtLine";
import { Button } from "@/components/ui/button";
import { ASSIST } from "@/lib/copy/assistant";
import { boxSuggestions, type AskTab } from "@/lib/assistant";
import { cn } from "@/lib/utils";
import type { AssistScope } from "@/lib/types";
import { useAsk, type AskApi } from "@/hooks/useAsk";
import { useKeyboardInset, useMeasuredVar } from "@/hooks/useKeyboardInset";
import { AnswerList } from "./AnswerList";

/**
 * AskBox ("Ask in plain words", the owner's prompt box): a question box that is reachable on every tab and answers in simple terms first.
 * Scope = the selected plan + the journey's estimate + the journey (no line). The question/answer logic is the shared `useAsk` hook and the
 * answers are the shared `AnswerList` / `AnswerCard` (the drawer's and the ClauseCard's composers use the same pieces).
 *  - Desktop (`AskBoxCard`): an inline parchment card at the top of the tab's main column: title, one-line composer with the send button
 *    beside it, four everyday chips for the tab, then the newest answer (earlier ones behind a disclosure). On My journey it sits under
 *    the summary and above the map, compact enough that the map still starts in the first viewport at 1366 × 900.
 *  - Phone (`AskDock`, < 760 px): a one-line "Ask in plain words" field directly above the dock (thumb zone). Activating it (tap, Enter
 *    or Space; never on focus alone, WCAG 3.2.1) opens a bottom sheet in the procedure sheet's style with the chips and answers in a
 *    scroll area and the composer pinned at its foot. The sheet is non-modal and stops at the dock's top edge, so the dock stays
 *    reachable (a tab change closes the sheet); a flat ink scrim covers the page above it and closes it on tap. `visualViewport` keeps
 *    the composer above the on-screen keyboard. Closing returns focus to the field. No chat bubbles, no right-hand column, no AI
 *    iconography (the Compass is the app's own send glyph).
 * States: idle · sending (ThoughtLine) · answered · nothing survived · rate limited · offline · live unavailable (useAsk errors).
 */
export interface AskBoxProps {
  tab: AskTab;
  /** null when no plan is selected yet (the box waits). */
  scope: AssistScope | null;
  onOpenStitch?: (stitchId: string) => void;
}

function useAskBox(tab: AskTab, scope: AssistScope) {
  const ask = useAsk({ scope, memoryKey: `askbox:${tab}`, adoptSuggestions: false });
  const chips = useMemo(() => boxSuggestions(tab, ask.data), [tab, ask.data]);
  return { ask, chips };
}

/** The shared inside of the card and the sheet. `layout="sheet"` pins the composer at the foot and lists the chips as a ruled list. */
function AskBoxBody({ ask, chips, layout, describedBy, inputRef, onOpenStitch }: {
  ask: AskApi; chips: string[]; layout: "card" | "sheet"; describedBy: string; inputRef?: React.Ref<HTMLTextAreaElement>; onOpenStitch?: (id: string) => void;
}) {
  const { pending, simplerFor, paused, error, cycle } = ask;
  const busy = !!pending || simplerFor !== null;
  const send = (q: string) => { void ask.ask(q); };
  const composer = (
    <AI_Prompt compact placeholder={ASSIST.boxPlaceholder} label={ASSIST.boxTitle} sendLabel={ASSIST.send} describedBy={describedBy}
               disabled={paused} busy={busy} onSubmit={(v) => send(v)} inputRef={inputRef} className="askbox-composer" />
  );
  const chipList = (
    <ul className={layout === "card" ? "askbox-chips" : "as-suggestions askbox-chips-sheet"} aria-label={ASSIST.boxSuggestionsLabel}>
      {chips.map((q) => (
        <li key={q}>
          <Button type="button" variant={layout === "card" ? "outline" : "ghost"} size="touch" disabled={busy || paused} onClick={() => send(q)}
                  className={layout === "card" ? "askbox-chip h-auto rounded-[var(--r-2)] px-3 py-2 text-left font-serif text-[15px] leading-5 font-normal whitespace-normal" : "as-suggestion h-auto w-full justify-start whitespace-normal rounded-[var(--r-2)] text-left"}>
            {q}
          </Button>
        </li>
      ))}
    </ul>
  );
  const status = (
    <>
      {pending && (
        <ThoughtLine key={cycle} working label={ASSIST.boxSending} doneLabel={ASSIST.boxSending} showTimer={false} glyph={<Compass aria-hidden="true" />}
                     glyphColor="var(--gold)" breathPeriod={2.4} breathDepth={0.3} collapseOnSettle={false} fontSize={14} className="as-thought" />
      )}
      {error && <p role="alert" className="as-error">{error}</p>}
    </>
  );
  const answers = <AnswerList ask={ask} collapseEarlier onOpenStitch={onOpenStitch} nothingSurvived={ASSIST.boxNothingSurvived} />;
  // the sheet: a new answer scrolls its top (the question and "In simple terms") into view inside the sheet, never the page
  const scrollRef = useRef<HTMLDivElement>(null);
  const newest = ask.answers[ask.answers.length - 1]?.id;
  useEffect(() => {
    const box = scrollRef.current;
    const li = box?.querySelector<HTMLElement>(".as-answers > .as-answer");
    if (!box || !li || newest === undefined) return;
    box.scrollTop = Math.max(0, li.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8);
  }, [newest]);
  if (layout === "sheet") {
    return (
      <>
        <div className="askbox-sheet-scroll" ref={scrollRef}>
          <p id={describedBy} className="as-described">{ASSIST.boxDescribedBy}</p>
          {answers}
          {status}
          {chipList}
        </div>
        <div className="askbox-sheet-foot">{composer}</div>
      </>
    );
  }
  return (
    <>
      {composer}
      {chipList}
      {status}
      {answers}
    </>
  );
}

/** Desktop: the inline card at the top of a tab's main column. */
export function AskBoxCard({ tab, scope, onOpenStitch }: AskBoxProps) {
  if (!scope) return null;
  return <AskBoxCardInner key={tab} tab={tab} scope={scope} onOpenStitch={onOpenStitch} />;
}

function AskBoxCardInner({ tab, scope, onOpenStitch }: { tab: AskTab; scope: AssistScope; onOpenStitch?: (id: string) => void }) {
  const headingId = useId();
  const descId = useId();
  const { ask, chips } = useAskBox(tab, scope);
  return (
    <section className="askbox" data-tab={tab} aria-labelledby={headingId}>
      <div className="askbox-head">
        <h3 id={headingId} className="askbox-title">{ASSIST.boxTitle}</h3>
        <p id={descId} className="askbox-desc">{ASSIST.boxDescribedBy}</p>
      </div>
      <AskBoxBody ask={ask} chips={chips} layout="card" describedBy={descId} onOpenStitch={onOpenStitch} />
    </section>
  );
}

/** Phone: the field above the dock and the bottom sheet it opens. Rendered once by App, outside the tab panels (fixed layers must not
 *  sit inside the view's transformed wash-in container). */
export function AskDock({ tab, scope, onOpenStitch }: AskBoxProps) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useMeasuredVar(barRef, "--askfield-h", !!scope);
  // a tab change (the dock stays reachable under the sheet's edge) closes the sheet; focus stays on the tab that was pressed
  const lastTab = useRef(tab);
  useEffect(() => { if (lastTab.current !== tab) { lastTab.current = tab; setOpen(false); } }, [tab]);
  if (!scope) return null;
  return (
    <>
      <div ref={barRef} className="askfield-bar" data-open={open ? "true" : "false"}>
        <button ref={fieldRef} type="button" className="askfield unstyled" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="askfield-text">{ASSIST.boxOpen}</span>
          <Compass aria-hidden="true" className="askfield-glyph" />
        </button>
      </div>
      <AskSheet key={tab} tab={tab} scope={scope} open={open} onOpenChange={setOpen} returnFocus={fieldRef} onOpenStitch={onOpenStitch} />
    </>
  );
}

function AskSheet({ tab, scope, open, onOpenChange, returnFocus, onOpenStitch }: {
  tab: AskTab; scope: AssistScope; open: boolean; onOpenChange: (o: boolean) => void; returnFocus: React.RefObject<HTMLButtonElement | null>; onOpenStitch?: (id: string) => void;
}) {
  const titleId = useId();
  const descId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { ask, chips } = useAskBox(tab, scope);
  const kb = useKeyboardInset(open);
  const wasOpen = useRef(open);

  // focus returns to the field on close, deferred one task (vaul unmounts the content first); not when focus already moved elsewhere
  // on purpose (a dock tab was pressed)
  useEffect(() => {
    if (wasOpen.current && !open) {
      window.setTimeout(() => {
        const a = document.activeElement;
        if (!a || a === document.body || !a.isConnected || contentRef.current?.contains(a)) returnFocus.current?.focus({ preventScroll: true });
      }, 0);
    }
    wasOpen.current = open;
  }, [open, returnFocus]);

  // the keyboard lifts the sheet: its bottom edge follows the visual viewport, its height never exceeds what is visible
  const style: React.CSSProperties = kb.inset > 0
    ? { bottom: kb.inset, maxHeight: kb.height ? kb.height - 8 : undefined }
    : {};

  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} direction="bottom" modal={false} repositionInputs={false}>
      <DrawerPrimitive.Portal>
        {open && <div className="ask-scrim" aria-hidden="true" onClick={() => onOpenChange(false)} />}
        <DrawerPrimitive.Content
          ref={contentRef}
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="ask-sheet drawer-sheet-style"
          style={style}
          onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DrawerPrimitive.Close asChild>
            <button type="button" className="unstyled ask-sheet-handle" aria-label={ASSIST.boxClose}><span aria-hidden="true" /></button>
          </DrawerPrimitive.Close>
          <div className="ask-sheet-head">
            <DrawerPrimitive.Title id={titleId} className="ask-sheet-title">{ASSIST.boxTitle}</DrawerPrimitive.Title>
            <DrawerPrimitive.Close asChild>
              <Button variant="ghost" size="icon-touch" aria-label={ASSIST.boxClose} className="-mr-2 shrink-0"><X aria-hidden="true" /></Button>
            </DrawerPrimitive.Close>
          </div>
          <AskBoxBody ask={ask} chips={chips} layout="sheet" describedBy={descId} inputRef={inputRef} onOpenStitch={onOpenStitch} />
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

/** A tab's slot: the desktop card, nothing on phones (the AskDock serves them). */
export function AskBoxSlot({ mobile, ...props }: AskBoxProps & { mobile: boolean }): ReactNode {
  return mobile ? null : <AskBoxCard {...props} />;
}

export default AskBoxCard;
