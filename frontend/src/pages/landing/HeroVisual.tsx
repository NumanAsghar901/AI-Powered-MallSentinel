import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { detectWebGL, useInView, usePrefersReducedMotion } from './motion'
import { ShieldMesh } from './ShieldMesh'

// three.js is a separate chunk, fetched after first paint so it never delays the headline.
const HeroScene = lazy(() => import('./HeroScene'))

function StaticShield() {
  return (
    <div className="flex size-full items-center justify-center overflow-hidden">
      <ShieldMesh className="max-h-full max-w-[20rem] drop-shadow-[0_20px_50px_hsl(190_85%_40%/0.4)]" />
    </div>
  )
}

/** If the WebGL context cannot be created at runtime, fall back to the static shield instead of a blank box. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch() {
    /* the fallback is already rendering */
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function HeroVisual() {
  const reduced = usePrefersReducedMotion()
  const [webgl] = useState(detectWebGL)
  const [ready, setReady] = useState(false)
  const [ref, inView] = useInView<HTMLDivElement>('120px')
  const [lowPower] = useState(() => window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 200)
    return () => window.clearTimeout(id)
  }, [])

  const use3d = webgl && !reduced && ready
  return (
    <div ref={ref} className="absolute inset-0">
      {use3d ? (
        <SceneBoundary fallback={<StaticShield />}>
          <Suspense fallback={<StaticShield />}>
            <HeroScene active={inView} lowPower={lowPower} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <StaticShield />
      )}
    </div>
  )
}
