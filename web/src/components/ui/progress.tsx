import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

// shadcn/ui Progress (radix-nova), restyled for OralCompass (component plan §2 N6/N7): `h-2`, track `bg-sand`, indicator `bg-sea`
// turning `bg-forest` at 100 %. Only used for REAL stages (never decorative). Reduced motion: `motion-reduce:transition-none` and the
// final value is set synchronously by the caller, so the end state is exact.
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative flex h-2 w-full items-center overflow-x-hidden rounded-full bg-sand",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("size-full flex-1 transition-transform duration-300 motion-reduce:transition-none", v >= 100 ? "bg-forest" : "bg-sea", indicatorClassName)}
        style={{ transform: `translateX(-${100 - v}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
