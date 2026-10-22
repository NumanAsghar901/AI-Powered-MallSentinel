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
import type { Role, User, UserListParams, UserStatus } from '@/lib/types'

const ALL = 'all'
const PAGE_SIZE = 10

export function UsersPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | typeof ALL>(() => {
    const v = urlParams.get('role')
    return v === 'admin' || v === 'supervisor' || v === 'employee' ? v : ALL
  })
  const [status, setStatus] = useState<UserStatus | typeof ALL>(() => {
    const v = urlParams.get('status')
    return v === 'active' || v === 'disabled' || v === 'removed' ? v : ALL
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
    ...(role !== ALL ? { role } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(departmentId !== ALL ? { department_id: Number(departmentId) } : {}),
  }

  const users = useQuery({
    queryKey: ['users', params],
    queryFn: () => api.users.list(params),
    placeholderData: keepPreviousData,
  })
  const departments = useQuery({ queryKey: ['departments'], queryFn: api.departments.list, staleTime: Infinity })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] })
  const failure = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong.')

  const toggleStatus = useMutation({
    mutationFn: ({ user, enable }: { user: User; enable: boolean }) =>
      enable ? api.users.enable(user.id) : api.users.disable(user.id),
    onSuccess: (u, { enable }) => {
      toast.success(`${u.full_name} was ${enable ? 'enabled' : 'disabled'}.`)
      setToDisable(null)
      void refresh()
    },
    onError: failure,
  })
  const unlock = useMutation({
    mutationFn: (user: User) => api.users.unlock(user.id),
    onSuccess: (u) => {
      toast.success(`${u.full_name} was unlocked.`)
      void refresh()
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
  const hasFilters = Boolean(debouncedSearch) || role !== ALL || status !== ALL || departmentId !== ALL
  const clearFilters = () => {
    setSearch('')
    setRole(ALL)
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
        title="Users"
        description="Create and manage supervisors and employees across all sections."
        actions={
          <Button onClick={openCreate}>
            <Plus /> Add user
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_11rem]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Search name, email or code"
              className="pl-9"
              aria-label="Search users"
              type="search"
            />
          </div>
          <Select value={role} onValueChange={(v) => resetPage(setRole)(v as Role | typeof ALL)}>
            <SelectTrigger aria-label="Filter by role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => resetPage(setStatus)(v as UserStatus | typeof ALL)}>
            <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={departmentId} onValueChange={resetPage(setDepartmentId)}>
            <SelectTrigger aria-label="Filter by department"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments.data?.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {users.isPending ? (
          <UserTableSkeleton />
        ) : users.isError ? (
          <ErrorState
            message={users.error instanceof ApiError ? users.error.message : 'Please try again.'}
            onRetry={() => void users.refetch()}
          />
        ) : users.data.items.length === 0 ? (
          <EmptyState
            icon={<UserX className="size-6" />}
            title={hasFilters ? 'No users match your filters' : 'No users yet'}
            description={hasFilters ? 'Try a different search or clear the filters.' : 'Add the first supervisor or employee to get started.'}
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              ) : (
                <Button onClick={openCreate}><Plus /> Add user</Button>
              )
            }
          />
        ) : (
          <div className={users.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <UserTable
              users={users.data.items}
              variant="admin"
              sort={sort}
              order={order}
              onSort={handleSort}
              busyId={busyId}
              renderActions={(u) => (
                <>
                  {u.role !== 'admin' && (
                    <DropdownMenuItem onSelect={() => { setEditing(u); setFormOpen(true) }}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                  )}
                  {u.is_locked && (
                    <DropdownMenuItem onSelect={() => unlock.mutate(u)}>
                      <LockOpen /> Unlock account
                    </DropdownMenuItem>
                  )}
                  {u.role !== 'admin' && u.status === 'active' && (
                    <DropdownMenuItem destructive onSelect={() => setToDisable(u)}>
                      <Ban /> Disable
                    </DropdownMenuItem>
                  )}
                  {u.role !== 'admin' && u.status !== 'active' && (
                    <DropdownMenuItem onSelect={() => toggleStatus.mutate({ user: u, enable: true })}>
                      <CheckCircle2 /> {u.status === 'removed' ? 'Restore' : 'Enable'}
                    </DropdownMenuItem>
                  )}
                  {u.role === 'admin' && !u.is_locked && (
                    <DropdownMenuItem disabled>Administrator accounts are read-only</DropdownMenuItem>
                  )}
                </>
              )}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={users.data.total} onPageChange={setPage} />
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
          void refresh()
        }}
      />

      <ConfirmDialog
        open={toDisable !== null}
        onOpenChange={(o) => !o && setToDisable(null)}
        title={`Disable ${toDisable?.full_name ?? 'user'}?`}
        description="They will be signed out immediately and will not be able to sign in until you enable the account again. Their records are kept."
        confirmLabel="Disable account"
        destructive
        loading={toggleStatus.isPending}
        onConfirm={() => toDisable && toggleStatus.mutate({ user: toDisable, enable: false })}
      />
    </>
  )
}
