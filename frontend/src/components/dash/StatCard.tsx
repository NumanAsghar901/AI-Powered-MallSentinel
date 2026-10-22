import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { SpotlightCard } from '@/pages/landing/SpotlightCard'
import { CountUp } from './CountUp'

/** Logo-palette tones for icon chips. */
export const TONES = {
  teal: '190 80% 42%',
  steel: '207 62% 48%',
  amber: '33 70% 50%',
  maroon: '352 60% 48%',
  danger: '0 72% 52%',
} as const
export type Tone = keyof typeof TONES

export function StatCard({
  icon: Icon,
  label,
  value,
  text,
  hint,
  tone = 'teal',
  to,
  loading = false,
}: {
  icon: LucideIcon
  label: string
  /** Numeric value (counts up). Use `text` instead for words. */
  value?: number
  text?: ReactNode
  hint?: string
  tone?: Tone
  to?: string
  loading?: boolean
}) {
  const hsl = TONES[tone]
  const body = (
    <SpotlightCard tilt={5} className="h-full rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex size-11 items-center justify-center rounded-xl"
          style={{ background: `hsl(${hsl} / 0.16)`, color: `hsl(${hsl})`, boxShadow: `0 0 26px -6px hsl(${hsl} / 0.75)` }}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {to && <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">View →</span>}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 font-heading text-3xl font-bold tracking-tight">
        {loading ? (
          <Skeleton className="mt-2 h-8 w-16" />
        ) : value !== undefined ? (
          <CountUp to={value} />
        ) : (
          <span className="text-2xl">{text}</span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </SpotlightCard>
  )
  return to ? (
    <Link to={to} className="group block rounded-2xl focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  )
}
