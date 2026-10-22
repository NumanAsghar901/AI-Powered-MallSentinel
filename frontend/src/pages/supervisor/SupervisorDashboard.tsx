import { useQuery } from '@tanstack/react-query'
import { Bell, ClipboardCheck, FileBarChart, Moon, Sun, Sunset, UserCheck, UserPlus, UserX, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DashHero, heroName } from '@/components/dash/DashHero'
import { SectionChip } from '@/components/dash/sections'
import { SelfCheck } from '@/components/dash/SelfCheck'
import { SoonCard } from '@/components/dash/SoonCard'
import { StatCard } from '@/components/dash/StatCard'
import { EmptyState } from '@/components/StateViews'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { greeting, todayLabel } from '@/lib/format'
import type { User } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { Reveal } from '@/pages/landing/Reveal'

const SHIFTS = [
  { key: 'morning', label: 'Morning', icon: Sun, color: 'hsl(40 85% 52%)' },
  { key: 'evening', label: 'Evening', icon: Sunset, color: 'hsl(20 80% 55%)' },
  { key: 'night', label: 'Night', icon: Moon, color: 'hsl(222 60% 60%)' },
] as const

function ShiftBars({ team }: { team: User[] }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true)) // bars grow in after mount
    return () => cancelAnimationFrame(id)
  }, [])
  const rows = [...SHIFTS.map((s) => ({ ...s, n: team.filter((u) => u.shift === s.key).length })), { key: 'none', label: 'Not set', icon: Users, color: 'hsl(215 16% 55%)', n: team.filter((u) => !u.shift).length }]
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <ul className="mt-5 space-y-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              <r.icon className="size-4" style={{ color: r.color }} aria-hidden /> {r.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{r.n}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-1000 ease-out"
              style={{ width: on ? `${(r.n / max) * 100}%` : '0%', background: r.color, boxShadow: `0 0 12px ${r.color}` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SupervisorDashboard() {
  const { user } = useAuth()
  const team = useQuery({ queryKey: ['dash-team'], queryFn: () => api.employees.list({ page_size: 100, sort: 'full_name', order: 'asc' }) })
  if (!user) return null
  const firstName = user.full_name.split(' ')[0] ?? ''
  const all = team.data?.items ?? []
  const activeTeam = all.filter((u) => u.status === 'active')
  const disabled = all.filter((u) => u.status === 'disabled').length
  const shiftsCovered = new Set(activeTeam.map((u) => u.shift).filter(Boolean)).size

  return (
    <>
      <DashHero
        eyebrow={todayLabel()}
        title={<>{greeting()}, {heroName(firstName)}</>}
        subtitle="Your team and your section at a glance."
        actions={
          <>
            <Link to="/supervisor/employees?new=1" className="beam-btn inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <UserPlus className="size-4" aria-hidden /> Add employee
            </Link>
            <Link to="/supervisor/employees" className="glass-navy inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors hover:bg-white/10">
              <Users className="size-4" aria-hidden /> Manage team
            </Link>
          </>
        }
        aside={<SectionChip department={user.department} />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Users, label: 'Team members', value: activeTeam.length, hint: 'Active in your section', tone: 'teal', to: '/supervisor/employees' },
          { icon: UserCheck, label: 'On a shift', value: activeTeam.filter((u) => u.shift).length, hint: 'Have a shift assigned', tone: 'steel', to: '/supervisor/employees' },
          { icon: Sun, label: 'Shifts covered', value: shiftsCovered, hint: 'Morning, evening, night', tone: 'amber', to: undefined },
          { icon: UserX, label: 'Disabled', value: disabled, hint: 'Cannot sign in', tone: 'danger', to: '/supervisor/employees' },
        ].map((c, i) => (
          <Reveal key={c.label} variant="zoom" delay={i * 70}>
            <StatCard icon={c.icon} label={c.label} value={c.value} loading={team.isPending} hint={c.hint} tone={c.tone as 'teal'} {...(c.to ? { to: c.to } : {})} />
          </Reveal>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-5">
        <Reveal variant="left" className="lg:col-span-2">
          <div className="h-full rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Shift coverage</h2>
            <p className="text-sm text-muted-foreground">Active team members per shift.</p>
            {team.isPending ? <Skeleton className="mt-5 h-40 w-full" /> : <ShiftBars team={activeTeam} />}
          </div>
        </Reveal>
        <Reveal variant="right" className="lg:col-span-3">
          <div className="h-full rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Your team</h2>
              <Link to="/supervisor/employees" className="text-sm font-medium text-brand-teal hover:underline dark:text-[hsl(190_80%_68%)]">
                Open →
              </Link>
            </div>
            {team.isPending ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : activeTeam.length === 0 ? (
              <EmptyState title="No team members yet" description="Add your first employee to get started." className="py-8" />
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {activeTeam.slice(0, 8).map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(u.full_name)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.full_name}</p>
                      <p className={cn('truncate text-xs capitalize text-muted-foreground')}>{u.designation ?? 'Employee'}{u.shift ? ` · ${u.shift}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="rounded-2xl border bg-card p-5 sm:p-6">
          <SelfCheck userId={user.id} department={user.department} title="Section walk-through" />
        </div>
      </Reveal>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
        <Reveal><SoonCard icon={Bell} title="Live alerts" text="Real-time violation alerts from your section's cameras." phase="Phase 5" /></Reveal>
        <Reveal delay={80}><SoonCard icon={ClipboardCheck} title="Penalty review" text="Review evidence, then approve, modify or waive." phase="Phase 7" /></Reveal>
        <Reveal delay={160}><SoonCard icon={FileBarChart} title="Reports" text="Compliance summaries and exports for your section." phase="Phase 7" /></Reveal>
      </div>
    </>
  )
}
