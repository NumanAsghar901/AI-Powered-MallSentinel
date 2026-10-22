import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-danger-soft text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">We couldn’t load this</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" role="status">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  )
}

export function InlineAlert({
  kind,
  children,
  className,
}: {
  kind: 'error' | 'success' | 'info'
  children: ReactNode
  className?: string
}) {
  const styles = {
    error: 'border-destructive/30 bg-danger-soft text-destructive',
    success: 'border-success/30 bg-success-soft text-success',
    info: 'border-info/30 bg-info-soft text-info',
  }[kind]
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('rounded-md border px-3 py-2.5 text-sm', styles, className)}>
      {children}
    </div>
  )
}
