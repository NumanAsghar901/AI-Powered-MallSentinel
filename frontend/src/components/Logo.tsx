import { cn } from '@/lib/utils'

/**
 * The shield-and-camera mark from the logo, with a transparent background (public/logo-mark.png).
 * It sits on navy surfaces, so a faint light edge and teal glow keep the dark outline readable.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      className={cn(
        'shrink-0 object-contain [filter:drop-shadow(0_0_1px_rgb(255_255_255/0.85))_drop-shadow(0_0_8px_hsl(190_85%_55%/0.45))]',
        className,
      )}
    />
  )
}

export function Wordmark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('font-heading text-lg font-bold leading-none tracking-tight', className)}>
      <span className={onDark ? 'text-white' : 'text-brand-navy dark:text-foreground'}>Mall</span>
      <span className={onDark ? 'text-[hsl(190_70%_62%)]' : 'text-brand-teal'}>Sentinel</span>
    </span>
  )
}
