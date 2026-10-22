import { useEffect, useRef, useState } from 'react'
import { MeshBackdrop } from './ShieldMesh'
import { Reveal } from './Reveal'
import { SpotlightCard } from './SpotlightCard'
import { usePrefersReducedMotion } from './motion'

// Design targets from the project SRS, not measured results. The page says so.
const STATS = [
  { to: 3, prefix: '', suffix: '', label: 'sections covered', note: 'Bakery, Meat Shop, Security' },
  { to: 4, prefix: '', suffix: '', label: 'PPE checks per worker', note: 'Hairnet, gloves, mask, apron' },
  { to: 10, prefix: '≤ ', suffix: ' s', label: 'alert target', note: 'From violation to supervisor' },
  { to: 0, prefix: '', suffix: ' h', label: 'continuous video stored', note: 'Snapshots and short clips only' },
]

function CountUp({ to, prefix, suffix }: { to: number; prefix: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(reduced ? to : 0)

  useEffect(() => {
    if (reduced) {
      setValue(to)
      return
    }
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setValue(to)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 1400)
          setValue(Math.round(to * (1 - Math.pow(1 - t, 3)))) // ease-out
          if (t < 1) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [to, reduced])

  return (
    <span ref={ref}>
      <span aria-hidden>
        {prefix}
        {value}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {to}
        {suffix}
      </span>
    </span>
  )
}

export function Stats() {
  return (
    <section aria-label="Key figures" className="relative isolate overflow-hidden bg-ln-1 ln-mix-c py-20 text-ln-fg sm:py-24">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute -left-24 top-0 size-[28rem] -z-10" aria-hidden />
      <div className="steel-glow pointer-events-none parallax absolute -right-24 bottom-0 size-[30rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="teal-glow pointer-events-none parallax absolute left-1/2 top-1/2 -z-10 size-[50rem] -translate-x-1/2 -translate-y-1/2 opacity-50" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 100} variant="zoom" className="h-full">
              <SpotlightCard className="glass flex h-full flex-col rounded-2xl p-5 text-center sm:p-7">
                <dd className="order-first font-heading text-4xl font-bold text-ln-accent sm:text-5xl">
                  <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
                </dd>
                <dt className="mt-3 text-sm font-semibold">{s.label}</dt>
                <dd className="mt-1 text-xs text-ln-faint">{s.note}</dd>
              </SpotlightCard>
            </Reveal>
          ))}
        </dl>
        <p className="mt-6 text-center text-xs text-ln-faint">
          Design targets from the project requirements specification, not measured results.
        </p>
      </div>
    </section>
  )
}
