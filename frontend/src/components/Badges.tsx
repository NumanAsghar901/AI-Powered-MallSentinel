import { Ban, CheckCircle2, ClipboardCheck, Lock, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Department, Role, User, UserStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', supervisor: 'Supervisor', employee: 'Employee' }
export const roleLabel = (role: Role): string => ROLE_LABEL[role]

export function RoleBadge({ role }: { role: Role }) {
  const Icon = role === 'admin' ? ShieldCheck : role === 'supervisor' ? UserCog : Users
  return (
    <Badge variant="outline">
      <Icon aria-hidden />
      {ROLE_LABEL[role]}
    </Badge>
  )
}

export function StatusBadge({ user }: { user: Pick<User, 'status' | 'is_locked'> }) {
  if (user.status === 'active' && user.is_locked) {
    return (
      <Badge variant="warning">
        <Lock aria-hidden /> Locked
      </Badge>
    )
  }
  const map: Record<UserStatus, { variant: 'success' | 'danger' | 'neutral'; label: string; icon: typeof Ban }> = {
    active: { variant: 'success', label: 'Active', icon: CheckCircle2 },
    disabled: { variant: 'danger', label: 'Disabled', icon: Ban },
    removed: { variant: 'neutral', label: 'Removed', icon: Trash2 },
  }
  const { variant, label, icon: Icon } = map[user.status]
  return (
    <Badge variant={variant}>
      <Icon aria-hidden /> {label}
    </Badge>
  )
}

// Section colours come from the logo panels and are never reused for success/warning/danger.
const SECTION_STYLE: Record<Department['code'], string> = {
  meat_shop: 'bg-section-meat/10 text-section-meat dark:bg-section-meat/25 dark:text-[hsl(352_70%_75%)]',
  bakery: 'bg-section-bakery/15 text-[hsl(33_70%_32%)] dark:bg-section-bakery/20 dark:text-[hsl(33_75%_65%)]',
  security: 'bg-section-security/12 text-section-security dark:bg-section-security/25 dark:text-[hsl(207_65%_72%)]',
}

export function SectionBadge({ department }: { department: Department | null }) {
  if (!department) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium',
        SECTION_STYLE[department.code],
      )}
    >
      <ClipboardCheck className="size-3" aria-hidden />
      {department.name}
    </span>
  )
}
