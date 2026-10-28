import { Gavel, LayoutDashboard, ShieldAlert, UserCircle, UserCog, Users, type LucideIcon } from 'lucide-react'
import type { Role } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Highlight only on an exact path match (used for dashboard roots). */
  end?: boolean
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/supervisors', label: 'Supervisors', icon: UserCog },
  ],
  supervisor: [
    { to: '/supervisor', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/supervisor/employees', label: 'Employees', icon: Users },
    { to: '/supervisor/penalties', label: 'Penalties', icon: Gavel },
  ],
  employee: [
    { to: '/employee', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/employee/penalties', label: 'My Penalties', icon: ShieldAlert },
    { to: '/employee/profile', label: 'My Profile', icon: UserCircle },
  ],
}
