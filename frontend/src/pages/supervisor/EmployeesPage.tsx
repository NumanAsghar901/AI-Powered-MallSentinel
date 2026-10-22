import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Pencil, Plus, Search, Trash2, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SectionBadge } from '@/components/Badges'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { EmptyState, ErrorState } from '@/components/StateViews'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { UserFormDialog } from '@/components/UserFormDialog'
import { UserTable, UserTableSkeleton } from '@/components/UserTable'
import { api, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDebounced } from '@/lib/hooks'
import type { User, UserListParams } from '@/lib/types'

const ALL = 'all'
const PAGE_SIZE = 10

export function EmployeesPage() {
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'active' | 'disabled' | typeof ALL>(ALL)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<NonNullable<UserListParams['sort']>>('full_name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')

  const [formOpen, setFormOpen] = useState(urlParams.get('new') === '1')
  const [editing, setEditing] = useState<User | null>(null)
  const [toRemove, setToRemove] = useState<User | null>(null)

  const debouncedSearch = useDebounced(search.trim())
  const params = {
    page,
    page_size: PAGE_SIZE,
    sort,
    order,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status !== ALL ? { status } : {}),
  }

  const employees = useQuery({
    queryKey: ['employees', params],
    queryFn: () => api.employees.list(params),
    placeholderData: keepPreviousData,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['employees'] })
  const failure = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.')

  const setActive = useMutation({
    mutationFn: ({ user, active }: { user: User; active: boolean }) =>
      api.employees.update(user.id, { status: active ? 'active' : 'disabled' }),
    onSuccess: (u) => {
      toast.success(`${u.full_name} was ${u.status === 'active' ? 'enabled' : 'disabled'}.`)
      void refresh()
    },
    onError: failure,
  })
  const remove = useMutation({
    mutationFn: (user: User) => api.employees.remove(user.id),
    onSuccess: (_, user) => {
      toast.success(`${user.full_name} was removed.`)
      setToRemove(null)
      void refresh()
    },
    onError: (err) => {
      setToRemove(null)
      failure(err)
    },
  })

  const hasFilters = Boolean(debouncedSearch) || status !== ALL
  const handleSort = (key: NonNullable<UserListParams['sort']>) => {
    if (key === sort) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setOrder('asc')
    }
    setPage(1)
  }
  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const busyId = setActive.isPending ? setActive.variables.user.id : remove.isPending ? remove.variables.id : null

  return (
    <>
      <PageHeader
        title="Employees"
        description={
          me?.department
            ? `Manage the employees in the ${me.department.name} section. You can only see and change your own department.`
            : 'Manage the employees in your department.'
        }
        actions={
          <>
            {me?.department && <SectionBadge department={me.department} />}
            <Button onClick={openCreate}>
              <Plus /> Add employee
            </Button>
          </>
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
              placeholder="Search name, email or code"
              className="pl-9"
              aria-label="Search employees"
              type="search"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {employees.isPending ? (
          <UserTableSkeleton />
        ) : employees.isError ? (
          <ErrorState
            message={employees.error instanceof ApiError ? employees.error.message : 'Please try again.'}
            onRetry={() => void employees.refetch()}
          />
        ) : employees.data.items.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="size-6" />}
            title={hasFilters ? 'No employees match your filters' : 'No employees yet'}
            description={hasFilters ? 'Try a different search or clear the filters.' : 'Add the first employee to your department.'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={() => { setSearch(''); setStatus(ALL); setPage(1) }}>Clear filters</Button>
              ) : (
                <Button onClick={openCreate}><Plus /> Add employee</Button>
              )
            }
          />
        ) : (
          <div className={employees.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <UserTable
              users={employees.data.items}
              variant="supervisor"
              sort={sort}
              order={order}
              onSort={handleSort}
              busyId={busyId}
              renderActions={(u) => (
                <>
                  <DropdownMenuItem onSelect={() => { setEditing(u); setFormOpen(true) }}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                  {u.status === 'active' ? (
                    <DropdownMenuItem onSelect={() => setActive.mutate({ user: u, active: false })}>
                      <Ban /> Disable
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setActive.mutate({ user: u, active: true })}>
                      <CheckCircle2 /> Enable
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setToRemove(u)}>
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </>
              )}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={employees.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        variant="supervisor"
        user={editing}
        onSaved={(message) => {
          toast.success(message)
          void refresh()
        }}
      />

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => !o && setToRemove(null)}
        title={`Remove ${toRemove?.full_name ?? 'employee'}?`}
        description="They will lose access immediately and disappear from this list. Their past records are kept for audit purposes."
        confirmLabel="Remove employee"
        destructive
        loading={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove)}
      />
    </>
  )
}
