import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// shadcn/ui Badge (radix-nova), restyled for OralCompass (component plan §2 N14): six evidence variants (doc, user, assumed, ambiguous,
// unknown, conflict), `rounded-md` (a stitched ribbon, not a pill), `tabular-nums` for numeric badges, dark-mode variants removed.
// Evidence badges are ALWAYS icon + word (never colour alone); `EvidenceBadge` in components/Primitives.tsx owns the aria-label.
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        /* evidence (CLAUDE.md rule 2) */
        doc: "bg-sage/30 text-ink border-forest/40",
        user: "bg-paper-deep text-ink border-ink/30",
        assumed: "bg-sand/60 text-ink border-gold border-dashed",
        ambiguous: "bg-gold-soft/50 text-ink border-gold",
        unknown: "bg-transparent text-terracotta border-terracotta border-dotted",
        conflict: "bg-transparent text-danger border-danger",
        /* confidence (spec §7.4 review table) */
        numeric: "tabular-nums border-border bg-paper text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** Evidence status → badge variant (lower-cased status keys). */
const evidenceVariant = {
  DOC: "doc", USER: "user", ASSUMED: "assumed", AMBIGUOUS: "ambiguous", UNKNOWN: "unknown", CONFLICT: "conflict",
} as const

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants, evidenceVariant }
