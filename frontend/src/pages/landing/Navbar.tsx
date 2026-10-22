import * as DialogPrimitive from '@radix-ui/react-dialog'
import { LayoutDashboard, LogIn, Menu, Moon, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { ROLE_HOME } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NAV_LINKS, type SectionId } from './siteConfig'

function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>('home')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id as SectionId)
        }
      },
      // A section counts as "current" while it crosses the middle band of the viewport.
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const { id } of NAV_LINKS) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])
  return active
}

function SignInButton({ className, onClick }: { className?: string; onClick?: () => void }) {
  const { user } = useAuth()
  const classes = cn(
    'beam-btn inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold',
    className,
  )
  return user ? (
    <Link to={ROLE_HOME[user.role]} onClick={onClick} className={classes}>
      <LayoutDashboard className="size-4" aria-hidden /> Dashboard
    </Link>
  ) : (
    <Link to="/login" onClick={onClick} className={classes}>
      <LogIn className="size-4" aria-hidden /> Sign In
    </Link>
  )
}

export function Navbar() {
  const active = useActiveSection()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <header className="glass-nav sticky top-0 z-40 -mb-16 text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-8">
        <a href="#home" className="flex items-center gap-2.5 lg:justify-self-start" aria-label="MallSentinel, back to top">
          <LogoMark className="size-11" />
          <Wordmark onDark className="hidden text-lg min-[400px]:inline" />
        </a>

        <nav aria-label="Primary" className="hidden items-center justify-center gap-1 lg:flex lg:justify-self-center">
          {NAV_LINKS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? 'true' : undefined}
              className={cn(
                'rounded-md px-2.5 py-2 text-sm font-medium transition-colors hover:text-white xl:px-3',
                active === id ? 'bg-white/10 text-white' : 'text-[hsl(213_26%_78%)]',
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:justify-self-end">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex size-10 items-center justify-center rounded-md text-[hsl(213_26%_82%)] transition-colors hover:bg-white/10 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <SignInButton className="hidden sm:inline-flex" />
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger
              aria-label="Open menu"
              className="flex size-10 items-center justify-center rounded-md text-white hover:bg-white/10 lg:hidden"
            >
              <Menu className="size-6" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed inset-y-0 right-0 z-50 flex w-80 max-w-[88vw] flex-col bg-sidebar p-5 text-white shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right lg:hidden"
              >
                <div className="flex items-center justify-between">
                  <DialogPrimitive.Title className="sr-only">Site menu</DialogPrimitive.Title>
                  <span className="flex items-center gap-2.5">
                    <LogoMark className="size-11" />
                    <Wordmark onDark />
                  </span>
                  <DialogPrimitive.Close className="flex size-10 items-center justify-center rounded-md hover:bg-white/10">
                    <X className="size-5" />
                    <span className="sr-only">Close menu</span>
                  </DialogPrimitive.Close>
                </div>
                <nav aria-label="Mobile" className="mt-8 flex flex-1 flex-col gap-1">
                  {NAV_LINKS.map(({ id, label }) => (
                    <a
                      key={id}
                      href={`#${id}`}
                      onClick={() => setOpen(false)}
                      aria-current={active === id ? 'true' : undefined}
                      className={cn(
                        'flex h-12 items-center rounded-md px-3 text-base font-medium transition-colors hover:bg-white/10',
                        active === id ? 'bg-white/10 text-white' : 'text-[hsl(213_26%_82%)]',
                      )}
                    >
                      {label}
                    </a>
                  ))}
                </nav>
                <SignInButton className="h-12 w-full text-base" onClick={() => setOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  )
}
