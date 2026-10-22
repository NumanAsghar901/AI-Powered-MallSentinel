import type { ReactNode } from 'react'
import { MeshBackdrop } from '@/pages/landing/ShieldMesh'

/** Navy banner with the interactive web behind it (same look in light and dark). */
export function DashHero({
  eyebrow,
  title,
  subtitle,
  actions,
  aside,
}: {
  eyebrow: string
  title: ReactNode
  subtitle: string
  actions?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-sidebar p-6 text-white shadow-[0_24px_60px_-30px_hsl(190_85%_40%/0.6)] sm:p-8">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-[hsl(190_80%_72%)]" />
      <div className="teal-glow pointer-events-none absolute -left-24 -top-32 -z-10 size-[26rem] opacity-90" aria-hidden />
      <div className="steel-glow pointer-events-none absolute -bottom-40 right-0 -z-10 size-[28rem]" aria-hidden />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(190_75%_68%)]">{eyebrow}</p>
          <h1 className="font-heading text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
          <p className="max-w-xl text-sm text-[hsl(213_26%_80%)] sm:text-base">{subtitle}</p>
          {actions && <div className="flex flex-wrap gap-3 pt-2">{actions}</div>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </section>
  )
}

export const heroName = (name: string) => <span className="shimmer-text on-dark">{name}</span>
