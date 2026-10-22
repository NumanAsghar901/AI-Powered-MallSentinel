import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/types'

export function ForbiddenPage() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-danger-soft text-destructive">
        <ShieldAlert className="size-8" />
      </div>
      <div className="space-y-2">
        <p className="font-heading text-sm font-semibold tracking-widest text-muted-foreground">ERROR 403</p>
        <h1 className="text-2xl font-semibold">You don’t have access to this page</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your role doesn’t include permission to view this area. If you think this is a mistake, contact your
          administrator.
        </p>
      </div>
      <Button asChild>
        <Link to={user ? ROLE_HOME[user.role] : '/login'}>Go to my dashboard</Link>
      </Button>
    </div>
  )
}
