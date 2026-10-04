// Animata "Gauge Chart" (https://animata.design/docs/graphs/gauge-chart), MIT, installed 2026-10-03.
// Patched for OralCompass (component plan §2 N11): defaults `text-sea` / `text-ink/10` (colours are currentColor via className), the
// circles get `transition-[stroke-dashoffset] motion-reduce:transition-none`. Reduced motion: the 250 ms `shouldUseValue` delay is skipped
// so the arc renders at its final value immediately. Wrap the meter in role="meter" at the call site; UNKNOWN never renders as 0 %.
import { type ReactNode, useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

interface GaugeChartProps {
  showValue?: boolean;
  size: number;
  gap: number;
  progress: number;
  trackClassName?: string;
  progressClassName?: string;
  circleWidth?: number;
  progressWidth?: number;
  rounded?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function GaugeChart({
  showValue,
  size,
  progress,
  gap,
  progressClassName = "text-sea",
  trackClassName = "text-ink/10",
  circleWidth = 16,
  progressWidth = 16,
  rounded = true,
  className,
  children,
}: GaugeChartProps) {
  const reduce = useReducedMotion();
  const [shouldUseValue, setShouldUseValue] = useState(!!reduce);

  useEffect(() => {
    if (reduce) { setShouldUseValue(true); return; }
    const timeout = setTimeout(() => {
      setShouldUseValue(true);
    }, 250);
    return () => clearTimeout(timeout);
  }, [reduce]);

  const radius = size / 2 - Math.max(progressWidth, circleWidth);
  const circumference = Math.PI * radius * 2;
  const adjustedProgress = shouldUseValue ? progress : 0;

  // Avoid values less than 0 and greater than 100
  const validatedProgress =
    adjustedProgress < 0 ? 0 : adjustedProgress > 100 ? 100 : adjustedProgress;

  // Calculate the stroke-dashoffset for the progress circle considering the gap
  const strokeDashoffsetProgress =
    circumference - (validatedProgress / 100) * (circumference - gap);

  return (
    <div className={className}>
      <div className="relative" style={{ width: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background Circle */}
          <circle
            r={radius}
            cx={size / 2}
            cy={size / 2}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={`${circleWidth}px`}
            strokeDasharray={circumference}
            strokeDashoffset={gap}
            strokeLinecap={rounded ? "round" : "butt"}
            className={cn("transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none", trackClassName)}
            transform={`rotate(${90 + (gap / (2 * circumference)) * 360} ${size / 2} ${size / 2})`}
          />
          {/* Progress Circle */}
          <circle
            r={radius}
            cx={size / 2}
            cy={size / 2}
            stroke="currentColor"
            className={cn("transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none", progressClassName)}
            strokeWidth={`${progressWidth}px`}
            strokeLinecap={rounded ? "round" : "butt"}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffsetProgress}
            transform={`rotate(${90 + (gap / (2 * circumference)) * 360} ${size / 2} ${size / 2})`}
          />
        </svg>
        {showValue && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono font-bold text-foreground"
            style={{ fontSize: size / 4 }}
          >
            {progress}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
