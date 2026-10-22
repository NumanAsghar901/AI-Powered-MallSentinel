import { Pause, Play } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { useInView, usePrefersReducedMotion } from './motion'
import { MeshBackdrop } from './ShieldMesh'
import { Reveal } from './Reveal'
import { SectionHeading } from './SectionHeading'
import { SpotlightCard } from './SpotlightCard'

const STEP_MS = 4200

const STEPS = [
  { key: 'watch', icon: '📹', title: 'Watch', blurb: 'Three cameras stream in. Nothing is recorded continuously.' },
  { key: 'detect', icon: '👁️', title: 'Detect', blurb: 'Vision finds a worker handling food without gloves in the Bakery.' },
  { key: 'match', icon: '📚', title: 'Match SOP clause', blurb: 'The AI agent retrieves the clause that applies.' },
  { key: 'brief', icon: '🚨', title: 'Brief & alert', blurb: 'Severity is rated, the brief is drafted, both people are alerted.' },
  { key: 'decide', icon: '🔏', title: 'Decide & seal', blurb: 'The supervisor decides. The decision is sealed in the ledger.' },
] as const

type Phase = 'watch' | 'detect' | 'match' | 'alert' | 'sealed'
const PHASE_BY_STEP: Phase[] = ['watch', 'detect', 'match', 'alert', 'sealed']

// -------------------------------------------------------------------------------- camera tiles

type Variant = 'bakery' | 'meat' | 'security'

const SKIN = '#d4a07a'

function Person({ variant, gloves }: { variant: Variant; gloves: boolean }) {
  const body = variant === 'security' ? '#1d3558' : '#eef3f8'
  return (
    <g className="sway">
      <rect x="138" y="96" width="44" height="72" rx="12" fill={body} />
      {variant !== 'security' && <rect x="146" y="112" width="28" height="56" rx="4" fill="#cfd9e4" />}
      <circle cx="160" cy="80" r="17" fill={SKIN} />
      {variant === 'security' ? (
        <>
          <path d="M142 76a18 12 0 0 1 36 0z" fill="#12284a" />
          <rect x="140" y="74" width="40" height="5" rx="2" fill="#0b1b36" />
        </>
      ) : (
        <>
          <path d="M143 76a17 16 0 0 1 34 0z" fill="#e9f0f7" />
          <rect x="150" y="84" width="20" height="9" rx="3" fill="#bfe0ee" />
        </>
      )}
      <circle cx="134" cy="132" r="8" fill={variant === 'security' ? SKIN : gloves ? '#58b7d6' : SKIN} />
      <circle cx="186" cy="132" r="8" fill={variant === 'security' ? SKIN : gloves ? '#58b7d6' : SKIN} />
      {variant === 'security' && <rect x="176" y="138" width="14" height="6" rx="2" fill="#0a1426" />}
    </g>
  )
}

function Scene({ variant }: { variant: Variant }) {
  if (variant === 'bakery') {
    return (
      <>
        <rect width="320" height="200" fill="#1d1a17" />
        <rect y="40" width="320" height="6" fill="#3a2e22" />
        <rect y="150" width="320" height="50" fill="#33261a" />
        <rect y="150" width="320" height="4" fill="#c6843d" opacity="0.7" />
        {[24, 64, 220, 262].map((x) => (
          <g key={x}>
            <ellipse cx={x} cy="144" rx="20" ry="6" fill="#9a6a30" />
            <ellipse cx={x} cy="140" rx="16" ry="9" fill="#c6843d" />
          </g>
        ))}
        {[18, 90, 190, 250].map((x) => (
          <rect key={x} x={x} y="62" width="46" height="8" rx="2" fill="#4a3826" />
        ))}
      </>
    )
  }
  if (variant === 'meat') {
    return (
      <>
        <rect width="320" height="200" fill="#1a1416" />
        <rect y="38" width="320" height="4" fill="#4a2a30" />
        {[28, 76, 232, 280].map((x) => (
          <g key={x}>
            <line x1={x} y1="42" x2={x} y2="62" stroke="#8a8f99" strokeWidth="2" />
            <path d={`M${x - 10} 62 q10 -6 20 0 q4 28 -10 44 q-14 -16 -10 -44z`} fill="#802538" />
          </g>
        ))}
        <rect y="152" width="320" height="48" fill="#2a1a1d" />
        <rect y="152" width="320" height="4" fill="#b13a4a" opacity="0.7" />
      </>
    )
  }
  return (
    <>
      <rect width="320" height="200" fill="#121a26" />
      <rect x="226" y="34" width="62" height="112" rx="3" fill="#1b2a3e" />
      <rect x="232" y="40" width="50" height="100" rx="2" fill="#0f1a29" />
      <polygon points="40,200 280,200 250,150 70,150" fill="#16222f" />
      <polygon
        points="86,196 244,196 226,156 102,156"
        fill="hsl(207 52% 40% / 0.12)"
        stroke="hsl(207 62% 62%)"
        strokeWidth="1.5"
        strokeDasharray="6 5"
      />
    </>
  )
}

interface Tag {
  label: string
  tone: 'ok' | 'alert' | 'info'
  box: [number, number, number, number]
}

const TONE: Record<Tag['tone'], string> = {
  ok: 'hsl(152 62% 52%)',
  alert: 'hsl(0 80% 62%)',
  info: 'hsl(190 90% 62%)',
}

function Detection({ tag }: { tag: Tag }) {
  const [x, y, w, h] = tag.box
  const c = TONE[tag.tone]
  const tw = tag.label.length * 5.6 + 12
  return (
    <g className="pop-in">
      <rect x={x} y={y} width={w} height={h} rx="3" fill="none" stroke={c} strokeWidth="1.6" strokeOpacity="0.95" className="box-pulse" />
      <path d={`M${x} ${y + 8}V${y}H${x + 8}M${x + w - 8} ${y}H${x + w}V${y + 8}M${x + w} ${y + h - 8}V${y + h}H${x + w - 8}M${x + 8} ${y + h}H${x}V${y + h - 8}`} fill="none" stroke={c} strokeWidth="2.6" />
      <rect x={x} y={Math.max(2, y - 14)} width={tw} height="13" rx="2" fill={c} />
      <text x={x + 6} y={Math.max(2, y - 14) + 9.5} fontSize="8.5" fontWeight="700" fill="#06121f" fontFamily="Inter, sans-serif">
        {tag.label}
      </text>
    </g>
  )
}

function tagFor(variant: Variant, phase: Phase): Tag | null {
  if (phase === 'watch') return null
  if (variant === 'bakery') {
    if (phase === 'detect') return { label: 'GLOVES: NOT FOUND 0.94', tone: 'alert', box: [112, 116, 96, 30] }
    if (phase === 'match') return { label: 'SOP 3.2 MATCHED', tone: 'info', box: [112, 116, 96, 30] }
    if (phase === 'alert') return { label: 'HIGH · ALERT SENT', tone: 'alert', box: [112, 116, 96, 30] }
    return { label: 'SEALED #1043', tone: 'ok', box: [112, 116, 96, 30] }
  }
  if (variant === 'meat') return { label: 'PPE 4/4', tone: 'ok', box: [130, 60, 60, 112] }
  return { label: 'UNIFORM · ZONE OK', tone: 'ok', box: [130, 60, 60, 112] }
}

function CamTile({ variant, cam, name, phase, clock, className, compact = false }: { variant: Variant; cam: string; name: string; phase: Phase; clock: string; className?: string; compact?: boolean }) {
  const alerting = variant === 'bakery' && (phase === 'detect' || phase === 'match' || phase === 'alert')
  const tag = tagFor(variant, phase)
  return (
    <div
      className={cn(
        'scanlines relative aspect-[16/10] overflow-hidden rounded-xl border bg-black transition-shadow duration-500',
        alerting ? 'border-red-400/60 shadow-[0_0_28px_-6px_hsl(0_80%_60%/0.7)]' : 'border-white/10',
        className,
      )}
    >
      <svg viewBox="0 0 320 200" className="absolute inset-0 size-full" role="img" aria-label={`${name} camera, simulated`}>
        <Scene variant={variant} />
        <Person variant={variant} gloves={variant !== 'bakery' || phase === 'watch'} />
        {tag && <Detection key={`${variant}-${phase}`} tag={tag} />}
      </svg>
      <div className="scan-sweep" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.55))]" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2 text-[10px] font-semibold tracking-wider text-white/90 sm:text-[11px]">
        <span className="rounded bg-black/50 px-1.5 py-0.5">
          {cam}
          <span className={compact ? 'max-sm:hidden' : ''}> · {name.toUpperCase()}</span>
        </span>
        <span className="flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5">
          <span className="rec-dot size-1.5 rounded-full bg-red-500" aria-hidden /> REC
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-2 font-mono text-[10px] text-white/80 sm:text-[11px]">
        <span className="rounded bg-black/50 px-1.5 py-0.5">{clock}</span>
        <span className="rounded bg-black/50 px-1.5 py-0.5 text-[hsl(190_90%_70%)]">SIMULATION</span>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------------- step output panel

function Output({ step }: { step: number }) {
  const wrap = 'pop-in space-y-3 text-sm'
  if (step === 0) {
    return (
      <div key={step} className={wrap}>
        <p className="text-[hsl(213_26%_78%)]">Streams connected</p>
        {['CAM 01 · Bakery', 'CAM 02 · Meat Shop', 'CAM 03 · Security'].map((c) => (
          <p key={c} className="flex items-center justify-between rounded-lg bg-white/[0.05] px-3 py-2">
            {c} <span className="text-emerald-300">● Live</span>
          </p>
        ))}
      </div>
    )
  }
  if (step === 1) {
    return (
      <div key={step} className={wrap}>
        <p className="text-[hsl(213_26%_78%)]">Detections this frame</p>
        <p className="rounded-lg bg-red-500/15 px-3 py-2 text-red-200">Bakery · Gloves not found (0.94)</p>
        <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-200">Meat Shop · PPE 4/4</p>
        <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-200">Security · Uniform and zone OK</p>
      </div>
    )
  }
  if (step === 2) {
    return (
      <div key={step} className={wrap}>
        <p className="text-[hsl(213_26%_78%)]">Clause retrieved from the SOP library</p>
        <div className="rounded-xl border border-[hsl(190_70%_55%/0.4)] bg-[hsl(190_80%_40%/0.12)] p-3.5">
          <p className="text-xs font-semibold text-[hsl(190_80%_72%)]">SOP §3.2 · Hand hygiene · match 0.91</p>
          <p className="mt-1.5 leading-relaxed">Food handlers must wear single-use gloves while preparing, handling or serving open food.</p>
        </div>
        <p className="text-xs text-[hsl(213_26%_66%)]">Example clause text for illustration.</p>
      </div>
    )
  }
  if (step === 3) {
    return (
      <div key={step} className={wrap}>
        <p className="flex items-center gap-2">
          <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-200">HIGH</span>
          <span className="text-[hsl(213_26%_78%)]">Incident brief · draft</span>
        </p>
        <p className="rounded-xl bg-white/[0.05] p-3.5 leading-relaxed">
          Worker at the Bakery counter handled open food without gloves at 10:42:07. Clause §3.2 breached. Evidence: 1
          snapshot, 6 s clip.
        </p>
        <p className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-2.5 py-1">📲 Supervisor notified</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1">📲 Employee notified</span>
        </p>
      </div>
    )
  }
  return (
    <div key={step} className={wrap}>
      <p className="text-[hsl(213_26%_78%)]">Supervisor decision</p>
      <div className="flex gap-2">
        {['Approve', 'Modify', 'Waive'].map((b) => (
          <span
            key={b}
            className={cn(
              'flex-1 rounded-lg border px-2 py-2 text-center text-xs font-semibold',
              b === 'Approve' ? 'border-emerald-300/60 bg-emerald-400/15 text-emerald-200' : 'border-white/10 text-white/60',
            )}
          >
            {b === 'Approve' ? '✓ ' : ''}
            {b}
          </span>
        ))}
      </div>
      <p className="rounded-xl bg-white/[0.05] p-3">Penalty approved: written warning.</p>
      <p className="rounded-xl border border-[hsl(190_70%_55%/0.4)] bg-[hsl(190_80%_40%/0.12)] p-3 font-mono text-xs">
        🔏 Ledger #1043 · sha256 9f3a…c71e · sealed
      </p>
    </div>
  )
}

function useClock(active: boolean): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now.toLocaleTimeString('en-GB', { hour12: false })
}

export function LiveDemo() {
  const reduced = usePrefersReducedMotion()
  const [ref, inView] = useInView<HTMLDivElement>()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const clock = useClock(inView)
  const autoplay = playing && inView && !reduced

  useEffect(() => {
    if (!autoplay) return
    const id = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => window.clearTimeout(id)
  }, [autoplay, step])

  const phase = PHASE_BY_STEP[step] ?? 'watch'

  return (
    <section id="demo" className="relative isolate overflow-hidden bg-ln-2 ln-mix-c py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="steel-glow pointer-events-none parallax absolute -right-32 top-10 size-[38rem] -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute -left-32 bottom-0 size-[34rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="teal-glow pointer-events-none parallax absolute left-1/2 top-1/3 -z-10 size-[52rem] -translate-x-1/2 opacity-60" aria-hidden />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          onDark
          eyebrow="Live demo"
          title="Watch a *violation* travel from camera to *ledger*"
          description="A simulated CCTV wall. It plays by itself, or click any step to jump to it."
        />

        <div ref={ref} className="mt-14">
          <Reveal variant="zoom">
          <SpotlightCard tilt={3} className="glass-navy rounded-3xl p-4 sm:p-6">
            {/* header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="rec-dot size-2 rounded-full bg-red-500" aria-hidden /> MallSentinel · Operations wall
              </p>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-[hsl(190_70%_55%/0.5)] px-3 py-1 text-xs font-semibold tracking-wider text-[hsl(190_90%_72%)]">
                  SIMULATION · NOT REAL FOOTAGE
                </span>
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? 'Pause the demo' : 'Play the demo'}
                  className="flex size-9 items-center justify-center rounded-full border border-white/15 hover:bg-white/10"
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
              {/* camera wall */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
                <CamTile className="col-span-2 sm:col-span-1 lg:col-span-2" variant="bakery" cam="CAM 01" name="Bakery" phase={phase} clock={clock} />
                <CamTile compact variant="meat" cam="CAM 02" name="Meat Shop" phase={phase} clock={clock} />
                <CamTile compact variant="security" cam="CAM 03" name="Security" phase={phase} clock={clock} />
              </div>

              {/* steps + output */}
              <div className="flex flex-col gap-4">
                <ol className="space-y-2" aria-label="Demo steps">
                  {STEPS.map((s, i) => {
                    const active = i === step
                    return (
                      <li key={s.key}>
                        <button
                          type="button"
                          onClick={() => setStep(i)}
                          aria-current={active ? 'step' : undefined}
                          className={cn(
                            'relative w-full overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-colors',
                            active ? 'border-[hsl(190_70%_55%/0.6)] bg-[hsl(190_80%_40%/0.14)]' : 'border-white/10 hover:bg-white/[0.05]',
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span className="text-xl" aria-hidden>{s.icon}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold">
                                {i + 1}. {s.title}
                              </span>
                              {active && <span className="block text-xs text-[hsl(213_26%_78%)]">{s.blurb}</span>}
                            </span>
                          </span>
                          {active && autoplay && (
                            <span
                              key={`${step}-${autoplay}`}
                              className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[hsl(190_90%_60%)]"
                              style={{ animation: `step-progress ${STEP_MS}ms linear forwards` } as CSSProperties}
                              aria-hidden
                            />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ol>
                <div className="min-h-[13.5rem] rounded-2xl border border-white/10 bg-black/25 p-4" aria-live="polite">
                  <Output step={step} />
                </div>
              </div>
            </div>
          </SpotlightCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
