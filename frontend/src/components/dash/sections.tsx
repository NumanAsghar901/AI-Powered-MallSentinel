import type { Department } from '@/lib/types'

export const SECTION_COLOR: Record<Department['code'], string> = {
  bakery: 'hsl(33 70% 52%)',
  meat_shop: 'hsl(352 62% 52%)',
  security: 'hsl(207 66% 56%)',
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
