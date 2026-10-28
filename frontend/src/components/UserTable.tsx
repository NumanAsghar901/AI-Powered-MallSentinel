import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionBadge, StatusBadge } from '@/components/Badges'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { User, UserListParams } from '@/lib/types'
import { formatDateTime, initials } from '@/lib/utils'

type SortKey = NonNullable<UserListParams['sort']>

interface Props {
  users: User[]
  variant: 'admin' | 'supervisor'
  sort: SortKey
  order: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  /** Menu items for a row (rendered inside a DropdownMenuContent). */
  renderActions: (user: User) => ReactNode
  /** Row ids currently being mutated. */
  busyId?: string | null
}

function SortHeader({
  label,
  field,
  sort,
  order,
  onSort,
}: {
  label: string
  field: SortKey
  sort: SortKey
  order: 'asc' | 'desc'
  onSort: (key: SortKey) => void
}) {
  const active = sort === field
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-4 py-3 text-left font-medium">
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1.5 hover:text-foreground">
        {label}
        <Icon className={`size-3.5 ${active ? 'text-foreground' : 'opacity-50'}`} aria-hidden />
      </button>
    </th>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
      {initials(name)}
    </span>
  )
}

function RowMenu({ user, render, busy }: { user: User; render: Props['renderActions']; busy: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label={`Actions for ${user.full_name}`}>
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{render(user)}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UserTable({ users, variant, sort, order, onSort, renderActions, busyId = null }: Props) {
  const sortProps = { sort, order, onSort }
  return (
    <>
      {/* md and up: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <SortHeader label="Name" field="full_name" {...sortProps} />
              {variant === 'admin' ? (
                <>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Section</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Designation</th>
                </>
              ) : (
                <>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Code</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Shift</th>
                </>
              )}
              <SortHeader label="Status" field="status" {...sortProps} />
              <SortHeader label="Last sign-in" field="last_login_at" {...sortProps} />
              <th scope="col" className="w-14 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{u.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                {variant === 'admin' ? (
                  <>
                    <td className="px-4 py-3"><SectionBadge department={u.department} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{u.designation ?? '—'}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-muted-foreground">{u.employee_code ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{u.shift ?? '—'}</td>
                  </>
                )}
                <td className="px-4 py-3"><StatusBadge user={u} /></td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(u.last_login_at)}</td>
                <td className="px-2 py-2 text-right"><RowMenu user={u} render={renderActions} busy={busyId === u.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* below md: cards */}
      <ul className="divide-y md:hidden">
        {users.map((u) => (
          <li key={u.id} className="flex items-start gap-3 p-4">
            <Avatar name={u.full_name} />
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="truncate font-medium">{u.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {variant === 'admin' && <SectionBadge department={u.department} />}
                <StatusBadge user={u} />
              </div>
              {variant === 'supervisor' && (u.employee_code || u.shift) && (
                <p className="text-xs text-muted-foreground">
                  {[u.employee_code, u.shift && `${u.shift[0]?.toUpperCase()}${u.shift.slice(1)} shift`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <RowMenu user={u} render={renderActions} busy={busyId === u.id} />
          </li>
        ))}
      </ul>
    </>
  )
}

export function UserTableSkeleton() {
  return (
    <div className="divide-y" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  )
}
