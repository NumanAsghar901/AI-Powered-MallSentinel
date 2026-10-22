const ITEMS = [
  'PPE detection',
  'Uniform & weapon checks',
  'Duty-zone tracking',
  'SOP clause matching',
  'Severity classification',
  'Incident briefs',
  'Real-time alerts',
  'Evidence review',
  'Penalty workflow',
  'Tamper-evident ledger',
  'Role-based access',
  'Privacy by design',
]

function Row({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className={hidden ? 'marquee-dup flex gap-3' : 'flex gap-3'} aria-hidden={hidden || undefined}>
      {ITEMS.map((t) => (
        <li
          key={t}
          className="flex items-center gap-2.5 whitespace-nowrap rounded-full border -ln-fg/10 -ln-fg/[0.04] px-4 py-2 text-sm font-medium text-ln-muted"
        >
          <span className="size-1.5 rounded-full bg-[hsl(190_90%_60%)] shadow-[0_0_8px_hsl(190_90%_60%)]" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}

/** Compact ticker of capabilities, scrolling left to right (the features rows below run right to left). */
export function CapabilityStrip() {
  return (
    <section aria-label="Capabilities" className="relative border-y -ln-fg/10 bg-ln-2 py-4">
      <div className="marquee">
        <div className="marquee-track" style={{ ['--dur' as string]: '55s', ['--dir' as string]: 'reverse', ['--gap' as string]: '0.75rem' }}>
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  )
}
