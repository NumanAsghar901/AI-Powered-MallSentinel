import { CapabilityStrip } from './CapabilityStrip'
import { Contact } from './Contact'
import { Faq } from './Faq'
import { Features } from './Features'
import { Footer } from './Footer'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { LiveDemo } from './LiveDemo'
import { Navbar } from './Navbar'
import { ScrollProgress } from './ScrollProgress'
import { SectionsShowcase } from './SectionsShowcase'
import { Stats } from './Stats'

/** Public marketing site, served at "/". */
export function LandingPage() {
  return (
    <div className="min-h-dvh bg-ln-1">
      <ScrollProgress />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <Hero />
        <CapabilityStrip />
        <Features />
        <LiveDemo />
        <HowItWorks />
        <SectionsShowcase />
        <Stats />
        <Faq />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}
