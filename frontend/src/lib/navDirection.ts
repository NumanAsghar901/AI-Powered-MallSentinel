/**
 * Remembers whether the last history navigation was Back or Forward, so a guard can skip a stale entry
 * (for example an old /admin page after signing in as an employee) instead of showing an error.
 *
 * Within the app, React Router keeps a position number in `history.state.idx`; comparing it before and after
 * `popstate` gives the direction. When Back crosses into an entry that belongs to an earlier page load, the browser
 * reloads the app instead; then the Navigation Timing type `back_forward` is the only signal, and we treat it as Back.
 */
type Direction = 'back' | 'forward' | 'none'

const positionNow = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0

const RESTORED_KEY = 'ms-restored'

const loadedByHistory = (): boolean => {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  let restored = false
  try {
    restored = sessionStorage.getItem(RESTORED_KEY) === '1'
    sessionStorage.removeItem(RESTORED_KEY)
  } catch {
    /* storage unavailable */
  }
  return entry?.type === 'back_forward' || restored
}

/**
 * The browser's back/forward cache can restore an old page exactly as it was, including the previous user's
 * in-memory session (an admin dashboard after signing in as an employee). Reload instead, so the page always
 * reflects the current session, and remember that this reload came from Back/Forward.
 */
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return
  try {
    sessionStorage.setItem(RESTORED_KEY, '1')
  } catch {
    /* storage unavailable */
  }
  window.location.reload()
})

let lastIdx = positionNow()
let direction: Direction = loadedByHistory() ? 'back' : 'none'

window.addEventListener('popstate', () => {
  const idx = positionNow()
  direction = idx < lastIdx ? 'back' : idx > lastIdx ? 'forward' : 'none'
  lastIdx = idx
})

export const currentPosition = positionNow
export const getDirection = (): Direction => direction
/** True when there is any earlier entry to go back to, including ones from earlier page loads. */
export const canGoBack = (): boolean => positionNow() > 0 || window.history.length > 1

/** Called after every committed location change; clears the direction once the navigation has been handled. */
export function settleNavigation(): void {
  lastIdx = positionNow()
  direction = 'none'
}
