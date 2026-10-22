import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Reveal } from './Reveal'

/** Wraps `*important words*` in the brand-blue highlight. */
function renderTitle(title: string): ReactNode {
  return title.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
      <span key={i} className="hl">
        {part.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string
  /** Mark the important words with *asterisks*; they render in our blue. */
  title: string
  description?: string
  onDark?: boolean
  className?: string
}) {
  return (
    <Reveal variant="blur" className={cn('mx-auto max-w-3xl space-y-3 text-center', className)}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ln-accent">{eyebrow}</p>
      <h2 className="font-heading text-3xl font-bold text-ln-fg sm:text-4xl lg:text-5xl">{renderTitle(title)}</h2>
      {description && <p className="text-base leading-relaxed text-ln-muted sm:text-lg">{description}</p>}
    </Reveal>
  )
}
