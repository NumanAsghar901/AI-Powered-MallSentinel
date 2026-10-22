import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '@/pages/landing/motion'

/** Eases a number from 0 to `to` whenever `to` changes. Reduced-motion users get the final value straight away. */
export function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const reduced = usePrefersReducedMotion()
  const [value, setValue] = useState(reduced ? to : 0)
  useEffect(() => {
    if (reduced) {
      setValue(to)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, duration, reduced])
  return <>{value}</>
}
