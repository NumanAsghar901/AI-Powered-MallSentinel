import { SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { ROLE_HOME } from '@/lib/types'
import { cn } from '@/lib/utils'

export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const { user } = useAuth()
  return (
    <div className={cn('flex flex-col items-center justify-center gap-5 text-center', standalone ? 'min-h-dvh p-6' : 'min-h-[60dvh]')}>
      <div className="flex size-16 items-center justify-center rounded-full bg-info-soft text-info">
        <SearchX className="size-8" />
      </div>
      <div className="space-y-2">
        <p className="font-heading text-sm font-semibold tracking-widest text-muted-foreground">ERROR 404</p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you’re looking for doesn’t exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link to={user ? ROLE_HOME[user.role] : '/login'}>{user ? 'Go to my dashboard' : 'Go to sign in'}</Link>
      </Button>
    </div>
  )
}
