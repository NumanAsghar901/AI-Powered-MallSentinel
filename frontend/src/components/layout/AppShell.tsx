import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { NAV_BY_ROLE } from './nav'
import { DesktopSidebar, MobileSidebar } from './Sidebar'
import { Topbar } from './Topbar'

const COLLAPSE_KEY = 'ms-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable */
    }
  }, [collapsed])

  if (!user) return null
  const items = NAV_BY_ROLE[user.role]

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <DesktopSidebar items={items} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileSidebar items={items} open={mobileOpen} onOpenChange={setMobileOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="relative isolate flex-1 animate-fade-in overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="teal-glow pointer-events-none absolute -right-40 -top-40 -z-10 size-[32rem] opacity-60" aria-hidden />
          <div className="steel-glow pointer-events-none absolute -bottom-48 left-1/4 -z-10 size-[30rem] opacity-50" aria-hidden />
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
