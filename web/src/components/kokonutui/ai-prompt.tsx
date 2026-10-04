/**
 * Kokonut UI "AI Prompt" (https://kokonutui.com/docs/components/ai-prompt), MIT, @kokonutui, installed 2026-10-03.
 * Patched for OralCompass (component plan §2 N8): the promo header row, vendor logo SVGs and model picker are gone; the dropdown is a
 * SCOPE selector ("This step" / "This island" / "Whole plan" supplied by the wrapper); surfaces → paper-deep, focus
 * focus ring → sea, check → forest; fixed `w-4/6` and the hard-coded id are gone (`useId`); all icon
 * buttons are 44 px; focus rings terracotta (3:1 on paper-deep), the question box's on its shell (a11y-20); the send button is `aria-label` "Ask" with lucide Compass (never AI iconography). Enter submits, Shift+Enter newline.
 * AskBox additions (2026-10-04): `compact` puts the send button beside a one-line (48 px) question box with no toolbar row; `busy`
 * disables only the send button (the question box stays editable and focused while an answer is on its way, so a phone keyboard does
 * not drop); `inputRef` hands the textarea to the host (the phone sheet focuses it on open).
 * Strings are props with NO shipped defaults: `AskAboutStep` passes the ASSIST copy namespace. Reduced motion: the one 150 ms
 * opacity swap is the only animation (MotionConfig covers it).
 */

import { Check, ChevronDown, Compass } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";

export interface AIPromptScope { value: string; label: string }

interface AIPromptProps {
  scopes?: AIPromptScope[];
  scope?: string;
  onScopeChange?: (value: string) => void;
  placeholder?: string;
  /** Accessible name of the send button (copy, e.g. "Ask"). */
  sendLabel: string;
  /** Accessible name of the question box (a11y-20: the placeholder vanishes on typing, so it is not the name). Defaults to the placeholder. */
  label?: string;
  /** Accessible name of the scope selector (copy). */
  scopeLabel?: string;
  /** id of the element that describes the composer ("Answers quote your plan document; this is information, not advice"). */
  describedBy?: string;
  disabled?: boolean;
  /** An answer is on its way: the send button waits, the question box stays editable. */
  busy?: boolean;
  /** One-line layout: the send button sits beside the question box (no toolbar row, no scope selector). */
  compact?: boolean;
  /** The question box element, for the host (focus on open). */
  inputRef?: Ref<HTMLTextAreaElement>;
  onSubmit?: (value: string, scope: string) => void;
  className?: string;
}

export default function AI_Prompt({
  scopes = [],
  scope,
  onScopeChange,
  placeholder = "",
  sendLabel,
  label,
  scopeLabel,
  describedBy,
  disabled = false,
  busy = false,
  compact = false,
  inputRef,
  onSubmit,
  className,
}: AIPromptProps) {
  const [value, setValue] = useState("");
  const id = useId();
  const minHeight = compact ? 48 : 72;
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight, maxHeight: compact ? 160 : 300 });
  const setRefs = useCallback((el: HTMLTextAreaElement | null) => {
    (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    if (typeof inputRef === "function") inputRef(el);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  }, [textareaRef, inputRef]);
  const [innerScope, setInnerScope] = useState(scopes[0]?.value ?? "");
  const selectedScope = scope ?? innerScope;
  const selectScope = (v: string) => { setInnerScope(v); onScopeChange?.(v); };
  const scopeText = scopes.find((s) => s.value === selectedScope)?.label ?? selectedScope;

  const submit = () => {
    if (!value.trim() || disabled || busy) return;
    onSubmit?.(value, selectedScope);
    setValue("");
    adjustHeight(true);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const sendButton = (
    <Button
      aria-label={sendLabel}
      variant="ghost"
      size="icon-touch"
      className="shrink-0 rounded-lg text-ink hover:bg-parchment focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-0 disabled:opacity-40"
      disabled={disabled || busy || !value.trim()}
      type="button"
      onClick={submit}
    >
      <Compass className={cn("transition-opacity duration-200 motion-reduce:transition-none", value.trim() ? "opacity-100" : "opacity-40")} aria-hidden="true" />
    </Button>
  );

  if (compact) {
    return (
      <div className={cn("w-full", className)}>
        <div className="ai-prompt-shell ai-prompt-compact flex items-end gap-1 rounded-xl border border-rule bg-paper p-1">
          <Textarea
            className="min-h-12 w-full flex-1 resize-none rounded-lg border-none bg-paper px-3 py-3 font-serif text-base leading-6 text-ink placeholder:text-ink-soft focus-visible:ring-0 focus-visible:ring-offset-0"
            id={id}
            rows={1}
            aria-label={label || placeholder || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            onChange={(e) => { setValue(e.target.value); adjustHeight(); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={setRefs}
            value={value}
            enterKeyHint="send"
          />
          {sendButton}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* the focus ring sits on this shell (assistant.css `.ai-prompt-shell:has(textarea:focus-visible)`): the textarea's own ring was
          clipped by its scroll box and drawn in sea at 2.1:1 (a11y-20) */}
      <div className="ai-prompt-shell rounded-xl border border-rule bg-paper-deep p-1.5">
        <div className="relative flex flex-col">
          <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
            <Textarea
              className={cn(
                "w-full resize-none rounded-lg rounded-b-none border-none bg-paper-deep px-4 py-3 font-serif text-base text-ink placeholder:text-ink-soft focus-visible:ring-0 focus-visible:ring-offset-0",
                "min-h-[72px]"
              )}
              id={id}
              aria-label={label || placeholder || undefined}
              aria-describedby={describedBy}
              disabled={disabled}
              onChange={(e) => { setValue(e.target.value); adjustHeight(); }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              ref={setRefs}
              value={value}
            />
          </div>

          <div className="flex min-h-14 items-center justify-between gap-2 rounded-b-lg bg-paper-deep px-1.5 pb-1">
            <div className="flex items-center gap-2">
              {scopes.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="flex min-h-11 items-center gap-1 rounded-md pr-2 pl-2 text-sm text-ink hover:bg-parchment focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-0"
                      variant="ghost"
                      aria-label={scopeLabel}
                    >
                      <AnimatePresence mode="wait">
                        <motion.span
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-1"
                          exit={{ opacity: 0 }}
                          initial={{ opacity: 0 }}
                          key={selectedScope}
                          transition={{ duration: 0.15 }}
                        >
                          {scopeText}
                          <ChevronDown className="h-3 w-3 opacity-50" aria-hidden="true" />
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[10rem] border-rule bg-paper-deep">
                    {scopes.map((s) => (
                      <DropdownMenuItem
                        className="flex min-h-11 items-center justify-between gap-2"
                        key={s.value}
                        onSelect={() => selectScope(s.value)}
                      >
                        <span>{s.label}</span>
                        {selectedScope === s.value && <Check className="h-4 w-4 text-forest" aria-hidden="true" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {sendButton}
          </div>
        </div>
      </div>
    </div>
  );
}
