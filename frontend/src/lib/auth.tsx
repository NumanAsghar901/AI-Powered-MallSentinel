import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, hasSessionHint, refreshSession, setSessionLostHandler } from './api'
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
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => (hasSessionHint() ? 'loading' : 'anonymous'))

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    if (!hasSessionHint()) return // public visitor: nothing to restore
    let cancelled = false
    void refreshSession().then((data) => {
      if (cancelled) return
      setUser(data?.user ?? null)
      setStatus(data ? 'authenticated' : 'anonymous')
    })
    return () => {
      cancelled = true
    }
  }, [])

  // The API client calls this when a refresh fails mid-session.
  useEffect(() => {
    setSessionLostHandler(() => {
      queryClient.clear()
      setUser(null)
      setStatus('anonymous')
    })
    return () => setSessionLostHandler(null)
  }, [queryClient])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login(email, password)
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      queryClient.clear()
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
