// Animata "Ring Chart" (https://animata.design/docs/graphs/ring-chart), MIT, installed 2026-10-03.
// Patched for OralCompass (component plan §2 N11): the hard-coded `rounded-3xl bg-zinc-950` wrapper is gone, sample rings are sea/sage/gold on
// `text-ink/10`, the donut import points at the installed location. Reduced motion: inherited from DonutChart.
import DonutChart from "@/components/animata/graphs/donut-chart";
import { cn } from "@/lib/utils";

type RingItem = {
  progress: number;
  className?: string;
  trackClassName: string;
  progressClassName: string;
};

interface RingChartProps {
  /**
   * Size of the smallest ring
   * @default 96
   */
  size?: number;

  /**
   * Gap between rings
   * @default 4
   */
  gap?: number;

  /**
   * Width of the ring
   * @default 20
   */
  width?: number;

  /**
   * Additional class name of the container
   */
  className?: string;

  rings: RingItem[];
}

const sampleRings: RingItem[] = [
  {
    progress: 10,
    trackClassName: "text-ink/10",
    progressClassName: "text-sea",
  },
  {
    progress: 60,
    trackClassName: "text-ink/10",
    progressClassName: "text-sage",
  },
  {
    progress: 40,
    trackClassName: "text-ink/10",
    progressClassName: "text-gold",
  },
];

const calculateRingSize = ({
  size = 96,
  width = 20,
  gap = 4,
  index,
  total,
}: Pick<RingChartProps, "gap" | "size" | "width"> & {
  index: number;
  total: number;
}) => {
  const position = total - index;
  // Size of the smallest ring + ring width on 2 side + gap on 2 side
  // offset by the position.
  return size + position * width * 2 + gap * position * 2;
};

export default function RingChart({
  size = 96,
  gap = 4,
  width = 20,
  className,
  rings = sampleRings,
}: RingChartProps) {
  const totalWidth = calculateRingSize({
    size,
    width,
    gap,
    index: 0,
    total: rings.length,
  });

  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{
        minWidth: totalWidth + gap * rings.length * 4,
        minHeight: totalWidth + gap * rings.length * 4,
      }}
    >
      {rings.map((ring, index) => {
        const ringSize = calculateRingSize({
          size,
          width,
          gap,
          index,
          total: rings.length,
        });
        return (
          <DonutChart
            key={`ring_${index}`}
            size={ringSize}
            {...ring}
            progressWidth={width}
            circleWidth={width}
            className={cn("absolute", ring.className)}
          />
        );
      })}
    </div>
  );
}
