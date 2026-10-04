import { Progress } from "@/components/ui/progress";
import { CompassLoader } from "@/components/vendor/uiverse/CompassLoader";
import { cn } from "@/lib/utils";

/**
 * StageLoader (component plan N7): the compass-rose loader + a REAL stage label + a determinate shadcn Progress. Never rendered without a
 * label (the prop is required). `stageIndex`/`stages` make the compass turn once per stage and fill the bar; without them the compass
 * runs its brief indeterminate sweep (uploading…). Reduced motion: compass static pointing north, bar at its final value, label carries
 * the meaning (`role="status"`, `aria-live="polite"`).
 */
export interface StageLoaderProps {
  label: string;
  stageIndex?: number;
  stages?: number;
  /** Override the bar's accessible text, e.g. (i, n) => `Stage ${i} of ${n}: ${label}`. */
  valueLabel?: (stageIndex: number, stages: number) => string;
  size?: "sm" | "md";
  className?: string;
}

export function StageLoader({ label, stageIndex, stages, valueLabel, size = "md", className }: StageLoaderProps) {
  const determinate = typeof stageIndex === "number" && typeof stages === "number" && stages > 0;
  const pct = determinate ? Math.round((Math.min(stageIndex!, stages!) / stages!) * 100) : undefined;
  return (
    <div className={cn("flex items-center gap-3", size === "sm" ? "text-sm" : "text-base", className)} role="status" aria-live="polite">
      <CompassLoader label={label} progress={determinate ? stageIndex! / stages! : undefined} size={size === "sm" ? "2em" : "3em"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="m-0 text-ink-soft">{label}</p>
        {determinate && (
          <Progress
            value={pct}
            className="max-w-xs"
            aria-label={valueLabel ? valueLabel(stageIndex!, stages!) : `${label}: ${stageIndex} of ${stages}`}
            getValueLabel={() => (valueLabel ? valueLabel(stageIndex!, stages!) : `${stageIndex} of ${stages}`)}
          />
        )}
      </div>
    </div>
  );
}

export default StageLoader;
