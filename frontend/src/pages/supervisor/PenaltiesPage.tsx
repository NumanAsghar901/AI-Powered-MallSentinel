import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gavel, Mail, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { EmailStatusBadge, SeverityBadge } from '@/components/penalty/PenaltyBadges'
import { PenaltyDialog, penaltyToast } from '@/components/penalty/PenaltyDialog'
import { EmptyState, ErrorState } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { api, ApiError } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { Penalty, PenaltyListParams, Severity } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

const ALL = 'all'
const PAGE_SIZE = 10

export function PenaltiesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [urlParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<Severity | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(urlParams.get('new') === '1')

  const debouncedSearch = useDebounced(search.trim())
  const params: PenaltyListParams = {
    page,
    page_size: PAGE_SIZE,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(severity !== ALL ? { severity } : {}),
  }
  const penalties = useQuery({
    queryKey: ['penalties', params],
    queryFn: () => api.penalties.list(params),
    placeholderData: keepPreviousData,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['penalties'] })
    void queryClient.invalidateQueries({ queryKey: ['dash'] })
    void queryClient.invalidateQueries({ queryKey: ['penalty-history'] })
  }
  const report = (p: Penalty) => {
    const t = penaltyToast(p)
    if (t.ok) toast.success(t.message)
    else toast.error(t.message)
  }
  const resend = useMutation({
    mutationFn: (p: Penalty) => api.penalties.resendEmail(p.id),
    onSuccess: (p) => {
      report(p)
      refresh()
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.'),
  })

  const hasFilters = Boolean(debouncedSearch) || severity !== ALL
  const resendCell = (p: Penalty) => (
    <div className="flex flex-wrap items-center gap-2">
      <EmailStatusBadge status={p.email_status} />
      {p.email_status !== 'sent' && (
        <Button
          size="sm"
          variant="outline"
          loading={resend.isPending && resend.variables.id === p.id}
          onClick={() => resend.mutate(p)}
        >
          <Mail /> Resend
        </Button>
      )}
    </div>
  )

  return (
    <>
      <PageHeader
        title="Penalties"
        description="Penalties you have issued to employees in your section. Each one is emailed to the employee and recorded in the audit trail."
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus /> Issue penalty
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by employee name or email"
              className="pl-9"
              aria-label="Search penalties"
              type="search"
            />
          </div>
          <Select
            value={severity}
            onValueChange={(v) => {
              setSeverity(v as Severity | typeof ALL)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filter by severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All severities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {penalties.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : penalties.isError ? (
          <ErrorState
            message={penalties.error instanceof ApiError ? penalties.error.message : 'Please try again.'}
            onRetry={() => void penalties.refetch()}
          />
        ) : penalties.data.items.length === 0 ? (
          <EmptyState
            icon={<Gavel className="size-6" />}
            title={hasFilters ? 'No penalties match your filters' : 'No penalties issued yet'}
            description={hasFilters ? 'Try a different search.' : 'When you issue one, it appears here with its email status.'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => { setSearch(''); setSeverity(ALL); setPage(1) }}>Clear filters</Button>
              ) : (
                <Button onClick={() => setDialogOpen(true)}><Plus /> Issue penalty</Button>
              )
            }
          />
        ) : (
          <div className={penalties.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {/* md and up: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Employee</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Reason</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Severity</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Penalty</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Issued</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {penalties.data.items.map((p) => (
                    <tr key={p.id} className="align-top hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.employee.full_name}</p>
                        <p className="text-xs text-muted-foreground">{p.employee.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        {p.reason_label}
                        {p.notes && <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={p.notes}>{p.notes}</p>}
                      </td>
                      <td className="px-4 py-3"><SeverityBadge severity={p.severity} /></td>
                      <td className="px-4 py-3">{p.action_label}</td>
                      <td className="px-4 py-3">{resendCell(p)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* below md: cards */}
            <ul className="divide-y md:hidden">
              {penalties.data.items.map((p) => (
                <li key={p.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.employee.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{formatDateTime(p.created_at)}</p>
                    </div>
                    <SeverityBadge severity={p.severity} />
                  </div>
                  <p className="text-sm">
                    {p.reason_label} · <span className="font-medium">{p.action_label}</span>
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  {resendCell(p)}
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={penalties.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <PenaltyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={null}
        onIssued={(p) => {
          report(p)
          refresh()
        }}
      />
    </>
  )
}
