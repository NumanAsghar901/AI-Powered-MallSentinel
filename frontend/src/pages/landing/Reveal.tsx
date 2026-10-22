import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Fades an element in once when it scrolls into view. The CSS lives in index.css and is switched off entirely under
 * prefers-reduced-motion (and when JavaScript is unavailable, content is simply visible).
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  variant,
  className,
  children,
}: {
  as?: ElementType
  delay?: number
  variant?: 'left' | 'right' | 'zoom' | 'blur'
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const style: CSSProperties | undefined = delay ? ({ '--d': `${delay}ms` } as CSSProperties) : undefined
  return (
    <Tag ref={ref} data-v={variant} className={cn('reveal', className)} style={style}>
      {children}
    </Tag>
  )
}
