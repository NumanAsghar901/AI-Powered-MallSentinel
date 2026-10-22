import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { settleNavigation } from '@/lib/navDirection'

/**
 * Render this after <Routes/> so the guards' effects run first and can read the Back/Forward direction.
 * It does nothing for the location the page loaded on: the session is still being restored then, and the direction
 * must survive until the role guard can use it. (Comparing keys, not a first-run flag, keeps this correct under
 * React StrictMode, which runs effects twice.)
 */
export function NavTracker() {
  const location = useLocation()
  const initialKey = useRef(location.key)
  useEffect(() => {
    if (location.key === initialKey.current) return
    settleNavigation()
  }, [location.key])
  return null
}
