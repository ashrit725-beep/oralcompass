// Eldora UI "SVG Ripple Effect" (https://eldoraui.site/docs/components/svg-ripple-effect, registry @eldoraui/svg-ripple-effect), MIT,
// installed 2026-10-03. Patched for OralCompass (component plan §2 N10): the loop is a ONE-SHOT selection ripple — `rings` (default 5,
// max 6), `transition { duration: 0.45, repeat: 0 }`, stroke `stroke-sea` at 0.35, transparent background (no `bg-white`), `aria-hidden`,
// clsx → cn. Reduced motion: the caller simply does not render it (the selected state lives on the button).
import { cn } from "@/lib/utils"
import { motion } from "motion/react"

interface SvgRippleEffectProps {
  transition?: {
    duration?: number
    repeat?: number
    repeatDelay?: number
  }
  /** Number of rings, 1–6. */
  rings?: number
  fade?: ("top" | "bottom")[]
  whileHover?: boolean
  className?: string
}

export default function SvgRippleEffect({
  transition = { duration: 0.45, repeat: 0 },
  rings = 5,
  fade = [],
  whileHover = false,
  className,
}: SvgRippleEffectProps) {
  const n = Math.max(1, Math.min(6, rings))
  return (
    <motion.div
      className={cn("group pointer-events-none bg-transparent", className)}
      aria-hidden="true"
      initial="idle"
      animate={whileHover ? "idle" : "active"}
      whileHover={whileHover ? "active" : undefined}
      variants={{ idle: {}, active: {} }}
    >
      <svg
        viewBox="0 0 500 500"
        fill="none"
        className={cn(
          "col-start-1 row-start-1 size-full",
          "mask-[linear-gradient(to_bottom,black_90%,transparent),radial-gradient(circle,rgba(0,0,0,1)_0%,rgba(0,0,0,0)_100%)] mask-intersect"
        )}
      >
        {Array.from(Array(n).keys()).map((i) => (
          <motion.circle
            variants={{
              idle: { scale: 1, strokeOpacity: 0.35 },
              active: {
                scale: [1, 1.08, 1],
                strokeOpacity: [0.35, 0.6, 0],
                transition: { ...transition, delay: i * 0.05 },
              },
            }}
            key={i}
            cx="250"
            cy="250"
            r={i * 40 + 40}
            className="stroke-sea"
            strokeWidth={2}
          />
        ))}
      </svg>
      {fade.includes("top") && <div className="absolute inset-0 bg-gradient-to-b from-paper to-[50%]" />}
      {fade.includes("bottom") && <div className="absolute inset-0 bg-linear-to-t from-paper to-[50%]" />}
    </motion.div>
  )
}
