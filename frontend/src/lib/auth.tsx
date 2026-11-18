import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getStoredToken, getStoredUser, hasSessionHint, isTokenValid, refreshSession, setAccessToken, setSessionLostHandler, setStoredUser } from './api'
import type { User } from './types'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const initialUser = getStoredUser()
  const initialToken = getStoredToken()
  const tokenValid = isTokenValid(initialToken)

  const [user, setUser] = useState<User | null>(tokenValid ? initialUser : null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenValid && initialUser ? 'authenticated' : (hasSessionHint() ? 'loading' : 'anonymous')
  )

  // Restore or background-refresh the session on load ONLY when necessary
  useEffect(() => {
    // If the token is already valid, do not fire a redundant serverless round-trip
    if (tokenValid && initialUser) {
      return
    }
    // If no session exists, skip refresh completely
    if (!hasSessionHint()) {
      setStatus('anonymous')
      return
    }

    let cancelled = false
    void refreshSession().then((data) => {
      if (cancelled) return
      if (data) {
        setUser(data.user)
        setStoredUser(data.user)
        setStatus('authenticated')
      } else {
        setUser(null)
        setStoredUser(null)
        setStatus('anonymous')
      }
    })
    return () => {
      cancelled = true
    }
  }, [tokenValid, initialUser])

  // Refresh authenticated user's profile on tab focus so department/section changes sync cleanly without DB flood
  useEffect(() => {
    if (status !== 'authenticated') return
    const onFocus = async () => {
      try {
        const freshUser = await api.auth.me()
        setUser((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(freshUser)) {
            setStoredUser(freshUser)
            return freshUser
          }
          return prev
        })
      } catch {
        /* ignore background transient network blips */
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [status])

  // The API client calls this when a refresh explicitly fails mid-session
  useEffect(() => {
    setSessionLostHandler(() => {
      queryClient.clear()
      setAccessToken(null)
      setStoredUser(null)
      setUser(null)
      setStatus('anonymous')
    })
    return () => setSessionLostHandler(null)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login(email, password)
    setUser(data.user)
    setStoredUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      queryClient.clear()
      setAccessToken(null)
      setStoredUser(null)
      setUser(null)
      setStatus('anonymous')
    }
  }, [queryClient])

  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
