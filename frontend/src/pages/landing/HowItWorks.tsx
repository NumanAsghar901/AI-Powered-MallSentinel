import { useEffect, useRef, type ReactNode } from 'react'
import { MeshBackdrop } from './ShieldMesh'
import { SectionHeading } from './SectionHeading'
import { SpotlightCard } from './SpotlightCard'
import { usePrefersReducedMotion } from './motion'

const STEPS = [
  { emoji: '📹', title: 'Connect your cameras', text: 'Point MallSentinel at your existing CCTV or IP camera streams. No new hardware.' },
  { emoji: '👁️', title: 'AI watches each section', text: 'Computer vision checks PPE, uniform, weapon and duty-zone rules as people work.' },
  { emoji: '📚', title: 'Agent finds the SOP clause', text: 'It matches the violation to your SOP, rates the severity and drafts the incident brief.' },
  { emoji: '🧑‍💼', title: 'Supervisor reviews', text: 'The supervisor sees the evidence, then approves, modifies or waives the suggested penalty.' },
  { emoji: '🔏', title: 'Decision is sealed', text: 'The outcome is written to the tamper-evident audit ledger, ready for any inspection.' },
]

/**
 * Adds `is-hit` while the item is on screen: the card slams in, then glows from all sides (see `.impact-*` in
 * index.css). The class is removed once the item has fully left the viewport, so the hit replays on the next pass.
 */
function ImpactItem({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-hit')
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) el.classList.add('is-hit')
        else if (!entry.isIntersecting) el.classList.remove('is-hit')
      },
      { threshold: [0, 0.45] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <li ref={ref} className={`impact-wrap ${className ?? ''}`}>
      {children}
    </li>
  )
}

export function HowItWorks() {
  const list = useRef<HTMLOListElement>(null)
  const reduced = usePrefersReducedMotion()

  // The glowing line draws as you scroll: --p goes 0 to 1 as the list passes the middle of the viewport.
  useEffect(() => {
    const el = list.current
    if (!el) return
    if (reduced) {
      el.style.setProperty('--p', '1')
      return
    }
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const p = (window.innerHeight * 0.6 - r.top) / r.height
      el.style.setProperty('--p', String(Math.max(0, Math.min(1, p))))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reduced])

  return (
    <section id="how-it-works" className="relative isolate overflow-hidden bg-ln-1 ln-mix-a py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="maroon-glow pointer-events-none parallax absolute -left-40 top-[40%] size-[34rem] -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute right-[10%] bottom-0 size-[28rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="steel-glow pointer-events-none parallax absolute -right-40 top-1/4 -z-10 size-[40rem]" aria-hidden />

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          onDark
          eyebrow="How it works"
          title="From *camera frame* to *signed-off decision*"
          description="Five steps, fully traceable. Humans stay in charge of every penalty."
        />

        <ol ref={list} className="relative mt-16 space-y-8 sm:space-y-10">
          {/* track + glowing fill that draws as you scroll */}
          <span aria-hidden className="absolute bottom-6 left-[1.6rem] top-6 w-px -ln-fg/10 sm:left-1/2 sm:-translate-x-1/2" />
          <span
            aria-hidden
            className="timeline-fill absolute bottom-6 left-[1.6rem] top-6 w-[3px] -translate-x-px rounded-full bg-gradient-to-b from-[hsl(190_90%_70%)] to-[hsl(207_66%_58%)] shadow-[0_0_16px_hsl(190_90%_60%),0_0_40px_hsl(190_90%_55%/0.5)] sm:left-1/2 sm:-translate-x-1/2"
          />
          {STEPS.map((s, i) => {
            const right = i % 2 === 1
            return (
              <ImpactItem key={s.title} className="relative grid grid-cols-[3.2rem_1fr] items-start gap-4 sm:grid-cols-2 sm:gap-0">
                <span
                  className="impact-node relative z-10 flex size-[3.2rem] items-center justify-center rounded-full border border-[hsl(190_70%_60%/0.6)] bg-[hsl(217_60%_14%)] text-2xl shadow-[0_0_28px_-4px_hsl(190_85%_50%/0.7)] sm:absolute sm:left-1/2 sm:top-3 sm:-translate-x-1/2"
                  aria-hidden
                >
                  {s.emoji}
                </span>
                <SpotlightCard
                  className={`impact-card glass rounded-2xl p-5 ${right ? 'sm:col-start-2 sm:ml-14' : 'sm:col-start-1 sm:mr-14'}`}
                >
                  <span className="impact-ring" aria-hidden />
                  <p className="text-xs font-semibold uppercase tracking-wider text-ln-accent">Step {i + 1}</p>
                  <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ln-muted">{s.text}</p>
                </SpotlightCard>
              </ImpactItem>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
