import { LogIn, MapPin, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MeshBackdrop } from './ShieldMesh'
import { Reveal } from './Reveal'
import { SITE } from './siteConfig'

export function Contact() {
  return (
    <section id="contact" className="relative isolate overflow-hidden bg-ln-1 ln-mix-b py-24 text-ln-fg sm:py-28">
      <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
      <div className="amber-glow pointer-events-none parallax absolute -left-24 top-10 size-[30rem] -z-10" aria-hidden />
      <div className="maroon-glow pointer-events-none parallax absolute right-[12%] bottom-0 size-[28rem] -z-10" aria-hidden />
      <MeshBackdrop className="-z-10 text-ln-accent" />
      <div className="teal-glow pointer-events-none parallax absolute left-1/2 top-1/2 -z-10 size-[52rem] -translate-x-1/2 -translate-y-1/2" aria-hidden />
      <div className="steel-glow pointer-events-none parallax absolute -right-40 bottom-0 -z-10 size-[34rem]" aria-hidden />

      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Reveal variant="zoom" className="glass rounded-3xl p-8 text-center sm:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ln-accent">Contact</p>
          <h2 className="mt-3 font-heading text-3xl font-bold sm:text-5xl">
            Ready to see <span className="hl">MallSentinel</span> in <span className="hl">action</span>? 🚀
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ln-muted sm:text-lg">
            Tell us about your mall or mart and we will walk you through a demo. Already have an account? Sign in to open
            your dashboard.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={`mailto:${SITE.email}?subject=MallSentinel%20demo%20request`}
              className="beam-btn inline-flex h-14 items-center justify-center gap-2 rounded-xl px-8 text-base font-semibold"
            >
              <Send className="size-5" aria-hidden /> Request a demo
            </a>
            <Link
              to="/login"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border -ln-fg/25 px-8 text-base font-semibold transition-colors hover:-ln-fg/10"
            >
              <LogIn className="size-5" aria-hidden /> Sign In
            </Link>
          </div>

          <dl className="mt-12 grid gap-4 border-t -ln-fg/10 pt-8 text-left sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden>✉️</span>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ln-faint">Email</dt>
                <dd>
                  <a href={`mailto:${SITE.email}`} className="font-medium underline-offset-4 hover:underline">
                    {SITE.email}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-ln-accent" aria-hidden />
              <div>
                <dt className="text-xs uppercase tracking-wider text-ln-faint">Location</dt>
                <dd className="font-medium">{SITE.location}</dd>
              </div>
            </div>
          </dl>
        </Reveal>
      </div>
    </section>
  )
}
