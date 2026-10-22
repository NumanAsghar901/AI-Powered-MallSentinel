import { useRef, type CSSProperties, type ElementType, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './motion'

/**
 * A card with a cursor-following spotlight and border highlight (see `.spot` in index.css), an optional 3D tilt
 * (`tilt` = max degrees) and a lift on hover. Touch input and reduced-motion users get the static card.
 */
export function SpotlightCard({
  as: Tag = 'div',
  tilt = 0,
  className,
  style,
  children,
}: {
  as?: ElementType
  tilt?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLElement | null>(null)
  const reduced = usePrefersReducedMotion()

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)
    if (tilt && !reduced) {
      el.classList.remove('tilt-leave')
      const px = x / r.width - 0.5
      const py = y / r.height - 0.5
      el.style.transform = `perspective(1000px) rotateX(${(-py * tilt).toFixed(2)}deg) rotateY(${(px * tilt).toFixed(2)}deg) translateY(-4px)`
    }
  }
  const onLeave = () => {
    const el = ref.current
    if (!el || !tilt) return
    el.classList.add('tilt-leave')
    el.style.transform = ''
  }

  return (
    <Tag
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={style}
      className={cn('spot lift', tilt ? 'tilt' : '', className)}
    >
      {children}
    </Tag>
  )
}
