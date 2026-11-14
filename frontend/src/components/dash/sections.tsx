import { useEffect, useMemo, useState } from 'react'
import type { Department } from '@/lib/types'

export const SECTION_COLOR: Record<Department['code'], string> = {
  bakery: 'hsl(33 70% 52%)',
  meat_shop: 'hsl(352 62% 52%)',
  security: 'hsl(207 66% 56%)',
}

export const DEPARTMENT_SECTIONS: Record<Department['code'], string[]> = {
  bakery: [
    'Bakery Prep Table 1',
    'Oven Station South',
    'Pastry Display Counter',
    'Dough Mixer Area',
    'Packaging Line West',
  ],
  meat_shop: [
    'Butcher Block Alpha',
    'Cold Storage Carcass Area',
    'Meat Grinder Station',
    'Bone Saw Cutting Station',
    'Meat Packaging Counter',
  ],
  security: [
    'Main Mall Entrance Gate A',
    'Cashier & Vault Perimeter',
    'Rear Loading Dock & Bay',
    'North Corridor Turnstiles',
    'Basement Parking Entry',
  ],
}

const STORAGE_KEY = 'mallsentinel_department_workstations_v2'

export function getCustomWorkstations(): Record<string, string[]> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return { ...DEPARTMENT_SECTIONS }
    const parsed = JSON.parse(raw) as Record<string, string[]>
    return {
      bakery: Array.isArray(parsed.bakery) && parsed.bakery.length > 0 ? parsed.bakery : DEPARTMENT_SECTIONS.bakery,
      meat_shop: Array.isArray(parsed.meat_shop) && parsed.meat_shop.length > 0 ? parsed.meat_shop : DEPARTMENT_SECTIONS.meat_shop,
      security: Array.isArray(parsed.security) && parsed.security.length > 0 ? parsed.security : DEPARTMENT_SECTIONS.security,
      ...parsed,
    }
  } catch {
    return { ...DEPARTMENT_SECTIONS }
  }
}

export function saveCustomWorkstations(data: Record<string, string[]>): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      window.dispatchEvent(new Event('mallsentinel:workstations-updated'))
    }
  } catch (e) {
    console.error('Failed to save custom workstations', e)
  }
}

export function addWorkstation(deptCode: string, name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return getCustomWorkstations()[deptCode] || []
  const current = getCustomWorkstations()
  const list = current[deptCode]
    ? [...current[deptCode]]
    : DEPARTMENT_SECTIONS[deptCode as keyof typeof DEPARTMENT_SECTIONS]
    ? [...DEPARTMENT_SECTIONS[deptCode as keyof typeof DEPARTMENT_SECTIONS]]
    : []
  if (!list.includes(trimmed)) {
    list.push(trimmed)
    current[deptCode] = list
    saveCustomWorkstations(current)
  }
  return list
}

export function removeWorkstation(deptCode: string, name: string): string[] {
  const current = getCustomWorkstations()
  const list = (
    current[deptCode] ||
    DEPARTMENT_SECTIONS[deptCode as keyof typeof DEPARTMENT_SECTIONS] ||
    []
  ).filter((w) => w !== name)
  current[deptCode] = list
  saveCustomWorkstations(current)
  return list
}

export function resetWorkstations(deptCode?: string): Record<string, string[]> {
  const current = getCustomWorkstations()
  if (deptCode && deptCode in DEPARTMENT_SECTIONS) {
    current[deptCode] = [...DEPARTMENT_SECTIONS[deptCode as keyof typeof DEPARTMENT_SECTIONS]]
  } else {
    for (const [k, v] of Object.entries(DEPARTMENT_SECTIONS)) {
      current[k] = [...v]
    }
  }
  saveCustomWorkstations(current)
  return current
}

export function useDepartmentWorkstations(deptCode?: string) {
  const [allWorkstations, setAllWorkstations] = useState<Record<string, string[]>>(() => getCustomWorkstations())

  useEffect(() => {
    const handleUpdate = () => {
      setAllWorkstations(getCustomWorkstations())
    }
    window.addEventListener('mallsentinel:workstations-updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('mallsentinel:workstations-updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const stations = useMemo(() => {
    if (!deptCode) return []
    return allWorkstations[deptCode] || DEPARTMENT_SECTIONS[deptCode as keyof typeof DEPARTMENT_SECTIONS] || []
  }, [allWorkstations, deptCode])

  return {
    stations,
    allWorkstations,
    addStation: (name: string) => (deptCode ? addWorkstation(deptCode, name) : []),
    removeStation: (name: string) => (deptCode ? removeWorkstation(deptCode, name) : []),
    resetStations: () => (deptCode ? resetWorkstations(deptCode) : resetWorkstations()),
  }
}

/** Section chip for the always-navy dashboard banner: a coloured dot and white text, readable in both themes. */
export function SectionChip({ department }: { department: Department | null }) {
  if (!department) return null
  const color = SECTION_COLOR[department.code]
  return (
    <span className="glass-navy inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white">
      <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden />
      {department.name}
    </span>
  )
}
