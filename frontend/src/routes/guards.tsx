import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { FullPageSpinner } from '@/components/StateViews'
import { useAuth } from '@/lib/auth'
import { canGoBack, getDirection } from '@/lib/navDirection'
import { ROLE_HOME, type Role } from '@/lib/types'

/** Anything under it needs a signed-in user. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner label="Restoring your session…" />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/**
 * Wrong role. A deliberate visit (link, typed URL) gets the 403 page. A stale history entry reached with Back is
 * skipped instead, so Back keeps going to the page before it; Forward and first-in-history entries go to the
 * user's own dashboard. (The API also enforces roles with require_role.)
 */
export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const navType = useNavigationType()
  const allowed = Boolean(user && roles.includes(user.role))
  const direction = navType === 'POP' ? getDirection() : 'none'
  const skipping = Boolean(user) && !allowed && direction !== 'none'

  useEffect(() => {
    if (!skipping || !user) return
    if (direction === 'back' && canGoBack()) navigate(-1)
    else navigate(ROLE_HOME[user.role], { replace: true })
  }, [skipping, direction, user, navigate])

  if (!user) return <Navigate to="/login" replace />
  if (allowed) return <Outlet />
  return skipping ? <FullPageSpinner /> : <Navigate to="/403" replace />
}
