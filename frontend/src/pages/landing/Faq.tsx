import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { MeshBackdrop } from './ShieldMesh'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { SpotlightCard } from './SpotlightCard'

const FAQS = [
  {
    q: 'Do we need to buy new cameras?',
    a: 'No. MallSentinel connects to the CCTV and IP cameras you already have and analyses their streams.',
  },
  {
    q: 'Does it record and store all our video?',
    a: 'No. Only snapshots or short clips of a detected violation are kept, together with their metadata. Continuous video is never stored.',
  },
  {
    q: 'Who decides on penalties?',
    a: 'People do. The AI agent suggests a penalty and drafts the brief, then the supervisor approves, modifies or waives it. Every decision is written to the audit ledger.',
  },
  {
    q: 'Who can see what?',
    a: 'Access follows role. Admins manage users, supervisors manage their own department, and employees can only see their own records.',
  },
  {
    q: 'Can staff create their own accounts?',
    a: 'No. There is no public sign-up. An admin creates supervisors and employees, and supervisors manage the employees in their own department.',
  },
  {
    q: 'Can it cover other departments later?',
    a: 'Yes. The system is designed to be extended to more departments, such as cleaning or warehouse, with their own SOPs.',
  },
]

function Item({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <SpotlightCard className="glass overflow-hidden rounded-2xl">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-ln-fg sm:px-6 sm:py-5"
        >
          {q}
          <ChevronDown
            className={cn('size-5 shrink-0 text-ln-accent transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h3>
      {/* grid-rows 0fr to 1fr animates the height without measuring; `invisible` hides the closed answer from the tab order */}
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-btn`}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className={cn('overflow-hidden', open ? 'visible' : 'invisible')}>
          <p className="px-5 pb-5 text-sm leading-relaxed text-ln-muted sm:px-6 sm:text-base">{a}</p>
        </div>
      </div>
    </SpotlightCard>
  )
}

export function Faq() {
  return (
    <section id="faq" className="relative isolate overflow-hidden bg-ln-2 ln-mix-a py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10 opacity-70" aria-hidden />
      <div className="teal-glow pointer-events-none parallax absolute -right-40 bottom-0 size-[34rem] -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute left-[10%] top-0 size-[24rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="steel-glow pointer-events-none parallax absolute -left-40 top-1/3 -z-10 size-[36rem]" aria-hidden />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading onDark eyebrow="FAQ" title="Questions we *hear most*" />
        <div className="mt-12 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} variant={i % 2 === 0 ? 'left' : 'right'} delay={i * 60}>
              <Item {...f} defaultOpen={i === 0} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
