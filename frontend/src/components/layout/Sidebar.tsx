import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useQuery } from '@tanstack/react-query'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { LogoMark, Wordmark } from '@/components/Logo'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav'

function NavList({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  const { user } = useAuth()
  const isEmployee = user?.role === 'employee'

  const unreadQuery = useQuery({
    queryKey: ['unread-penalties', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0
      const res = await api.penalties.mine({ page_size: 1 })
      const lastSeen = Number(localStorage.getItem(`ms-seen-penalties:${user.id}`) ?? 0)
      return Math.max(0, res.total - lastSeen)
    },
    enabled: isEmployee && Boolean(user?.id),
    refetchInterval: 10000,
  })

  const unreadCount = unreadQuery.data ?? 0

  return (
    <nav aria-label="Main" className="flex-1 space-y-1 p-3">
      {items.map(({ to, label, icon: Icon, end }) => {
        const isMyPenalties = to === '/employee/penalties'

        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-sidebar-accent text-white shadow-[inset_3px_0_0_hsl(190_70%_55%)]'
                  : 'text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white',
              )
            }
          >
            <div className="relative flex items-center">
              <Icon className="size-5 shrink-0" aria-hidden />
              {isMyPenalties && unreadCount > 0 && collapsed && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-80" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600" />
                </span>
              )}
            </div>

            <span className={cn('flex-1 truncate', collapsed && 'sr-only')}>{label}</span>

            {isMyPenalties && unreadCount > 0 && !collapsed && (
              <span className="relative flex items-center justify-center shrink-0 ml-auto">
                <span className="animate-ping absolute inline-flex h-3.5 w-3.5 rounded-full bg-rose-400 opacity-80" />
                <span className="relative inline-flex items-center justify-center rounded-full min-w-5 h-5 px-1.5 bg-rose-600 text-[11px] font-bold text-white shadow-sm ring-2 ring-sidebar">
                  {unreadCount}
                </span>
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
      <LogoMark className="size-10" />
      {!collapsed && <Wordmark onDark />}
    </div>
  )
}

export function DesktopSidebar({
  items,
  collapsed,
  onToggle,
}: {
  items: NavItem[]
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <Brand collapsed={collapsed} />
      <NavList items={items} collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

export function MobileSidebar({
  items,
  open,
  onOpenChange,
}: {
  items: NavItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left lg:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="relative">
            <Brand collapsed={false} />
            <DialogPrimitive.Close className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white">
              <X className="size-5" />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>
          <NavList items={items} collapsed={false} onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
