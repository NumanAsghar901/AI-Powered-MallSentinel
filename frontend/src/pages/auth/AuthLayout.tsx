import { Camera, ClipboardCheck, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '@/components/Logo'

const SECTIONS = [
  { name: 'Bakery', note: 'Hairnet, gloves, mask, apron', color: 'bg-section-bakery' },
  { name: 'Meat Shop', note: 'Hairnet, gloves, mask, apron', color: 'bg-section-meat' },
  { name: 'Security', note: 'Uniform, weapon, duty zone', color: 'bg-section-security' },
]

const POINTS = [
  { icon: Camera, text: 'Works on your existing CCTV cameras' },
  { icon: ClipboardCheck, text: 'Checks every SOP, every shift' },
  { icon: ScrollText, text: 'Tamper-evident audit trail for each decision' },
]

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
      {/* Brand panel */}
      <aside className="relative isolate flex flex-col justify-between overflow-hidden bg-sidebar px-6 py-6 text-sidebar-foreground sm:px-10 lg:px-14 lg:py-12">
        {/* static glows and grid: no animation on the sign-in pages */}
        <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
        <div className="teal-glow absolute -left-32 -top-32 -z-10 size-[30rem]" aria-hidden />
        <div className="steel-glow absolute -bottom-40 -right-24 -z-10 size-[30rem]" aria-hidden />
        <Link to="/" className="flex items-center gap-3" aria-label="MallSentinel home page">
          <LogoMark className="size-12" />
          <Wordmark onDark className="text-xl" />
        </Link>

        <div className="hidden max-w-xl space-y-8 py-12 lg:block">
          <div className="space-y-4">
            <h1 className="font-heading text-3xl font-bold leading-tight text-white xl:text-4xl">
              AI-powered compliance monitoring for malls &amp; marts
            </h1>
            <p className="text-base text-sidebar-muted">
              MallSentinel watches your camera feeds, flags SOP violations as they happen, and gives supervisors
              the evidence to decide fairly.
            </p>
          </div>

          <ul className="space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-[hsl(190_70%_70%)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-3">
            {SECTIONS.map((s) => (
              <div key={s.name} className="overflow-hidden rounded-lg border border-sidebar-border bg-sidebar-accent/40">
                <div className={`h-1 ${s.color}`} />
                <div className="space-y-1 p-3">
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-sidebar-muted">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="hidden text-xs text-sidebar-muted lg:block">
          FAST-NUCES Chiniot-Faisalabad · Final Year Project 2026
        </p>
      </aside>

      {/* Form panel */}
      <main className="relative isolate flex items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-8">
        <div className="teal-glow absolute -right-32 -top-32 -z-10 size-[28rem] opacity-70" aria-hidden />
        <div className="amber-glow absolute -bottom-32 -left-24 -z-10 size-[24rem]" aria-hidden />
        <div className="w-full max-w-md animate-fade-in">{children}</div>
      </main>
    </div>
  )
}
