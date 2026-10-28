import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { EmptyState, ErrorState } from '@/components/StateViews'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Reveal } from '@/pages/landing/Reveal'

const PAGE_SIZE = 8

/** An employee only ever sees their own penalties. */
export function MyPenaltiesPage() {
  const [page, setPage] = useState(1)
  const penalties = useQuery({
    queryKey: ['my-penalties', page],
    queryFn: () => api.penalties.mine({ page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <PageHeader
        title="My Penalties"
        description="Penalties your supervisor has issued to you. You also receive each one by email."
      />

      {penalties.isPending ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
        </div>
      ) : penalties.isError ? (
        <ErrorState
          message={penalties.error instanceof ApiError ? penalties.error.message : 'Please try again.'}
          onRetry={() => void penalties.refetch()}
        />
      ) : penalties.data.items.length === 0 ? (
        <div className="rounded-2xl border bg-card">
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="Clean record"
            description="No penalties have been issued to you. Keep it up!"
          />
        </div>
      ) : (
        <div className={penalties.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ul className="space-y-4">
            {penalties.data.items.map((p, i) => (
              <Reveal as="li" key={p.id} delay={i * 50}>
                <article className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{p.reason_label}</h2>
                      <p className="text-sm text-muted-foreground">{formatDateTime(p.created_at)}</p>
                    </div>
                    <SeverityBadge severity={p.severity} />
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Penalty</dt>
                      <dd className="font-medium">{p.action_label}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Issued by</dt>
                      <dd className="font-medium">{p.issued_by.full_name}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Section</dt>
                      <dd className="font-medium">{p.department.name}</dd>
                    </div>
                  </dl>
                  {p.notes && (
                    <p className="mt-4 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm">{p.notes}</p>
                  )}
                  {p.email_status === 'sent' && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="size-3.5" aria-hidden /> A copy was emailed to you.
                    </p>
                  )}
                </article>
              </Reveal>
            ))}
          </ul>
          <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
            <Pagination page={page} pageSize={PAGE_SIZE} total={penalties.data.total} onPageChange={setPage} />
          </div>
        </div>
      )}
    </>
  )
}
