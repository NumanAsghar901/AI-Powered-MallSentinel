# Public website: design direction (v2)

Applies to the marketing site at `/`. The app (dashboards, tables, forms) and the Sign In / Forgot / Reset pages stay
static, calm and clean: split layout, logo one side, form the other, no animated effects.

## Concept: "control-room premium"
A dark, engineered look: a faint grid and a low-poly mesh under everything, teal and steel-blue radial glows, glass
panels, and one hero scene that carries the product idea. Dark is the designed look (and the first-visit default);
light mode is a clean navy-on-white counterpart driven by the `--ln-*` tokens in `index.css`.

## Palette (logo only)
Navy `#0B1F3F`, teal `#0B5C75` (lifted to `hsl(190 80% 68%)` for glow and accents on navy), steel-blue `#306F97`.
Maroon, amber and steel mark the three sections only, never success or error. No purple, no rainbow neon.

## Signature effects (all in `index.css`, all off under `prefers-reduced-motion`)
- `.glass` / `.glass-navy`: translucent panel + backdrop blur + thin light border.
- `.grid-bg`, `.teal-glow`, `.steel-glow`, `.amber-glow`, `.maroon-glow`: the backdrop. `MeshBackdrop` is an interactive canvas web: nodes spring around their home position, the cursor pushes them away and lights lines to nearby nodes; it animates only while on screen and is static under reduced motion.
- `.shimmer-text`: moving gradient on key words. `.beam-btn`: conic border beam on the primary button.
- `SpotlightCard`: cursor-following spotlight and border glow, lift on hover, optional 3D tilt.
- Scroll progress bar, scroll-reveal on every section, count-up stats, timeline line that draws as you scroll.
- Marquees: the capability strip (left to right) and two rows of 16 feature cards (right to left, pause on hover).

## Hero 3D scene (`HeroScene.tsx`, react-three-fiber, lazy-loaded)
Built from primitives, no model files: faceted low-poly shield with a teal rim, a swivelling CCTV camera with a light
beam, three orbiting discs (Bakery, Meat Shop, Security), a scan reticle that hops between them, pointer parallax and
sparkles. Falls back to the static SVG shield when WebGL is unavailable, when motion is reduced, or if the context
fails. The render loop stops while the hero is off-screen.

## Live demo
A "3D video" substitute with no video files: SVG + CSS camera tiles (scanlines, REC dot, clock, detection boxes) and a
five-step loop (watch, detect, match SOP clause, brief and alert, decide and seal). Clickable, pausable, tilts in 3D,
and labelled as a simulation.

## Emoji
Icon chips on the marketing site only (always `aria-hidden`, with a text label beside them).

## Honesty rules
Stats are design targets from the SRS and say so. The hero alert card and the demo are labelled as illustrative.
Contact e-mail and address are placeholders in `frontend/src/pages/landing/siteConfig.ts`.
