/**
 * Shared SVG "paint" for the atlas: paper grain, watercolor edge wobble, soft bleed, washes, mist, clouds and a vignette.
 * Everything here is decorative (aria-hidden by the parent svg). Art direction: docs/ORALCOMPASS_UI_GUIDE.md.
 */
export function AtlasDefs() {
  return (
    <defs>
      <filter id="oc-wobble" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="9" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="oc-wobble-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="11" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="14" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="oc-bleed" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter>
      <filter id="oc-mist" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
      <filter id="oc-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.40  0 0 0 0 0.33  0 0 0 0.16 0" />
      </filter>
      <filter id="oc-wash" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5" result="w" />
        <feColorMatrix in="w" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.10 0" result="wa" />
        <feComposite in="SourceGraphic" in2="wa" operator="over" />
      </filter>
      <radialGradient id="oc-water" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stopColor="var(--water-light)" />
        <stop offset="100%" stopColor="var(--water)" />
      </radialGradient>
      <linearGradient id="oc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--sky)" />
        <stop offset="100%" stopColor="var(--water-light)" />
      </linearGradient>
      <linearGradient id="oc-land" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--sage)" />
        <stop offset="100%" stopColor="var(--forest)" />
      </linearGradient>
      <linearGradient id="oc-hill-far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--hill-far)" />
        <stop offset="100%" stopColor="var(--water-light)" />
      </linearGradient>
      <radialGradient id="oc-sun" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--gold-soft)" stopOpacity="0.9" />
        <stop offset="100%" stopColor="var(--gold-soft)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="oc-vignette" cx="50%" cy="50%" r="72%">
        <stop offset="60%" stopColor="#2a2a20" stopOpacity="0" />
        <stop offset="100%" stopColor="#2a2a20" stopOpacity="0.28" />
      </radialGradient>
      <pattern id="oc-ripples" width="90" height="26" patternUnits="userSpaceOnUse">
        <path d="M0 13 q 11 -8 22 0 t 22 0 t 22 0 t 22 0" fill="none" stroke="var(--water-ink)" strokeWidth="1" opacity="0.35" />
      </pattern>
    </defs>
  );
}

/** Sky, sun wash, distant misty hills and clouds — the cinematic backdrop behind both maps. */
export function Scenery({ w, h, horizon = 0.36 }: { w: number; h: number; horizon?: number }) {
  const hy = h * horizon;
  return (
    <g className="scenery">
      <rect width={w} height={hy + 40} fill="url(#oc-sky)" />
      <circle cx={w * 0.78} cy={hy * 0.55} r={hy * 0.9} fill="url(#oc-sun)" />
      <g filter="url(#oc-wobble-soft)" opacity="0.55">
        <path d={`M 0 ${hy} C ${w * 0.12} ${hy - 70}, ${w * 0.22} ${hy - 20}, ${w * 0.34} ${hy - 48} S ${w * 0.55} ${hy - 90}, ${w * 0.66} ${hy - 40} S ${w * 0.9} ${hy - 70}, ${w} ${hy - 30} L ${w} ${hy + 30} L 0 ${hy + 30} Z`} fill="url(#oc-hill-far)" />
      </g>
      <g filter="url(#oc-wobble-soft)" opacity="0.7">
        <path d={`M 0 ${hy + 10} C ${w * 0.15} ${hy - 25}, ${w * 0.3} ${hy + 5}, ${w * 0.45} ${hy - 18} S ${w * 0.7} ${hy - 30}, ${w * 0.82} ${hy - 8} S ${w * 0.95} ${hy - 20}, ${w} ${hy + 5} L ${w} ${hy + 40} L 0 ${hy + 40} Z`} fill="var(--hill-near)" />
      </g>
      <g className="clouds" filter="url(#oc-mist)" opacity="0.55">
        <ellipse cx={w * 0.2} cy={hy * 0.35} rx={110} ry={22} fill="var(--paper)" />
        <ellipse cx={w * 0.27} cy={hy * 0.3} rx={70} ry={18} fill="var(--paper)" />
        <ellipse cx={w * 0.6} cy={hy * 0.25} rx={130} ry={20} fill="var(--paper)" />
      </g>
      <rect x={0} y={hy + 20} width={w} height={40} fill="var(--paper)" opacity="0.18" filter="url(#oc-mist)" />
    </g>
  );
}

/** Painted island: sand ring, two land washes, highlight, a dark shore accent and a soft shadow on the water. */
export function Island({ cx, cy, r, muted = false }: { cx: number; cy: number; r: number; muted?: boolean }) {
  return (
    <g opacity={muted ? 0.72 : 1}>
      <ellipse cx={cx + 6} cy={cy + 14} rx={r * 1.15} ry={r * 0.8} fill="var(--water-ink)" opacity="0.25" filter="url(#oc-mist)" />
      <g filter="url(#oc-wobble)">
        <ellipse cx={cx} cy={cy + 6} rx={r * 1.12} ry={r * 0.82} fill="var(--sand)" opacity="0.92" />
        <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.72} fill="url(#oc-land)" />
        <ellipse cx={cx + r * 0.1} cy={cy + r * 0.12} rx={r * 0.78} ry={r * 0.5} fill="var(--forest)" opacity="0.35" filter="url(#oc-bleed)" />
        <ellipse cx={cx - r * 0.25} cy={cy - r * 0.2} rx={r * 0.45} ry={r * 0.28} fill="var(--sage-light)" opacity="0.6" filter="url(#oc-bleed)" />
        <path d={`M ${cx - r * 0.6} ${cy + r * 0.15} q ${r * 0.3} ${r * 0.25} ${r * 0.75} ${r * 0.05}`} fill="none" stroke="var(--forest)" strokeWidth="1.2" opacity="0.5" />
        {[0.35, -0.1, 0.5].map((k, i) => <path key={i} d={`M ${cx + r * k} ${cy - r * 0.05 + i * 6} l -4 10 l 8 0 Z`} fill="var(--forest)" opacity="0.7" />)}
      </g>
    </g>
  );
}

export function Compass({ x, y, size = 46 }: { x: number; y: number; size?: number }) {
  const s = size / 2;
  return (
    <g transform={`translate(${x} ${y})`} opacity="0.9">
      <circle r={s} fill="var(--paper)" stroke="var(--gold)" strokeWidth="1.5" />
      <circle r={s * 0.72} fill="none" stroke="var(--gold)" strokeWidth="0.6" opacity="0.6" />
      <path d={`M0 ${-s * 0.9} L${s * 0.18} 0 L0 ${s * 0.9} L${-s * 0.18} 0 Z`} fill="var(--terracotta)" />
      <path d={`M${-s * 0.9} 0 L0 ${-s * 0.18} L${s * 0.9} 0 L0 ${s * 0.18} Z`} fill="var(--gold)" />
      <text y={-s * 0.95 - 4} textAnchor="middle" fontSize="10" fill="var(--ink)" fontFamily="var(--serif)">N</text>
    </g>
  );
}

export function Grain() {
  return <rect width="100%" height="100%" filter="url(#oc-grain)" opacity="0.22" style={{ mixBlendMode: "multiply" }} />;
}

export function Vignette() {
  return <rect width="100%" height="100%" fill="url(#oc-vignette)" style={{ mixBlendMode: "multiply" }} />;
}
