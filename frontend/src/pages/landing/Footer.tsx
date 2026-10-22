import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '@/components/Logo'
import { SITE } from './siteConfig'

const PRODUCT = [
  { href: '#features', label: 'Features' },
  { href: '#demo', label: 'Live Demo' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#sections', label: 'Sections' },
  { href: '#faq', label: 'FAQ' },
]
const COMPANY = [{ href: '#contact', label: 'Contact' }]

const linkClass = 'text-sm text-[hsl(213_26%_74%)] transition-colors hover:text-white'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[hsl(217_70%_9%)] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr] lg:px-8">
        <div className="space-y-4">
          <a href="#home" className="inline-flex items-center gap-2.5" aria-label="MallSentinel, back to top">
            <LogoMark className="size-12" />
            <Wordmark onDark className="text-xl" />
          </a>
          <p className="max-w-xs text-sm leading-relaxed text-[hsl(213_26%_74%)]">{SITE.tagline}.</p>
        </div>

        <nav aria-label="Product">
          <h2 className="font-heading text-sm font-semibold">Product</h2>
          <ul className="mt-4 space-y-2.5">
            {PRODUCT.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="font-heading text-sm font-semibold">Company</h2>
          <ul className="mt-4 space-y-2.5">
            {COMPANY.map((l) => (
              <li key={l.href}>
                <a href={l.href} className={linkClass}>{l.label}</a>
              </li>
            ))}
            <li>
              <Link to="/login" className={linkClass}>Sign In</Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-heading text-sm font-semibold">Contact</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-[hsl(213_26%_74%)]">
            <li>
              <a href={`mailto:${SITE.email}`} className="hover:text-white">{SITE.email}</a>
            </li>
            <li>{SITE.location}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-[hsl(213_26%_66%)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {SITE.year} {SITE.name}. All rights reserved.</p>
          <p>{SITE.institution} · Final Year Project</p>
        </div>
      </div>
    </footer>
  )
}
