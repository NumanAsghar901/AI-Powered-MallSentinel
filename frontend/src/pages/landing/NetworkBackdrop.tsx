import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from './motion'

/**
 * An interactive low-poly web. Every node sits on a spring around its home position and drifts gently; the cursor
 * pushes nearby nodes away (they spring back) and lights up lines from the cursor to the nodes around it.
 * Colour comes from `currentColor` (set it with a text-* class). One shared pointer listener serves all instances,
 * and a canvas only animates while it is on screen.
 */

interface Node {
  hx: number
  hy: number
  x: number
  y: number
  vx: number
  vy: number
  ph: number
}

const cursor = { x: -9999, y: -9999 }
let subscribers = 0

function onMove(e: PointerEvent) {
  cursor.x = e.clientX
  cursor.y = e.clientY
}
function onLeave() {
  cursor.x = cursor.y = -9999
}
function subscribe() {
  if (subscribers++ === 0) {
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
  }
  return () => {
    if (--subscribers === 0) {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }
}

function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function parseColor(css: string): [number, number, number] {
  const m = css.match(/[\d.]+/g)
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [120, 220, 235]
}

export function MeshBackdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    let w = 0
    let h = 0
    let cols = 0
    let spacing = 120
    let nodes: Node[] = []
    let raf = 0
    let visible = false
    let frame = 0
    let rgb: [number, number, number] = [120, 220, 235]
    let dark = true
    const unsubscribe = reduced ? () => undefined : subscribe()

    const readColor = () => {
      rgb = parseColor(getComputedStyle(canvas).color)
      dark = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 128
    }

    const build = () => {
      const r = canvas.getBoundingClientRect()
      w = r.width
      h = r.height
      if (w === 0 || h === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      spacing = w < 640 ? 84 : w < 1100 ? 104 : 122
      cols = Math.ceil(w / spacing) + 2
      const rows = Math.ceil(h / spacing) + 2
      const rnd = seeded(7)
      nodes = []
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const hx = (i - 0.5) * spacing + (rnd() - 0.5) * spacing * 0.55
          const hy = (j - 0.5) * spacing + (rnd() - 0.5) * spacing * 0.55
          nodes.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, ph: rnd() * Math.PI * 2 })
        }
      }
      readColor()
      draw(performance.now(), false)
    }

    const draw = (t: number, interactive: boolean) => {
      ctx.clearRect(0, 0, w, h)
      const [r, g, b] = rgb
      const rect = canvas.getBoundingClientRect()
      const cx = cursor.x - rect.left
      const cy = cursor.y - rect.top
      const R = 170
      const R2 = R * R
      const edgeAlpha = dark ? 0.16 : 0.22

      if (interactive) {
        for (const n of nodes) {
          // spring toward home (with a slow drift), damped
          const tx = n.hx + Math.sin(t * 0.0004 + n.ph) * 9
          const ty = n.hy + Math.cos(t * 0.00046 + n.ph) * 9
          n.vx += (tx - n.x) * 0.04
          n.vy += (ty - n.y) * 0.04
          // the cursor "hits" nodes: push them away, harder the closer they are
          const dx = n.x - cx
          const dy = n.y - cy
          const d2 = dx * dx + dy * dy
          if (d2 < R2 && d2 > 1) {
            const d = Math.sqrt(d2)
            const f = (1 - d / R) ** 2 * 5.5
            n.vx += (dx / d) * f
            n.vy += (dy / d) * f
          }
          n.vx *= 0.84
          n.vy *= 0.84
          n.x += n.vx
          n.y += n.vy
        }
      }

      // web: each node joins its right, lower and lower-right neighbours
      ctx.lineWidth = 1
      for (let idx = 0; idx < nodes.length; idx++) {
        const a = nodes[idx]
        if (!a) continue
        const targets = [nodes[idx + 1], nodes[idx + cols], (idx % 2 === 0 ? nodes[idx + cols + 1] : undefined)]
        for (const bNode of targets) {
          if (!bNode || (bNode === nodes[idx + 1] && (idx + 1) % cols === 0)) continue
          const mx = (a.x + bNode.x) / 2 - cx
          const my = (a.y + bNode.y) / 2 - cy
          const near = Math.max(0, 1 - Math.sqrt(mx * mx + my * my) / (R * 1.15))
          ctx.strokeStyle = `rgba(${r},${g},${b},${edgeAlpha + near * 0.5})`
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(bNode.x, bNode.y)
          ctx.stroke()
        }
      }

      // nodes, brighter and larger near the cursor
      for (const n of nodes) {
        const dx = n.x - cx
        const dy = n.y - cy
        const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / R)
        ctx.fillStyle = `rgba(${r},${g},${b},${(dark ? 0.35 : 0.4) + near * 0.6})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.6 + near * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      // lines from the cursor to the nodes around it
      if (interactive && cx > -R && cx < w + R && cy > -R && cy < h + R) {
        for (const n of nodes) {
          const dx = n.x - cx
          const dy = n.y - cy
          const d2 = dx * dx + dy * dy
          if (d2 > (R * 1.25) ** 2) continue
          const k = 1 - Math.sqrt(d2) / (R * 1.25)
          ctx.strokeStyle = `rgba(${r},${g},${b},${k * 0.75})`
          ctx.lineWidth = 1 + k * 0.8
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(n.x, n.y)
          ctx.stroke()
        }
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70)
        glow.addColorStop(0, `rgba(${r},${g},${b},${dark ? 0.35 : 0.28})`)
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, 70, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = (t: number) => {
      raf = 0
      if (!visible || document.hidden) return
      if (++frame % 90 === 0) readColor() // picks up theme changes
      draw(t, true)
      raf = requestAnimationFrame(loop)
    }

    build()
    const ro = new ResizeObserver(build)
    ro.observe(canvas)

    let io: IntersectionObserver | undefined
    if (!reduced && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        visible = Boolean(entry?.isIntersecting)
        if (visible && !raf) raf = requestAnimationFrame(loop)
      })
      io.observe(canvas)
    }
    const onVisibility = () => {
      if (!document.hidden && visible && !raf) raf = requestAnimationFrame(loop)
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unsubscribe()
      ro.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [reduced])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', className)} />
}
