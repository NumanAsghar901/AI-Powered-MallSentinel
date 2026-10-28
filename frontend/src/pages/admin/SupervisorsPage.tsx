import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, LockOpen, Pencil, Plus, Search, UserX } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { EmptyState, ErrorState } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { UserFormDialog } from '@/components/UserFormDialog'
import { UserTable, UserTableSkeleton } from '@/components/UserTable'
import { api, ApiError } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { User, UserListParams, UserStatus } from '@/lib/types'

const ALL = 'all'
const PAGE_SIZE = 10

/** Admin: supervisors only. Employees are managed by their supervisor and are not visible here. */
export function SupervisorsPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [urlParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<UserStatus | typeof ALL>(() => {
    const v = urlParams.get('status')
    return v === 'active' || v === 'disabled' ? v : ALL
  })
  const [departmentId, setDepartmentId] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<NonNullable<UserListParams['sort']>>('created_at')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')

  const [formOpen, setFormOpen] = useState(urlParams.get('new') === '1')
  const [editing, setEditing] = useState<User | null>(null)
  const [toDisable, setToDisable] = useState<User | null>(null)

  const debouncedSearch = useDebounced(search.trim())
  const params: UserListParams = {
    page,
    page_size: PAGE_SIZE,
    sort,
    order,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(departmentId !== ALL ? { department_id: Number(departmentId) } : {}),
  }

  const supervisors = useQuery({
    queryKey: ['supervisors', params],
    queryFn: () => api.supervisors.list(params),
    placeholderData: keepPreviousData,
  })
  const departments = useQuery({ queryKey: ['departments'], queryFn: api.departments.list, staleTime: Infinity })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['supervisors'] })
    void queryClient.invalidateQueries({ queryKey: ['dash'] })
  }
  const failure = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.')

  const toggleStatus = useMutation({
    mutationFn: ({ user, enable }: { user: User; enable: boolean }) =>
      enable ? api.supervisors.enable(user.id) : api.supervisors.disable(user.id),
    onSuccess: (u, { enable }) => {
      toast.success(`${u.full_name} was ${enable ? 'enabled' : 'disabled'}.`)
      setToDisable(null)
      refresh()
    },
    onError: failure,
  })
  const unlock = useMutation({
    mutationFn: (user: User) => api.supervisors.unlock(user.id),
    onSuccess: (u) => {
      toast.success(`${u.full_name} was unlocked.`)
      refresh()
    },
    onError: failure,
  })

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setPage(1)
  }
  const handleSort = (key: NonNullable<UserListParams['sort']>) => {
    if (key === sort) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setOrder('asc')
    }
    setPage(1)
  }
  const hasFilters = Boolean(debouncedSearch) || status !== ALL || departmentId !== ALL
  const clearFilters = () => {
    setSearch('')
    setStatus(ALL)
    setDepartmentId(ALL)
    setPage(1)
  }
  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const busyId = toggleStatus.isPending ? toggleStatus.variables.user.id : unlock.isPending ? unlock.variables.id : null

  return (
    <>
      <PageHeader
        title="Supervisors"
        description="Create and manage the supervisors of each section. Supervisors manage their own employees and issue penalties."
        actions={
          <Button onClick={openCreate}>
            <Plus /> Add supervisor
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Search name or email"
              className="pl-9"
              aria-label="Search supervisors"
              type="search"
            />
          </div>
          <Select value={status} onValueChange={(v) => resetPage(setStatus)(v as UserStatus | typeof ALL)}>
            <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={departmentId} onValueChange={resetPage(setDepartmentId)}>
            <SelectTrigger aria-label="Filter by section"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sections</SelectItem>
              {departments.data?.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {supervisors.isPending ? (
          <UserTableSkeleton />
        ) : supervisors.isError ? (
          <ErrorState
            message={supervisors.error instanceof ApiError ? supervisors.error.message : 'Please try again.'}
            onRetry={() => void supervisors.refetch()}
          />
        ) : supervisors.data.items.length === 0 ? (
          <EmptyState
            icon={<UserX className="size-6" />}
            title={hasFilters ? 'No supervisors match your filters' : 'No supervisors yet'}
            description={hasFilters ? 'Try a different search or clear the filters.' : 'Add the first supervisor for a section.'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              ) : (
                <Button onClick={openCreate}><Plus /> Add supervisor</Button>
              )
            }
          />
        ) : (
          <div className={supervisors.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <UserTable
              users={supervisors.data.items}
              variant="admin"
              sort={sort}
              order={order}
              onSort={handleSort}
              busyId={busyId}
              renderActions={(u) => (
                <>
                  <DropdownMenuItem onSelect={() => { setEditing(u); setFormOpen(true) }}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  {u.is_locked && (
                    <DropdownMenuItem onSelect={() => unlock.mutate(u)}>
                      <LockOpen /> Unlock account
                    </DropdownMenuItem>
                  )}
                  {u.status === 'active' ? (
                    <DropdownMenuItem destructive onSelect={() => setToDisable(u)}>
                      <Ban /> Disable
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => toggleStatus.mutate({ user: u, enable: true })}>
                      <CheckCircle2 /> Enable
                    </DropdownMenuItem>
                  )}
                </>
              )}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={supervisors.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        variant="admin"
        user={editing}
        onSaved={(message) => {
          toast.success(message)
          refresh()
        }}
      />

      <ConfirmDialog
        open={toDisable !== null}
        onOpenChange={(o) => !o && setToDisable(null)}
        title={`Disable ${toDisable?.full_name ?? 'supervisor'}?`}
        description="They will be signed out immediately and cannot sign in until you enable the account again. Their records are kept."
        confirmLabel="Disable account"
        destructive
        loading={toggleStatus.isPending}
        onConfirm={() => toDisable && toggleStatus.mutate({ user: toDisable, enable: false })}
      />
    </>
  )
}
