// Animata "Donut Chart" (https://animata.design/docs/graphs/donut-chart, pulled by ring-chart), MIT, installed 2026-10-03.
// Patched for OralCompass (component plan §2 N11): defaults `text-sea` / `text-ink/10` (colours are currentColor via className), the
// circles get `transition-[stroke-dashoffset] motion-reduce:transition-none`. Reduced motion: the 250 ms `shouldUseValue` delay is skipped
// so the arc renders at its final value immediately. Wrap the meter in role="meter" at the call site; UNKNOWN never renders as 0 %.
import { type ReactNode, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface DonutChartProps {
  size: number;
  progress: number;
  trackClassName?: string;
  progressClassName?: string;
  circleWidth?: number;
  progressWidth?: number;
  rounded?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function DonutChart({
  size,
  progress,
  progressClassName = "text-sea",
  trackClassName = "text-ink/10",
  circleWidth = 16,
  progressWidth = 16,
  rounded = true,
  className,
  children,
}: DonutChartProps) {
  const reduce = useReducedMotion();
  const [shouldUseValue, setShouldUseValue] = useState(!!reduce);

  useEffect(() => {
    if (reduce) { setShouldUseValue(true); return; }
    const timeout = setTimeout(() => {
      // This is a hack to force the animation to run for the first time.
      // A Motion spring could drive this but just keeping it simple for now.
      setShouldUseValue(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [reduce]);

  const radius = size / 2 - Math.max(progressWidth, circleWidth) / 2;
  const circumference = Math.PI * radius * 2;
  const percentage = shouldUseValue ? circumference * ((100 - progress) / 100) : circumference;

  return (
    <div className={className}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={`${circleWidth}px`}
          strokeDasharray={"10px 0"}
          strokeDashoffset="0px"
          className={cn("transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none", trackClassName)}
        />
        <circle
          r={radius}
          cx={size / 2}
          cy={size / 2}
          stroke="currentColor"
          className={cn("transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none", progressClassName)}
          strokeWidth={`${progressWidth}px`}
          strokeLinecap={rounded ? "round" : "butt"}
          fill="transparent"
          strokeDasharray={`${circumference}px`}
          strokeDashoffset={`${percentage}px`}
        />
      </svg>
      {children}
    </div>
  );
}
