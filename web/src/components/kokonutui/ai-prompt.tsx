/**
 * Kokonut UI "AI Prompt" (https://kokonutui.com/docs/components/ai-prompt), MIT, @kokonutui, installed 2026-10-03.
 * Patched for OralCompass (component plan §2 N8): the promo header row, vendor logo SVGs and model picker are gone; the dropdown is a
 * SCOPE selector ("This step" / "This island" / "Whole plan" supplied by the wrapper); surfaces → paper-deep, focus
 * focus ring → sea, check → forest; fixed `w-4/6` and the hard-coded id are gone (`useId`); all icon
 * buttons are 44 px; focus rings terracotta (3:1 on paper-deep), the question box's on its shell (a11y-20); the send button is `aria-label` "Ask" with lucide Compass (never AI iconography). Enter submits, Shift+Enter newline.
 * Strings are props with NO shipped defaults: `AskAboutStep` passes the ASSIST copy namespace. Reduced motion: the one 150 ms
 * opacity swap is the only animation (MotionConfig covers it).
 */

import { Check, ChevronDown, Compass } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
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
  onSubmit,
  className,
}: AIPromptProps) {
  const [value, setValue] = useState("");
  const id = useId();
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 72, maxHeight: 300 });
  const [innerScope, setInnerScope] = useState(scopes[0]?.value ?? "");
  const selectedScope = scope ?? innerScope;
  const selectScope = (v: string) => { setInnerScope(v); onScopeChange?.(v); };
  const scopeText = scopes.find((s) => s.value === selectedScope)?.label ?? selectedScope;

  const submit = () => {
    if (!value.trim() || disabled) return;
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
              ref={textareaRef}
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
            <Button
              aria-label={sendLabel}
              variant="ghost"
              size="icon-touch"
              className="rounded-lg text-ink hover:bg-parchment focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-0 disabled:opacity-40"
              disabled={disabled || !value.trim()}
              type="button"
              onClick={submit}
            >
              <Compass className={cn("transition-opacity duration-200 motion-reduce:transition-none", value.trim() ? "opacity-100" : "opacity-40")} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
