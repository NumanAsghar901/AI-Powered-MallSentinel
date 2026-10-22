import { Mail, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import { SectionBadge, StatusBadge } from '@/components/Badges'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'
import { formatDateTime, initials } from '@/lib/utils'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:col-span-2">{children || '—'}</dd>
    </div>
  )
}

export function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return (
    <>
      <PageHeader title="My Profile" description="Your details as recorded by your supervisor. Contact them to change anything." />
      <Card>
        <CardHeader className="flex-row items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
            {initials(user.full_name)}
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate text-lg">{user.full_name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <SectionBadge department={user.department} />
              <StatusBadge user={user} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Email">
              <span className="inline-flex items-center gap-2 break-all">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {user.email}
              </span>
            </Row>
            <Row label="Phone">
              {user.phone && (
                <span className="inline-flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden /> {user.phone}
                </span>
              )}
            </Row>
            <Row label="Employee code">{user.employee_code}</Row>
            <Row label="Designation">{user.designation}</Row>
            <Row label="Shift">{user.shift && <span className="capitalize">{user.shift}</span>}</Row>
            <Row label="Assigned area">{user.assigned_area}</Row>
            <Row label="Last sign-in">{formatDateTime(user.last_login_at)}</Row>
          </dl>
        </CardContent>
      </Card>
    </>
  )
}
