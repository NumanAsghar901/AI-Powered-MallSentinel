import { ArrowRight, LogIn, Play } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/types'
import { HeroVisual } from './HeroVisual'
import { MeshBackdrop } from './ShieldMesh'

const TRUST = [
  { emoji: '📹', text: 'Works on your existing cameras' },
  { emoji: '🔒', text: 'No continuous video stored' },
  { emoji: '📜', text: 'Tamper-evident audit trail' },
]

export function Hero() {
  const { user } = useAuth()
  return (
    <section id="home" className="relative isolate overflow-hidden bg-ln-1 ln-mix-a text-ln-fg">
      {/* backdrop: engineered grid, low-poly mesh, teal and steel glows */}
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute -bottom-40 right-[8%] size-[34rem] -z-10" aria-hidden />
      <div className="maroon-glow pointer-events-none parallax absolute left-[30%] top-[40%] size-[26rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="teal-glow pointer-events-none parallax absolute -left-40 -top-48 -z-10 size-[44rem]" aria-hidden />
      <div className="steel-glow pointer-events-none parallax absolute -right-32 top-10 -z-10 size-[44rem]" aria-hidden />
      <div className="teal-glow pointer-events-none parallax absolute bottom-[-18rem] left-1/3 -z-10 size-[36rem] opacity-60" aria-hidden />

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-6 px-4 pb-16 pt-[7.5rem] sm:px-6 sm:pt-[8.5rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-4 lg:px-8 lg:pb-24 lg:pt-[9rem]">
        <div className="relative z-10 min-w-0 space-y-8">
          <p className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium sm:text-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[hsl(190_90%_60%)] opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-[hsl(190_90%_60%)]" />
            </span>
            AI-powered compliance monitoring
          </p>

          <h1 className="font-heading text-[2.6rem] font-bold leading-[1.04] tracking-tight sm:text-6xl xl:text-7xl">
            <span className="block">Every camera.</span>
            <span className="block">Every SOP.</span>
            <span className="shimmer-text block pb-1">Every shift.</span>
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-ln-muted sm:text-lg">
            MallSentinel watches your existing CCTV for hygiene and security violations in your bakery, meat shop and
            guard posts. It finds the right SOP clause, drafts the incident brief, and hands your supervisor the
            evidence to decide fairly.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to={user ? ROLE_HOME[user.role] : '/login'}
              className="beam-btn inline-flex h-14 items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold"
            >
              <LogIn className="size-5" aria-hidden /> {user ? 'Open my dashboard' : 'Sign In'}
            </Link>
            <a
              href="#demo"
              className="glass inline-flex h-14 items-center justify-center gap-2 rounded-xl px-7 text-base font-semibold transition-colors hover:-ln-fg/10"
            >
              <Play className="size-4 fill-current" aria-hidden /> Watch it work <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>

          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ln-muted">
            {TRUST.map((t) => (
              <li key={t.text} className="flex items-center gap-2">
                <span aria-hidden>{t.emoji}</span> {t.text}
              </li>
            ))}
          </ul>
        </div>

        {/* 3D scene + two floating glass HUD cards */}
        <div className="relative mx-auto aspect-[5/6] w-full min-w-0 max-w-[34rem] overflow-hidden sm:aspect-square lg:max-w-none lg:overflow-visible">
          <HeroVisual />

          <div
            className="glass-navy float absolute left-0 top-[1%] w-[14rem] rounded-xl p-3 sm:top-[6%] sm:w-64 sm:p-3.5"
            style={{ '--float-delay': '0s' } as CSSProperties}
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-lg" aria-hidden>
                🚨
              </span>
              <div className="min-w-0 space-y-0.5 text-left">
                <p className="text-sm font-semibold">Missing gloves</p>
                <p className="text-xs text-[hsl(213_26%_79%)]">Bakery · Camera 03 · High severity</p>
                <p className="text-xs text-[hsl(190_75%_71%)]">SOP clause found · brief drafted</p>
              </div>
            </div>
          </div>

          <div
            className="glass-navy float absolute bottom-[8%] right-0 hidden w-[14.5rem] rounded-xl p-3.5 sm:block sm:w-60"
            style={{ '--float-delay': '-3s' } as CSSProperties}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-lg" aria-hidden>
                ✅
              </span>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold">Meat Shop · 4/4 PPE</p>
                <p className="text-xs text-[hsl(213_26%_79%)]">Hairnet, gloves, mask, apron</p>
              </div>
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-0 text-center text-xs text-ln-faint">Illustrative example</p>
        </div>
      </div>
    </section>
  )
}
