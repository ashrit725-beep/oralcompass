import { Money, type MoneyProps } from "@/components/Money";
import { cn } from "@/lib/utils";

/**
 * RollingAmount (spec §5.5 `sounding-roll`): a pipeline amount that rolls from its previous value to the new one when a new estimate
 * arrives. NumberFlow inside `Money` performs the roll on the same mounted instance (nodes are keyed by trail step, not by estimate id),
 * honours `prefers-reduced-motion` itself (value snaps, end state exact) and never animates colour. `null` renders the em dash; the caller
 * adds the "Waiting for information" words. The badge stays a sibling inside `Money` (`badge={false}` keeps the sr-only evidence text when
 * the node carries its own badge or stitch chip instead).
 */
export interface RollingAmountProps extends MoneyProps { size?: "md" | "lg" | "hero" }

export function RollingAmount({ size = "md", className, ...rest }: RollingAmountProps) {
  return <Money {...rest} className={cn("rolling-amount", size === "lg" && "rolling-amount-lg", size === "hero" && "rolling-amount-hero", className)} />;
}

export default RollingAmount;
