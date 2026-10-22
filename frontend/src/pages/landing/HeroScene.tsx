import { Billboard, Line, Sparkles } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

const TEAL = '#2fd0e4'
const NAVY = '#0a1d38'

function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The logo's shield: flat top, straight sides, curved to a point at the bottom. */
function shieldShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-1.5, 1.4)
  s.lineTo(1.5, 1.4)
  s.lineTo(1.5, -0.1)
  s.bezierCurveTo(1.5, -1.0, 0.9, -1.55, 0, -1.95)
  s.bezierCurveTo(-0.9, -1.55, -1.5, -1.0, -1.5, -0.1)
  s.closePath()
  return s
}

function outlinePoints(): THREE.Vector2[] {
  const pts = shieldShape().getPoints(6)
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (first && last && first.distanceTo(last) < 1e-6) pts.pop()
  return pts
}

/** A faceted, domed front face: concentric rings of the outline, lifted toward the centre and jittered. */
function buildDome(): THREE.BufferGeometry {
  const rnd = rng(21)
  const outline = outlinePoints()
  const cy = -0.15
  const rings = [
    { k: 1, z: 0 },
    { k: 0.7, z: 0.2 },
    { k: 0.4, z: 0.34 },
    { k: 0.0, z: 0.42 },
  ]
  const ringPts: THREE.Vector3[][] = rings.map(({ k, z }, ri) =>
    ri === rings.length - 1
      ? [new THREE.Vector3(0, cy, z + 0.02)]
      : outline.map((p) => {
          const jitter = ri === 0 ? 0 : 0.09
          return new THREE.Vector3(
            p.x * k + (rnd() - 0.5) * jitter,
            cy + (p.y - cy) * k + (rnd() - 0.5) * jitter,
            z + (ri === 0 ? 0 : (rnd() - 0.5) * 0.1),
          )
        }),
  )

  const pos: number[] = []
  const col: number[] = []
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const cx = (a.x + b.x + c.x) / 3
    const cyy = (a.y + b.y + c.y) / 3
    // Logo panels: maroon / amber / steel in thirds, as a faint wash; most facets stay navy-teal.
    const third = cx < -0.5 ? 0 : cx < 0.5 ? 1 : 2
    const tint = [new THREE.Color('#802538'), new THREE.Color('#c6843d'), new THREE.Color('#306f97')][third]
    const base = new THREE.Color().setHSL(0.54 + rnd() * 0.04, 0.55 + rnd() * 0.2, 0.14 + rnd() * 0.1 + (cyy + 2) * 0.02)
    if (tint && rnd() < 0.18) base.lerp(tint, 0.45)
    for (const v of [a, b, c]) {
      pos.push(v.x, v.y, v.z)
      col.push(base.r, base.g, base.b)
    }
  }

  for (let r = 0; r < ringPts.length - 1; r++) {
    const A = ringPts[r]
    const B = ringPts[r + 1]
    if (!A || !B) continue
    const n = A.length
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const a0 = A[i]
      const a1 = A[j]
      if (!a0 || !a1) continue
      if (B.length === 1) {
        const c = B[0]
        if (c) push(a0, a1, c)
      } else {
        const b0 = B[i]
        const b1 = B[j]
        if (!b0 || !b1) continue
        push(a0, a1, b1)
        push(a0, b1, b0)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals() // non-indexed => flat shading per facet
  return g
}

function makeDiscTexture(emoji: string, label: string, accent: string): THREE.CanvasTexture | null {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(128, 110, 10, 128, 128, 128)
  grad.addColorStop(0, '#16385c')
  grad.addColorStop(1, NAVY)
  g.fillStyle = grad
  g.beginPath()
  g.arc(128, 128, 126, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 10
  g.strokeStyle = accent
  g.stroke()
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '92px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
  g.fillText(emoji, 128, 106)
  g.font = '600 30px Sora, Inter, system-ui, sans-serif'
  g.fillStyle = '#ffffff'
  g.fillText(label, 128, 190)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeGlowTexture(): THREE.CanvasTexture | null {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grad.addColorStop(0, 'rgba(47,208,228,0.55)')
  grad.addColorStop(0.5, 'rgba(47,208,228,0.16)')
  grad.addColorStop(1, 'rgba(47,208,228,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

function Shield() {
  const dome = useMemo(buildDome, [])
  const slab = useMemo(
    () =>
      new THREE.ExtrudeGeometry(shieldShape(), {
        depth: 0.28,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.06,
        bevelSegments: 1,
        curveSegments: 8,
      }),
    [],
  )
  const rim = useMemo(() => [...outlinePoints(), outlinePoints()[0]].filter(Boolean).map((p) => new THREE.Vector3(p!.x, p!.y, 0.03)), [])
  const glowTex = useMemo(makeGlowTexture, [])

  useEffect(
    () => () => {
      dome.dispose()
      slab.dispose()
      glowTex?.dispose()
    },
    [dome, slab, glowTex],
  )

  return (
    <group>
      {glowTex && (
        <mesh position={[0, -0.1, -0.5]}>
          <planeGeometry args={[7.5, 7.5]} />
          <meshBasicMaterial map={glowTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
      <mesh geometry={slab} position={[0, 0, -0.3]}>
        <meshStandardMaterial color="#14406b" metalness={0.1} roughness={0.55} emissive="#0a2f4d" emissiveIntensity={0.5} />
      </mesh>
      <mesh geometry={dome}>
        <meshStandardMaterial vertexColors flatShading side={THREE.DoubleSide} metalness={0.05} roughness={0.6} emissive="#0b5a6e" emissiveIntensity={0.45} />
      </mesh>
      <Line points={rim} color={TEAL} lineWidth={3} toneMapped={false} />
    </group>
  )
}

function Cctv() {
  const root = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = root.current
    if (!g) return
    const t = clock.elapsedTime
    g.rotation.z = 0.55 + Math.sin(t * 0.7) * 0.28 // aims down-left and sweeps across the shield
    g.rotation.y = Math.sin(t * 0.4) * 0.22
  })
  const beam = useMemo(() => {
    const geo = new THREE.ConeGeometry(1.15, 3.6, 28, 1, true)
    geo.translate(0, -1.8, 0) // apex at the origin, opening along -y
    return geo
  }, [])
  useEffect(() => () => beam.dispose(), [beam])

  return (
    <group position={[1.9, 2.0, 0.5]}>
      {/* wall mount */}
      <mesh position={[0.65, 0.1, 0]}>
        <boxGeometry args={[0.14, 0.7, 0.14]} />
        <meshStandardMaterial color="#9fb2c4" metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={root}>
        <mesh>
          <boxGeometry args={[1.15, 0.34, 0.34]} />
          <meshStandardMaterial color="#e9eff6" metalness={0.05} roughness={0.4} emissive="#4a5a6a" emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[1.22, 0.06, 0.44]} />
          <meshStandardMaterial color="#cbd6e2" metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.17, 0.17, 0.12, 24]} />
          <meshStandardMaterial color="#0a1d38" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[-0.67, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 0.03, 20]} />
          <meshBasicMaterial color={TEAL} toneMapped={false} />
        </mesh>
        {/* light beam */}
        <group position={[-0.7, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh geometry={beam}>
            <meshBasicMaterial
              color={TEAL}
              transparent
              opacity={0.075}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh geometry={beam} scale={[0.45, 1, 0.45]}>
            <meshBasicMaterial
              color="#bff6ff"
              transparent
              opacity={0.06}
              depthWrite={false}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  )
}

const DISCS = [
  { emoji: '🥖', label: 'Bakery', accent: '#c6843d' },
  { emoji: '🥩', label: 'Meat Shop', accent: '#b13a4a' },
  { emoji: '💂', label: 'Security', accent: '#4f93c4' },
] as const

const ORBIT_R = 2.55

function Orbit() {
  const spinner = useRef<THREE.Group>(null)
  const discRefs = useRef<(THREE.Group | null)[]>([])
  const ringRefs = useRef<(THREE.Mesh | null)[]>([])
  const reticle = useRef<THREE.Group>(null)
  const textures = useMemo(() => DISCS.map((d) => makeDiscTexture(d.emoji, d.label, d.accent)), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const state = useRef({ active: 0, since: 0 })

  useEffect(
    () => () => {
      for (const t of textures) t?.dispose()
    },
    [textures],
  )

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (spinner.current) spinner.current.rotation.y = t * 0.32

    const s = state.current
    const idx = Math.floor(t / 2.4) % DISCS.length
    if (idx !== s.active) {
      s.active = idx
      s.since = t
    }
    const disc = discRefs.current[s.active]
    const ret = reticle.current
    if (disc && ret) {
      disc.getWorldPosition(target)
      ret.parent?.worldToLocal(target)
      ret.position.lerp(target, 1 - Math.exp(-7 * dt))
      const hop = Math.exp(-(t - s.since) * 5) // pops out on every hop, then settles
      ret.scale.setScalar(1 + hop * 0.55 + Math.sin(t * 6) * 0.03)
      ret.rotation.z = t * 0.6
    }
    ringRefs.current.forEach((ring, i) => {
      if (!ring) return
      const on = i === s.active
      const k = on ? 1.14 : 1
      ring.scale.x += (k - ring.scale.x) * 0.12
      ring.scale.y = ring.scale.x
    })
  })

  const corner = (sx: number, sy: number) => (
    <group key={`${sx}${sy}`} position={[sx * 0.74, sy * 0.74, 0]}>
      <mesh position={[-sx * 0.1, 0, 0]}>
        <boxGeometry args={[0.24, 0.045, 0.02]} />
        <meshBasicMaterial color="#9ff3ff" toneMapped={false} />
      </mesh>
      <mesh position={[0, -sy * 0.1, 0]}>
        <boxGeometry args={[0.045, 0.24, 0.02]} />
        <meshBasicMaterial color="#9ff3ff" toneMapped={false} />
      </mesh>
    </group>
  )

  return (
    <group rotation={[0.32, 0, 0.06]}>
      <group ref={spinner}>
        {DISCS.map((d, i) => {
          const a = (i / DISCS.length) * Math.PI * 2
          const tex = textures[i]
          return (
            <group key={d.label} position={[Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R]}>
              <Billboard>
                <group ref={(el) => (discRefs.current[i] = el)}>
                  <mesh>
                    <circleGeometry args={[0.52, 40]} />
                    {tex ? <meshBasicMaterial map={tex} toneMapped={false} /> : <meshBasicMaterial color={d.accent} />}
                  </mesh>
                  <mesh ref={(el) => (ringRefs.current[i] = el)} position={[0, 0, -0.01]}>
                    <ringGeometry args={[0.55, 0.6, 48]} />
                    <meshBasicMaterial color={d.accent} toneMapped={false} />
                  </mesh>
                </group>
              </Billboard>
            </group>
          )
        })}
      </group>
      {/* scan reticle: follows whichever disc is "being scanned" */}
      <Billboard>
        <group ref={reticle}>
          {corner(1, 1)}
          {corner(-1, 1)}
          {corner(1, -1)}
          {corner(-1, -1)}
          <mesh>
            <ringGeometry args={[0.04, 0.07, 20]} />
            <meshBasicMaterial color="#9ff3ff" toneMapped={false} />
          </mesh>
        </group>
      </Billboard>
    </group>
  )
}

/** Keeps the whole orbit in frame: pulls the camera back when the canvas is narrower than tall. */
function FitCamera() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    const halfFov = THREE.MathUtils.degToRad(cam.fov / 2)
    const neededWidth = 7.6 // orbit radius + disc + margin, in world units
    cam.position.z = Math.max(9.2, neededWidth / (2 * Math.tan(halfFov) * aspect))
    cam.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

function World() {
  const root = useRef<THREE.Group>(null)
  const shield = useRef<THREE.Group>(null)
  useFrame(({ pointer, clock }) => {
    const r = root.current
    if (r) {
      // pointer parallax: the whole scene leans toward the cursor
      r.rotation.y += (pointer.x * 0.38 - r.rotation.y) * 0.06
      r.rotation.x += (-pointer.y * 0.2 - r.rotation.x) * 0.06
    }
    const s = shield.current
    if (s) {
      s.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.06
      s.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.14
    }
  })
  return (
    <>
      <FitCamera />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} color="#d6fbff" />
      <pointLight position={[-4, -2, 3]} intensity={40} color="#3f86b5" />
      <pointLight position={[3, 2, 2]} intensity={25} color={TEAL} />
      <group ref={root}>
        <group ref={shield}>
          <Shield />
        </group>
        <Cctv />
        <Orbit />
      </group>
      <Sparkles count={70} scale={[8, 6, 4]} size={3.2} speed={0.35} opacity={0.85} color="#7be7f2" />
    </>
  )
}

/** Lazy-loaded by HeroVisual. `active` is false while the hero is off-screen, which stops the render loop. */
export default function HeroScene({ active, lowPower }: { active: boolean; lowPower: boolean }) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [0, 0.2, 9.2], fov: 40 }}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'pan-y' }}
      aria-hidden
    >
      <World />
    </Canvas>
  )
}
