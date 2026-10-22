import { cn } from '@/lib/utils'

/** Small seeded PRNG so the polygon pattern is identical on every render and every machine. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Pt = readonly [number, number]

/** Flat-top shield with curved sides meeting in a point: the outline of the logo's shield. */
const SHIELD_PATH = 'M28 40 H372 V232 C372 332 298 404 200 452 C102 404 28 332 28 232 Z'
const SHIELD_LEFT = 28
const SHIELD_WIDTH = 344

// The logo's three panels: maroon (meat), amber (bakery), steel-blue (security).
const PANEL_HUES = [
  { h: 352, s: 55 },
  { h: 33, s: 62 },
  { h: 207, s: 52 },
] as const

interface Facet {
  points: string
  fill: string
  opacity: number
}

function buildShield(): { facets: Facet[]; nodes: Pt[] } {
  const rnd = mulberry32(11)
  const cols = 8
  const rows = 10
  // The grid overshoots the shield on every side; the clip path trims it, so jitter never leaves gaps.
  const x0 = -10
  const x1 = 410
  const y0 = 12
  const y1 = 486

  const grid: Pt[][] = []
  for (let j = 0; j <= rows; j++) {
    const row: Pt[] = []
    for (let i = 0; i <= cols; i++) {
      const x = x0 + ((x1 - x0) * i) / cols + (rnd() - 0.5) * 30
      const y = y0 + ((y1 - y0) * j) / rows + (rnd() - 0.5) * 30
      row.push([x, y])
    }
    grid.push(row)
  }

  const facets: Facet[] = []
  const nodes: Pt[] = []
  const shade = (cx: number, cy: number): Facet['fill'] => {
    // Light from the top-left: facets there are brighter, the bottom-right sinks into navy.
    const light = 1 - (cx / 400 + cy / 480) / 2
    const panel = Math.min(2, Math.max(0, Math.floor(((cx - SHIELD_LEFT) / SHIELD_WIDTH) * 3)))
    const tinted = rnd() < 0.14
    if (tinted) {
      const { h, s } = PANEL_HUES[panel] ?? PANEL_HUES[0]
      return `hsl(${h} ${Math.round(s * 0.75)}% ${22 + rnd() * 10 + light * 6}%)`
    }
    const hue = 196 + rnd() * 16
    return `hsl(${hue.toFixed(0)} ${(52 + rnd() * 20).toFixed(0)}% ${(11 + rnd() * 14 + light * 14).toFixed(1)}%)`
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = grid[j]?.[i]
      const b = grid[j]?.[i + 1]
      const c = grid[j + 1]?.[i]
      const d = grid[j + 1]?.[i + 1]
      if (!a || !b || !c || !d) continue
      const tris: [Pt, Pt, Pt][] = (i + j) % 2 === 0 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]]
      for (const [p, q, r] of tris) {
        const cx = (p[0] + q[0] + r[0]) / 3
        const cy = (p[1] + q[1] + r[1]) / 3
        facets.push({
          points: [p, q, r].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
          fill: shade(cx, cy),
          opacity: 0.8 + rnd() * 0.2,
        })
      }
      if (rnd() < 0.22) nodes.push(a)
    }
  }
  return { facets, nodes }
}

const SHIELD = buildShield()

/** The hero art: a low-poly shield. Decorative (aria-hidden); meaning is carried by the surrounding copy. */
export function ShieldMesh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 480" className={cn('h-auto w-full', className)} aria-hidden focusable="false">
      <defs>
        <clipPath id="ms-shield-clip">
          <path d={SHIELD_PATH} />
        </clipPath>
        <linearGradient id="ms-shield-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(190 85% 70%)" stopOpacity="0.9" />
          <stop offset="1" stopColor="hsl(194 83% 35%)" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <g clipPath="url(#ms-shield-clip)">
        {SHIELD.facets.map((f, idx) => (
          <polygon
            key={idx}
            points={f.points}
            fill={f.fill}
            fillOpacity={f.opacity}
            stroke="hsl(190 80% 80%)"
            strokeOpacity="0.14"
            strokeWidth="0.7"
          />
        ))}
        {SHIELD.nodes.map(([x, y], idx) => (
          <circle key={idx} cx={x} cy={y} r="2.4" fill="hsl(190 90% 78%)" fillOpacity="0.85" />
        ))}
      </g>
      <path d={SHIELD_PATH} fill="none" stroke="url(#ms-shield-edge)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export { MeshBackdrop } from './NetworkBackdrop'
