import { MeshBackdrop } from './ShieldMesh'
import { SectionHeading } from './SectionHeading'
import { SpotlightCard } from './SpotlightCard'

const FEATURES = [
  { emoji: '🧤', title: 'PPE detection', text: 'Hairnet, gloves, mask and apron checked on every worker in the Bakery and Meat Shop.' },
  { emoji: '💂', title: 'Uniform & weapon checks', text: 'Guards verified for proper uniform and a carried weapon, all shift long.' },
  { emoji: '📍', title: 'Duty-zone tracking', text: 'Know the moment a guard leaves their assigned zone, tracked frame to frame.' },
  { emoji: '🧠', title: 'AI agent that knows your SOPs', text: 'Retrieves the exact clause that was breached, so every finding cites a rule.' },
  { emoji: '🎚️', title: 'Severity classification', text: 'Low, Medium, High or Critical, rated consistently instead of by gut feeling.' },
  { emoji: '📝', title: 'Incident briefs, drafted', text: 'A clear write-up with time, place, clause and evidence, ready for review.' },
  { emoji: '⚡', title: 'Real-time alerts', text: 'Supervisor and employee notified within seconds, with a target of under ten.' },
  { emoji: '🔎', title: 'Evidence review', text: 'Snapshots and short clips with metadata, opened only through a secure endpoint.' },
  { emoji: '⚖️', title: 'Penalty workflow', text: 'The AI suggests; the supervisor approves, modifies or waives. People decide.' },
  { emoji: '📜', title: 'Tamper-evident ledger', text: 'Every decision is hash-chained. Entries cannot be edited or deleted afterwards.' },
  { emoji: '🔐', title: 'Role-based access', text: 'Admin, Supervisor and Employee each see exactly what they should, and no more.' },
  { emoji: '🔒', title: 'Privacy by design', text: 'Only violation snapshots and short clips are kept. Continuous video never is.' },
  { emoji: '📹', title: 'Your cameras, no new hardware', text: 'Connects to existing CCTV and IP cameras over standard RTSP streams.' },
  { emoji: '💬', title: 'Ask the compliance chatbot', text: 'Supervisors ask in plain language about violations, summaries and SOP details.' },
  { emoji: '👤', title: 'Employee history', text: 'Employees see only their own record, with strict data isolation.' },
  { emoji: '🧩', title: 'Built to extend', text: 'Add departments like cleaning or warehouse with their own SOPs later.' },
]

type Feature = (typeof FEATURES)[number]

function FeatureCard({ f }: { f: Feature }) {
  return (
    <SpotlightCard as="li" className="glass w-[18rem] shrink-0 rounded-2xl p-6 sm:w-[20rem]">
      <span className="flex size-12 items-center justify-center rounded-xl -ln-fg/[0.07] text-2xl shadow-inner" aria-hidden>
        {f.emoji}
      </span>
      <h3 className="mt-5 text-lg font-semibold text-ln-fg">{f.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ln-muted">{f.text}</p>
    </SpotlightCard>
  )
}

function CardRow({ items, hidden = false }: { items: Feature[]; hidden?: boolean }) {
  return (
    <ul className={hidden ? 'marquee-dup flex gap-5' : 'flex gap-5'} aria-hidden={hidden || undefined}>
      {items.map((f) => (
        <FeatureCard key={f.title} f={f} />
      ))}
    </ul>
  )
}

/** Two rows of cards drifting right to left at different speeds; they pause on hover. */
function Marquee({ items, duration }: { items: Feature[]; duration: number }) {
  return (
    <div className="marquee py-3">
      <div className="marquee-track" style={{ ['--dur' as string]: `${duration}s`, ['--gap' as string]: '1.25rem' }}>
        <CardRow items={items} />
        <CardRow items={items} hidden />
      </div>
    </div>
  )
}

export function Features() {
  const half = FEATURES.length / 2
  return (
    <section id="features" className="relative isolate overflow-hidden bg-ln-1 ln-mix-b py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10 opacity-70" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute -left-20 bottom-0 size-[34rem] -z-10" aria-hidden />
      <div className="maroon-glow pointer-events-none parallax absolute right-[30%] top-0 size-[30rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="steel-glow pointer-events-none parallax absolute -left-40 top-10 -z-10 size-[40rem]" aria-hidden />
      <div className="teal-glow pointer-events-none parallax absolute -right-40 bottom-0 -z-10 size-[40rem]" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          onDark
          eyebrow="Features"
          title="Everything from *camera frame* to *signed-off decision*"
          description="Sixteen capabilities in one connected workflow. Hover a card to pause the row."
        />
      </div>

      <div className="mt-14 space-y-4">
        <Marquee items={FEATURES.slice(0, half)} duration={85} />
        <Marquee items={FEATURES.slice(half)} duration={110} />
      </div>
    </section>
  )
}
