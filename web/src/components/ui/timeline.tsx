// Aceternity UI "Timeline" (https://ui.aceternity.com/components/timeline), Aceternity License, installed 2026-10-03.
// Patched for OralCompass (component plan §2 N5): demo heading/intro deleted; `bg-white font-sans` → transparent serif; fill
// purple→blue → forest→sea (a painted wash); track `via-neutral-200` → `via-ink/15`; dots paper/sand; titles 18 px ink; entries are an
// <ol>/<li> with `aria-current="step"` on `current`. Reduced motion: the fill height/opacity are motion values (MotionConfig does not
// cover them) → when `useReducedMotion()` the fill renders at 100 % / opacity 1.
import {
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  motion,
} from "motion/react";
import React, { useEffect, useRef, useState } from "react";

interface TimelineEntry {
  title: string;
  content: React.ReactNode;
}

export const Timeline = ({ data, current, ariaLabel }: { data: TimelineEntry[]; current?: number; ariaLabel?: string }) => {
  const ref = useRef<HTMLOListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHeight(rect.height);
    }
  }, [ref, data.length]);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 10%", "end 50%"],
  });

  const heightTransform = useTransform(scrollYProgress, [0, 1], [0, height]);
  const opacityTransform = useTransform(scrollYProgress, [0, 0.1], [0, 1]);
  // keep the hook (Aceternity exports it from here); it is a no-op subscription so consumers can extend
  useMotionValueEvent(scrollYProgress, "change", () => {});

  return (
    <div className="w-full bg-transparent font-serif px-0 scroll-fade-y" ref={containerRef}>
      <ol ref={ref} className="relative mx-auto max-w-7xl list-none p-0 pb-10" aria-label={ariaLabel}>
        {data.map((item, index) => (
          <li
            key={index}
            className="flex justify-start pt-6 md:gap-10 md:pt-10"
            aria-current={current === index ? "step" : undefined}
          >
            <div className="sticky top-40 z-40 flex max-w-xs flex-col items-center self-start md:w-full md:flex-row lg:max-w-sm">
              <div className="absolute left-3 flex h-10 w-10 items-center justify-center rounded-full bg-paper md:left-3">
                <div className="h-4 w-4 rounded-full border border-ink/40 bg-sand p-2" />
              </div>
              <h3 className="hidden text-lg text-ink tabular-nums md:block md:pl-20">{item.title}</h3>
            </div>

            <div className="relative w-full pr-4 pl-20 md:pl-4">
              <h3 className="mb-4 block text-left text-lg text-ink tabular-nums md:hidden">{item.title}</h3>
              {item.content}{" "}
            </div>
          </li>
        ))}
        <div
          style={{ height: height + "px" }}
          aria-hidden="true"
          className="absolute top-0 left-8 w-[2px] overflow-hidden bg-[linear-gradient(to_bottom,var(--tw-gradient-stops))] from-transparent from-[0%] via-ink/15 to-transparent to-[99%] [mask-image:linear-gradient(to_bottom,transparent_0%,black_10%,black_90%,transparent_100%)] md:left-8"
        >
          <motion.div
            style={reduce ? { height: "100%", opacity: 1 } : { height: heightTransform, opacity: opacityTransform }}
            className="absolute inset-x-0 top-0 w-[2px] rounded-full bg-gradient-to-t from-forest from-[0%] via-sea via-[10%] to-transparent"
          />
        </div>
      </ol>
    </div>
  );
};
