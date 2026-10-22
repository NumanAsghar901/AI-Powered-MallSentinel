import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Department } from '@/lib/types'

const ITEMS: Record<Department['code'], string[]> = {
  bakery: ['Hairnet on', 'Gloves on', 'Mask on', 'Apron on'],
  meat_shop: ['Hairnet on', 'Gloves on', 'Mask on', 'Apron on'],
  security: ['Uniform correct', 'Weapon carried', 'At assigned duty zone'],
}

function storageKey(userId: string): string {
  return `ms-selfcheck:${userId}:${new Date().toISOString().slice(0, 10)}`
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 44
  const c = 2 * Math.PI * r
  const complete = total > 0 && done === total
  const color = complete ? 'hsl(152 60% 45%)' : 'hsl(190 85% 48%)'
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 110 110" className="-rotate-90" aria-hidden>
        <circle cx="55" cy="55" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - (total ? done / total : 0))}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1), stroke .3s', filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-2xl font-bold">
          {done}/{total}
        </span>
      </div>
    </div>
  )
}

/** A tick-list of the section's SOP checks. A personal reminder kept on this device; it is not sent anywhere. */
export function SelfCheck({ userId, department, title }: { userId: string; department: Department | null; title: string }) {
  const items = department ? ITEMS[department.code] : []
  const [checked, setChecked] = useState<boolean[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(userId)) ?? 'null') as boolean[] | null
      if (Array.isArray(saved) && saved.length === items.length) return saved
    } catch {
      /* storage unavailable */
    }
    return items.map(() => false)
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(checked))
    } catch {
      /* storage unavailable */
    }
  }, [checked, userId])

  const done = checked.filter(Boolean).length
  const complete = items.length > 0 && done === items.length

  if (!department) return null
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <Ring done={done} total={items.length} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={() => setChecked(items.map(() => false))}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" aria-hidden /> Reset
          </button>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked[i] ?? false}
                onClick={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-all',
                  checked[i]
                    ? 'border-[hsl(190_70%_45%/0.6)] bg-[hsl(190_80%_40%/0.12)] shadow-[0_0_22px_-8px_hsl(190_85%_50%)]'
                    : 'hover:bg-accent',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    checked[i] ? 'border-transparent bg-[hsl(190_85%_42%)] text-white' : 'border-input',
                  )}
                >
                  {checked[i] && <Check className="size-3.5" aria-hidden />}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {complete
            ? 'All set. Have a good shift. 🎉'
            : 'A personal pre-shift reminder. It stays on this device and is not sent to anyone.'}
        </p>
      </div>
    </div>
  )
}
