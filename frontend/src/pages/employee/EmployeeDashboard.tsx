import { useQuery } from '@tanstack/react-query'
import { Bell, BellRing, ClipboardCheck, History, MapPin, MoonStar, ScrollText, Scale, ShieldAlert, ShieldCheck, Sun, Sunset, UserCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DashHero, heroName } from '@/components/dash/DashHero'
import { SectionChip } from '@/components/dash/sections'
import { SelfCheck } from '@/components/dash/SelfCheck'
import { SoonCard } from '@/components/dash/SoonCard'
import { SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { StatCard } from '@/components/dash/StatCard'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { greeting, timeAgo, todayLabel } from '@/lib/format'
import { Reveal } from '@/pages/landing/Reveal'
import { SpotlightCard } from '@/pages/landing/SpotlightCard'

const STEPS = [
  { icon: BellRing, title: 'A camera flags it', text: 'The system spots a missing item or a zone breach and finds the SOP clause that applies.' },
  { icon: Bell, title: 'You and your supervisor are alerted', text: 'Both of you see the alert within seconds.' },
  { icon: ClipboardCheck, title: 'Your supervisor reviews the evidence', text: 'They look at the snapshot and decide. Nothing is automatic.' },
  { icon: Scale, title: 'The decision is recorded', text: 'Approved, changed or waived, it goes into a tamper-evident record you can see.' },
]

const SHIFT_ICON = { morning: Sun, evening: Sunset, night: MoonStar } as const

export function EmployeeDashboard() {
  const { user } = useAuth()
  const penalties = useQuery({ queryKey: ['my-penalties', 'dash'], queryFn: () => api.penalties.mine({ page_size: 1 }) })
  if (!user) return null
  const penaltyCount = penalties.data?.total ?? 0
  const latest = penalties.data?.items[0]
  const firstName = user.full_name.split(' ')[0] ?? ''
  const ShiftIcon = user.shift ? SHIFT_ICON[user.shift] : Sun

  return (
    <>
      <DashHero
        eyebrow={todayLabel()}
        title={<>{greeting()}, {heroName(firstName)}</>}
        subtitle="Your section, your shift and your record, all in one place."
        actions={
          <>
            <SectionChip department={user.department} />
            {user.shift && (
              <span className="glass-navy inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium capitalize">
                <ShiftIcon className="size-4 text-[hsl(190_80%_70%)]" aria-hidden /> {user.shift} shift
              </span>
            )}
          </>
        }
        aside={
          <Link to="/employee/penalties" className="glass-navy relative block w-full max-w-xs overflow-hidden rounded-2xl p-5 transition-colors hover:bg-white/10 lg:w-72">
            <div className="teal-glow pointer-events-none absolute -right-10 -top-10 size-40" aria-hidden />
            <div className="relative flex items-start gap-4">
              <span className="float flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[hsl(190_80%_42%/0.2)] text-[hsl(190_90%_72%)] shadow-[0_0_30px_-4px_hsl(190_90%_55%)]">
                {penaltyCount === 0 ? <ShieldCheck className="size-8" aria-hidden /> : <ShieldAlert className="size-8" aria-hidden />}
              </span>
              <div>
                {penalties.isPending ? (
                  <p className="font-semibold">Checking your record…</p>
                ) : penaltyCount === 0 ? (
                  <>
                    <p className="font-semibold">Clean record</p>
                    <p className="mt-1 text-xs text-[hsl(213_26%_78%)]">No penalties have been issued to you.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">
                      {penaltyCount} {penaltyCount === 1 ? 'penalty' : 'penalties'} on record
                    </p>
                    {latest && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[hsl(213_26%_78%)]">
                        Latest: <SeverityBadge severity={latest.severity} /> {latest.reason_label}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-[hsl(190_75%_72%)]">View details →</p>
                  </>
                )}
              </div>
            </div>
          </Link>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: MapPin, label: 'Your section', text: user.department?.name ?? '—', hint: user.assigned_area ?? 'Area not assigned yet', tone: 'teal' },
          { icon: ShiftIcon, label: 'Shift', text: <span className="capitalize">{user.shift ?? 'Not set'}</span>, hint: user.designation ?? 'No designation set', tone: 'amber' },
          { icon: UserCircle, label: 'Employee code', text: user.employee_code ?? '—', hint: user.email, tone: 'steel' },
          { icon: History, label: 'Last sign-in', text: timeAgo(user.last_login_at), hint: 'On this account', tone: 'maroon' },
        ].map((c, i) => (
          <Reveal key={c.label} variant="zoom" delay={i * 70}>
            <StatCard icon={c.icon} label={c.label} text={c.text} hint={c.hint} tone={c.tone as 'teal'} />
          </Reveal>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-5">
        <Reveal variant="left" className="lg:col-span-3">
          <div className="flex h-full items-center rounded-2xl border bg-card p-5 sm:p-6">
            <div className="w-full">
            <SelfCheck userId={user.id} department={user.department} title="Pre-shift self-check" />
            </div>
          </div>
        </Reveal>
        <Reveal variant="right" className="lg:col-span-2">
          <div className="h-full rounded-2xl border bg-card p-5 sm:p-6">
            <h2 className="font-semibold">If something is flagged</h2>
            <ol className="relative mt-4 space-y-4">
              <span aria-hidden className="absolute bottom-3 left-[1.15rem] top-3 w-px bg-border" />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-3">
                  <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-[hsl(190_80%_40%)] dark:text-[hsl(190_80%_68%)]">
                    <s.icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground">{i + 1}. </span>
                      {s.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Reveal>
          <Link to="/employee/penalties" className="block h-full rounded-2xl">
            <SpotlightCard tilt={4} className="h-full rounded-2xl border bg-card p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[hsl(352_60%_48%/0.16)] text-[hsl(352_60%_48%)]">
                <ShieldAlert className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">My penalties</h3>
              <p className="mt-1 text-sm text-muted-foreground">Every penalty issued to you, with the details. →</p>
            </SpotlightCard>
          </Link>
        </Reveal>
        <Reveal delay={80}>
          <Link to="/employee/profile" className="block h-full rounded-2xl">
            <SpotlightCard tilt={4} className="h-full rounded-2xl border bg-card p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[hsl(190_80%_42%/0.16)] text-[hsl(190_80%_42%)]">
                <UserCircle className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">My profile</h3>
              <p className="mt-1 text-sm text-muted-foreground">See the details your supervisor keeps about you. →</p>
            </SpotlightCard>
          </Link>
        </Reveal>
        <Reveal delay={80}>
          <SoonCard icon={Bell} title="My alerts" text="Be told the moment something involving you is flagged." phase="Phase 5" />
        </Reveal>
        <Reveal delay={160}>
          <SoonCard icon={ScrollText} title="SOPs for my section" text="The procedures you are checked against." phase="Phase 3" />
        </Reveal>
      </div>
    </>
  )
}
