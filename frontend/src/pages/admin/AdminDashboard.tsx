import { useQueries, useQuery } from '@tanstack/react-query'
import { Camera, MapPinned, MonitorPlay, ShieldCheck, UserCog, UserPlus, UserX, Layers } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SectionBadge } from '@/components/Badges'
import { DashHero, heroName } from '@/components/dash/DashHero'
import { Donut, type Segment } from '@/components/dash/Donut'
import { SECTION_COLOR } from '@/components/dash/sections'
import { SoonCard } from '@/components/dash/SoonCard'
import { StatCard } from '@/components/dash/StatCard'
import { EmptyState } from '@/components/StateViews'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { greeting, timeAgo, todayLabel } from '@/lib/format'
import type { User } from '@/lib/types'
import { cn, initials } from '@/lib/utils'
import { Reveal } from '@/pages/landing/Reveal'

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

function SupervisorRow({ user, meta }: { user: User; meta: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initials(user.full_name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <SectionBadge department={user.department} />
    </li>
  )
}

function ActivityCard() {
  const [tab, setTab] = useState<'signins' | 'newest'>('signins')
  const signins = useQuery({
    queryKey: ['dash', 'signins'],
    queryFn: () => api.supervisors.list({ page_size: 6, sort: 'last_login_at', order: 'desc', status: 'active' }),
  })
  const newest = useQuery({
    queryKey: ['dash', 'newest'],
    queryFn: () => api.supervisors.list({ page_size: 6, sort: 'created_at', order: 'desc', status: 'active' }),
  })
  const q = tab === 'signins' ? signins : newest
  const items = (q.data?.items ?? []).filter((u) => tab === 'newest' || u.last_login_at)

  return (
    <div className="h-full rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Supervisors</h2>
        <div className="flex w-full rounded-lg bg-muted p-1 text-sm sm:inline-flex sm:w-auto" role="tablist" aria-label="Supervisor activity">
          {(
            [
              ['signins', 'Recent sign-ins'],
              ['newest', 'Newest'],
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
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : items.length === 0 ? (
          <EmptyState title="No supervisors yet" description="Add a supervisor for each section." className="py-8" />
        ) : (
          items.map((u) => (
            <div key={u.id} className="pop-in">
              <SupervisorRow
                user={u}
                meta={tab === 'signins' ? `signed in ${timeAgo(u.last_login_at)}` : `added ${timeAgo(u.created_at)}`}
              />
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

  const departments = useQuery({ queryKey: ['departments'], queryFn: api.departments.list, staleTime: Infinity })
  const active = useQuery({
    queryKey: ['dash', 'sup-active'],
    queryFn: async () => (await api.supervisors.list({ page_size: 1, status: 'active' })).total,
  })
  const disabled = useQuery({
    queryKey: ['dash', 'sup-disabled'],
    queryFn: async () => (await api.supervisors.list({ page_size: 1, status: 'disabled' })).total,
  })
  const perDept = useQueries({
    queries: (departments.data ?? []).map((d) => ({
      queryKey: ['dash', 'sup-dept', d.id],
      queryFn: async () => (await api.supervisors.list({ page_size: 1, department_id: d.id, status: 'active' })).total,
    })),
  })
  const segments: Segment[] = (departments.data ?? []).map((d, i) => ({
    label: d.name,
    value: perDept[i]?.data ?? 0,
    color: SECTION_COLOR[d.code],
  }))
  const donutReady = departments.isSuccess && perDept.every((q) => q.isSuccess)
  const covered = segments.filter((s) => s.value > 0).length

  return (
    <>
      <DashHero
        eyebrow={todayLabel()}
        title={<>{greeting()}, {heroName(firstName)}</>}
        subtitle="You look after the section supervisors and, soon, the CCTV monitoring system. Supervisors manage their own employees."
        actions={
          <>
            <Link to="/admin/supervisors?new=1" className="beam-btn inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <UserPlus className="size-4" aria-hidden /> Add supervisor
            </Link>
            <Link to="/admin/supervisors" className="glass-navy inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors hover:bg-white/10">
              <UserCog className="size-4" aria-hidden /> Manage supervisors
            </Link>
          </>
        }
        aside={<StatusChip />}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: ShieldCheck, label: 'Active supervisors', value: active.data ?? 0, loading: active.isPending, hint: 'Can sign in today', tone: 'teal', to: '/admin/supervisors?status=active' },
          { icon: UserX, label: 'Disabled supervisors', value: disabled.data ?? 0, loading: disabled.isPending, hint: 'Cannot sign in', tone: 'danger', to: '/admin/supervisors?status=disabled' },
          { icon: Layers, label: 'Sections covered', value: covered, loading: !donutReady, hint: `Of ${departments.data?.length ?? 3} sections have a supervisor`, tone: 'amber', to: '/admin/supervisors' },
          { icon: Camera, label: 'CCTV cameras', text: 'Not set up yet', loading: false, hint: 'Camera management is planned', tone: 'steel', to: undefined },
        ].map((c, i) => (
          <Reveal key={c.label} variant="zoom" delay={i * 70}>
            <StatCard
              icon={c.icon}
              label={c.label}
              loading={c.loading}
              hint={c.hint}
              tone={c.tone as 'teal'}
              {...(c.value !== undefined ? { value: c.value } : { text: c.text })}
              {...(c.to ? { to: c.to } : {})}
            />
          </Reveal>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-5">
        <Reveal variant="left" className="lg:col-span-2">
          <div className="h-full rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Supervisors by section</h2>
            <p className="text-sm text-muted-foreground">Active supervisors in each section. Hover a slice.</p>
            <div className="mt-5">
              {donutReady ? (
                <Donut segments={segments} centerLabel="active supervisors" size={190} layout="stack" />
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
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <MonitorPlay className="size-4 text-muted-foreground" aria-hidden /> CCTV monitoring system
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          This is the admin&apos;s main job and is the next thing to be built.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          <Reveal>
            <SoonCard icon={Camera} title="Cameras" text="Register CCTV and IP cameras per section, then test the connection." phase="Phase 2" />
          </Reveal>
          <Reveal delay={80}>
            <SoonCard icon={MapPinned} title="Duty zones" text="Draw the zones guards must stay inside, per camera." phase="Phase 2" />
          </Reveal>
          <Reveal delay={160}>
            <SoonCard icon={MonitorPlay} title="Live monitoring" text="Watch camera health and detections as they happen." phase="Phase 4 and 5" />
          </Reveal>
        </div>
      </div>
    </>
  )
}
