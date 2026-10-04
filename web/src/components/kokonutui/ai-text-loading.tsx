/**
 * Kokonut UI "AI Text Loading" (https://kokonutui.com/docs/components/ai-text-loading), MIT, @kokonutui, installed 2026-10-03.
 * Patched for OralCompass (component plan §2 N7 fallback): the `setInterval` driver is replaced by a controlled `index` prop bound to
 * the REAL stage; gradient recoloured ink → sand → ink; text 16 px; no shipped default strings (the wrapper passes
 * the stage copy). Reduced motion: the background-position sweep is skipped (`useReducedMotion`), the text stays static and legible.
 */

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface AITextLoadingProps {
  /** Stage copy, one entry per real stage. */
  texts: string[];
  /** Controlled index of the current stage. */
  index: number;
  className?: string;
}

export default function AITextLoading({ texts, index, className }: AITextLoadingProps) {
  const reduce = useReducedMotion();
  const currentTextIndex = Math.max(0, Math.min(texts.length - 1, index));
  const text = texts[currentTextIndex] ?? "";

  return (
    <div className="flex items-center p-0" role="status" aria-live="polite">
      <motion.div animate={{ opacity: 1 }} className="relative w-full" initial={{ opacity: 0 }} transition={{ duration: 0.3 }}>
        <AnimatePresence mode="wait">
          <motion.div
            animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, backgroundPosition: ["200% center", "-200% center"] }}
            className={cn(
              "flex min-w-max whitespace-nowrap bg-[length:200%_100%] bg-gradient-to-r from-ink via-sand to-ink bg-clip-text text-base text-transparent motion-reduce:bg-none motion-reduce:text-ink-soft",
              className
            )}
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: 8 }}
            key={currentTextIndex}
            transition={{
              opacity: { duration: 0.3 },
              y: { duration: 0.3 },
              backgroundPosition: { duration: 2.5, ease: "linear", repeat: Number.POSITIVE_INFINITY },
            }}
          >
            {text}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
