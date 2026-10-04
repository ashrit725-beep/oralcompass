import { ArtPlate } from "./ArtPlate";

/**
 * START harbor (spec §3.4, §6): a painted quay with a mast at the left shore, the navigator's chest plate (benefits-chest, ≤ 72 px,
 * lazy) beside it, and a faint dotted wake running in from the margin where the visited islets sit. Decorative only (inside the
 * aria-hidden scene); the HTML "Start · {plan} · {network}" button is rendered by PassageVertical.
 */
export function StartHarbor({ x, y, wakeTo }: { x: number; y: number; wakeTo?: { x: number; y: number } | null }) {
  return (
    <g className="start-harbor">
      {wakeTo && <path d={`M ${wakeTo.x} ${wakeTo.y} C ${wakeTo.x + 20} ${(wakeTo.y + y) / 2}, ${x - 40} ${y - 30}, ${x - 8} ${y - 6}`} fill="none" stroke="var(--paper)" strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="1.5 6" strokeLinecap="round" />}
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx={0} cy={14} rx={58} ry={14} fill="var(--water-ink)" opacity={0.25} />
        <ellipse cx={0} cy={10} rx={54} ry={12} fill="var(--sand)" opacity={0.9} />
        <rect x={-46} y={2} width={92} height={8} rx={2} fill="var(--wood)" />
        {[-36, -14, 8, 30].map((px) => <rect key={px} x={px} y={8} width={5} height={12} fill="var(--wood)" />)}
        <path d="M -24 2 l 11 -34 l 7 34 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth={1} />
        <path d="M -13 2 l 0 -40" stroke="var(--ink)" strokeWidth={1.2} />
        <path d="M -13 -40 l 10 3 l -10 3 Z" fill="var(--terracotta)" />
        <ellipse cx={-13} cy={4} rx={20} ry={5} fill="var(--wood)" />
        <ArtPlate slot="benefits-chest" x={18} y={-30} w={40} h={40} fallback={<g><rect x={20} y={-18} width={30} height={22} rx={3} fill="var(--wood)" stroke="var(--ink)" strokeWidth={1} /><path d="M 20 -8 h 30" stroke="var(--gold)" strokeWidth={1.2} /></g>} />
      </g>
    </g>
  );
}

export default StartHarbor;
