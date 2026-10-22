import { Check } from 'lucide-react'
import { MeshBackdrop } from './ShieldMesh'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { SpotlightCard } from './SpotlightCard'

// Colours are the logo's three panels. They identify a section and never signal success or error.
const SECTIONS = [
  {
    emoji: '🥖',
    name: 'Bakery',
    blurb: 'Food-safe baking, every batch.',
    color: 'hsl(33 62% 50%)',
    glow: 'hsl(33 70% 50% / 0.35)',
    checks: ['Hairnet worn', 'Gloves on', 'Mask on', 'Apron on'],
  },
  {
    emoji: '🥩',
    name: 'Meat Shop',
    blurb: 'Clean handling at the counter.',
    color: 'hsl(352 58% 42%)',
    glow: 'hsl(352 65% 45% / 0.35)',
    checks: ['Hairnet worn', 'Gloves on', 'Mask on', 'Apron on'],
  },
  {
    emoji: '💂',
    name: 'Security',
    blurb: 'Guards in uniform and in position.',
    color: 'hsl(207 62% 52%)',
    glow: 'hsl(207 70% 52% / 0.35)',
    checks: ['Proper uniform', 'Weapon carried', 'Inside assigned duty zone'],
  },
]

export function SectionsShowcase() {
  return (
    <section id="sections" className="relative isolate overflow-hidden bg-ln-2 ln-mix-b py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10 opacity-80" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute left-[2%] top-1/3 size-[30rem] -z-10" aria-hidden />
      <div className="maroon-glow pointer-events-none parallax absolute left-1/2 top-1/3 size-[30rem] -translate-x-1/2 -z-10" aria-hidden />
      <div className="steel-glow pointer-events-none parallax absolute right-[2%] top-1/3 size-[30rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          onDark
          eyebrow="Sections"
          title="Built for the *three places* mistakes cost most"
          description="Each section has its own rules, its own supervisor and its own colour, taken straight from our logo."
        />
        <div className="mt-16 grid gap-6 [perspective:1400px] lg:grid-cols-3">
          {SECTIONS.map((s, i) => (
            <Reveal key={s.name} delay={i * 120} variant={i === 0 ? 'left' : i === 2 ? 'right' : 'zoom'}>
              <SpotlightCard
                tilt={9}
                className="glass h-full overflow-hidden rounded-3xl"
                style={{ boxShadow: `0 24px 60px -30px ${s.glow}` }}
              >
                <div className="h-1.5" style={{ background: s.color, boxShadow: `0 0 20px ${s.color}` }} />
                <div className="p-7">
                  <div className="flex items-center gap-4 [transform:translateZ(40px)]">
                    <span
                      className="flex size-14 items-center justify-center rounded-2xl text-3xl"
                      style={{ background: `color-mix(in srgb, ${s.color} 22%, transparent)`, boxShadow: `0 0 28px -6px ${s.color}` }}
                      aria-hidden
                    >
                      {s.emoji}
                    </span>
                    <div>
                      <h3 className="text-2xl font-semibold">{s.name}</h3>
                      <p className="text-sm text-ln-muted">{s.blurb}</p>
                    </div>
                  </div>
                  <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-ln-faint">What we check</p>
                  <ul className="mt-3 space-y-3 [transform:translateZ(24px)]">
                    {s.checks.map((c) => (
                      <li key={c} className="flex items-center gap-3 text-sm">
                        <span
                          className="flex size-5 shrink-0 items-center justify-center rounded-full"
                          style={{ background: `color-mix(in srgb, ${s.color} 30%, transparent)`, color: s.color }}
                        >
                          <Check className="size-3" aria-hidden />
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
