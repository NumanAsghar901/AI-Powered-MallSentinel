import { Lock, type LucideIcon } from 'lucide-react'
import { SpotlightCard } from '@/pages/landing/SpotlightCard'

/** A planned feature, shown honestly as planned (no fake numbers). */
export function SoonCard({ icon: Icon, title, text, phase }: { icon: LucideIcon; title: string; text: string; phase: string }) {
  return (
    <SpotlightCard tilt={4} className="h-full rounded-2xl border border-dashed bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Lock className="size-3" aria-hidden /> {phase}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </SpotlightCard>
  )
}
