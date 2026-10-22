import { useQueries, useQuery } from '@tanstack/react-query'
import { Camera, FileText, Radar, ShieldCheck, UserCog, UserPlus, UserX, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleBadge } from '@/components/Badges'
import { DashHero, heroName } from '@/components/dash/DashHero'
import { Donut, type Segment } from '@/components/dash/Donut'
import { SoonCard } from '@/components/dash/SoonCard'
import { StatCard } from '@/components/dash/StatCard'
import { EmptyState } from '@/components/StateViews'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { greeting, timeAgo, todayLabel } from '@/lib/format'
import type { User, UserListParams } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { Reveal } from '@/pages/landing/Reveal'

const SECTION_COLOR: Record<string, string> = {
  bakery: 'hsl(33 70% 52%)',
  meat_shop: 'hsl(352 62% 48%)',
  security: 'hsl(207 66% 54%)',
}

function useCount(key: string, params: UserListParams) {
  return useQuery({
    queryKey: ['dash-count', key],
    queryFn: async () => (await api.users.list({ page_size: 1, ...params })).total,
  })
}

function StatusChip() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000, retry: false })
  const ok = health.isSuccess
  const label = health.isPending ? 'Checking API…' : ok ? `API online · ${health.data.ms} ms` : 'API unreachable'
  return (
    <span className="glass-navy inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium" role="status">
      <span className="relative flex size-2.5">
        {ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', ok ? 'bg-emerald-400' : health.isPending ? 'bg-amber-300' : 'bg-red-400')} />
      </span>
      {label}
    </span>
  )
}

function PersonRow({ user, meta }: { user: User; meta: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initials(user.full_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{[user.department?.name, meta].filter(Boolean).join(' · ')}</p>
      </div>
      <RoleBadge role={user.role} />
    </li>
  )
}

function ActivityCard() {
  const [tab, setTab] = useState<'signins' | 'newest'>('signins')
  const signins = useQuery({
    queryKey: ['dash-signins'],
    queryFn: () => api.users.list({ page_size: 6, sort: 'last_login_at', order: 'desc', status: 'active' }),
  })
  const newest = useQuery({
    queryKey: ['dash-newest'],
    queryFn: () => api.users.list({ page_size: 6, sort: 'created_at', order: 'desc', status: 'active' }),
  })
  const q = tab === 'signins' ? signins : newest
  const items = (q.data?.items ?? []).filter((u) => tab === 'newest' || u.last_login_at)

  return (
    <div className="h-full rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Activity</h2>
        <div className="flex w-full rounded-lg bg-muted p-1 text-sm sm:inline-flex sm:w-auto" role="tablist" aria-label="Activity view">
          {(
            [
              ['signins', 'Recent sign-ins'],
              ['newest', 'Newest members'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('flex-1 rounded-md px-3 py-1.5 font-medium transition-all sm:flex-none', tab === id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-4 space-y-1" key={tab}>
        {q.isPending ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : items.length === 0 ? (
          <EmptyState title="Nothing yet" description="Activity shows up here as people sign in." className="py-8" />
        ) : (
          items.map((u) => (
            <div key={u.id} className="pop-in">
              <PersonRow user={u} meta={tab === 'signins' ? `signed in ${timeAgo(u.last_login_at)}` : `joined ${timeAgo(u.created_at)}`} />
            </div>
          ))
        )}
      </ul>
    </div>
  )
}

export function AdminDashboard() {
  const { user } = useAuth()
  const firstName = user?.full_name.split(' ')[0] ?? ''

  const active = useCount('active', { status: 'active' })
  const supervisors = useCount('sup', { role: 'supervisor', status: 'active' })
  const employees = useCount('emp', { role: 'employee', status: 'active' })
  const disabled = useCount('disabled', { status: 'disabled' })

  const departments = useQuery({ queryKey: ['departments'], queryFn: api.departments.list, staleTime: Infinity })
  const perDept = useQueries({
    queries: (departments.data ?? []).map((d) => ({
      queryKey: ['dash-dept', d.id],
      queryFn: async () => (await api.users.list({ page_size: 1, department_id: d.id, status: 'active' })).total,
    })),
  })
  const segments: Segment[] = (departments.data ?? []).map((d, i) => ({
    label: d.name,
    value: perDept[i]?.data ?? 0,
    color: SECTION_COLOR[d.code] ?? 'hsl(190 80% 45%)',
  }))
  const donutReady = departments.isSuccess && perDept.every((q) => q.isSuccess)

  return (
    <>
      <DashHero
        eyebrow={todayLabel()}
        title={<>{greeting()}, {heroName(firstName)}</>}
        subtitle="Everything about your people and sections in one place. Cards open the matching view."
        actions={
          <>
            <Link to="/admin/users?new=1" className="beam-btn inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <UserPlus className="size-4" aria-hidden /> Add user
            </Link>
            <Link to="/admin/users" className="glass-navy inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors hover:bg-white/10">
              <UserCog className="size-4" aria-hidden /> Manage users
            </Link>
          </>
        }
        aside={<StatusChip />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Users, label: 'Active users', value: active, hint: 'Across all roles', tone: 'teal', to: '/admin/users?status=active' },
          { icon: ShieldCheck, label: 'Supervisors', value: supervisors, hint: 'One or more per section', tone: 'steel', to: '/admin/users?role=supervisor' },
          { icon: UserCog, label: 'Employees', value: employees, hint: 'Staff being monitored', tone: 'amber', to: '/admin/users?role=employee' },
          { icon: UserX, label: 'Disabled accounts', value: disabled, hint: 'Cannot sign in', tone: 'danger', to: '/admin/users?status=disabled' },
        ].map((c, i) => (
          <Reveal key={c.label} variant="zoom" delay={i * 70}>
            <StatCard icon={c.icon} label={c.label} value={c.value.data ?? 0} loading={c.value.isPending} hint={c.hint} tone={c.tone as 'teal'} to={c.to} />
          </Reveal>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-5">
        <Reveal variant="left" className="lg:col-span-2">
          <div className="h-full rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">People by section</h2>
            <p className="text-sm text-muted-foreground">Active supervisors and employees. Hover a slice.</p>
            <div className="mt-5">
              {donutReady ? (
                <Donut segments={segments} centerLabel="active people" size={190} layout="stack" />
              ) : (
                <Skeleton className="mx-auto h-48 w-48 rounded-full" />
              )}
            </div>
          </div>
        </Reveal>
        <Reveal variant="right" className="lg:col-span-3">
          <ActivityCard />
        </Reveal>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Radar className="size-4 text-muted-foreground" aria-hidden /> Coming next
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <Reveal delay={0}>
            <SoonCard icon={Camera} title="Cameras" text="Register CCTV and IP cameras per section and test their connection." phase="Phase 2" />
          </Reveal>
          <Reveal delay={80}>
            <SoonCard icon={FileText} title="SOP library" text="Maintain the SOP clauses that violations are judged against." phase="Phase 3" />
          </Reveal>
          <Reveal delay={160}>
            <SoonCard icon={ShieldCheck} title="Live violations" text="Real-time violations, evidence review and penalty decisions." phase="Phase 4 to 7" />
          </Reveal>
        </div>
      </div>
    </>
  )
}
