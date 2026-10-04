// Magic UI "Highlighter" (https://magicui.design/docs/components/highlighter, registry @magicui/highlighter; rough-notation 0.5.1), MIT,
// installed 2026-10-03. Patched for OralCompass (component plan §2 N8/N12): defaults `underline`, terracotta, strokeWidth 1.2,
// iterations 1 (one evidential mark per answer/card), wrapper `inline-block` → `inline`. Reduced motion: `animate: false`, duration 0 —
// the underline is drawn instantly. Redraws after the first draw are instant and only follow the element's own size (motion-11). Lazy-load this file with React.lazy (rough-notation stays out of the main chunk).
import { useLayoutEffect, useRef } from "react"
import type React from "react"
import { useInView, useReducedMotion } from "motion/react"
import { annotate } from "rough-notation"
import { type RoughAnnotation } from "rough-notation/lib/model"

type AnnotationAction =
  | "highlight"
  | "underline"
  | "box"
  | "circle"
  | "strike-through"
  | "crossed-off"
  | "bracket"

interface HighlighterProps {
  children: React.ReactNode
  action?: AnnotationAction
  color?: string
  strokeWidth?: number
  animationDuration?: number
  iterations?: number
  padding?: number
  multiline?: boolean
  isView?: boolean
}

export function Highlighter({
  children,
  action = "underline",
  color = "var(--terracotta)",
  strokeWidth = 1.2,
  animationDuration = 450,
  iterations = 1,
  padding = 2,
  multiline = true,
  isView = false,
}: HighlighterProps) {
  const elementRef = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()

  const isInView = useInView(elementRef, {
    once: true,
    margin: "-10%",
  })

  // If isView is false, always show. If isView is true, wait for inView
  const shouldShow = !isView || isInView

  useLayoutEffect(() => {
    const element = elementRef.current
    let annotation: RoughAnnotation | null = null
    let resizeObserver: ResizeObserver | null = null

    if (shouldShow && element) {
      const annotationConfig = {
        type: action,
        color,
        strokeWidth,
        animationDuration: reduce ? 0 : animationDuration,
        animate: !reduce,
        iterations,
        padding,
        multiline,
      }

      const currentAnnotation = annotate(element, annotationConfig)
      annotation = currentAnnotation
      currentAnnotation.show()
      // motion-11: the mark draws once; a later redraw (the element's own box changed) is instant, and page-height changes elsewhere
      // (a drawer opening, an answer appended) no longer redraw it at all
      currentAnnotation.animate = false

      resizeObserver = new ResizeObserver(() => {
        currentAnnotation.hide()
        currentAnnotation.show()
      })

      resizeObserver.observe(element)
    }

    return () => {
      annotation?.remove()
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [
    shouldShow,
    reduce,
    action,
    color,
    strokeWidth,
    animationDuration,
    iterations,
    padding,
    multiline,
  ])

  return (
    <span ref={elementRef} className="relative inline bg-transparent">
      {children}
    </span>
  )
}
