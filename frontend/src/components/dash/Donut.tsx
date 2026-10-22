import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { CountUp } from './CountUp'

export interface Segment {
  label: string
  value: number
  color: string
}

/** Donut that draws itself in; hovering a slice or a legend row highlights it and shows its share in the middle. */
export function Donut({
  segments,
  centerLabel,
  size = 220,
  layout = 'row',
}: {
  segments: Segment[]
  centerLabel: string
  size?: number
  layout?: 'row' | 'stack'
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const stroke = 26
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 5 : 0
  let offset = 0
  const shown = active !== null ? segments[active] : undefined

  return (
    <div className={cn('flex flex-col items-center gap-6', layout === 'row' && 'sm:flex-row sm:gap-8')}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" width={size} height={size} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s, i) => {
              const len = (s.value / total) * c
              const dash = Math.max(0, len - gap)
              const el = (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === i ? stroke + 6 : stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${ready ? dash : 0} ${c}`}
                  strokeDashoffset={-offset}
                  opacity={active === null || active === i ? 1 : 0.3}
                  style={{
                    transition: 'stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1), stroke-width .2s, opacity .2s',
                    filter: active === i ? `drop-shadow(0 0 8px ${s.color})` : undefined,
                    cursor: 'pointer',
                  }}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                />
              )
              offset += len
              return el
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading text-4xl font-bold">
            {shown ? <CountUp to={shown.value} duration={400} /> : <CountUp to={total} />}
          </span>
          <span className="max-w-[8rem] text-xs text-muted-foreground">{shown ? shown.label : centerLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {segments.map((s, i) => (
          <li key={s.label}>
            <button
              type="button"
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                active === i ? 'bg-accent' : 'hover:bg-accent/60',
              )}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
              <span className="flex-1 truncate font-medium">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.value} · {total ? Math.round((s.value / total) * 100) : 0}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
