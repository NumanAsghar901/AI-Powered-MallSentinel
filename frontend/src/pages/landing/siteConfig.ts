/** Public-site constants. Contact details are placeholders: replace before launch. */
export const SITE = {
  name: 'MallSentinel',
  tagline: 'AI-powered compliance monitoring for malls & marts',
  email: 'contact@mallsentinel.com',
  location: 'FAST-NUCES, Chiniot-Faisalabad Campus, Pakistan',
  year: 2026,
  institution: 'FAST-NUCES Chiniot-Faisalabad',
} as const

export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'demo', label: 'Live Demo' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'sections', label: 'Sections' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
] as const

export type SectionId = (typeof NAV_LINKS)[number]['id']
