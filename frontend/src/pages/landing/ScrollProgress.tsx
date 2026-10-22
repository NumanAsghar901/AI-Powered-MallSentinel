import { useEffect, useRef } from 'react'

/** Thin teal bar at the very top that fills as the page scrolls. Updates a CSS variable, so no re-renders. */
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      el.style.setProperty('--sp', String(max > 0 ? Math.min(1, window.scrollY / max) : 0))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return <div ref={ref} className="scroll-progress" role="presentation" aria-hidden />
}
