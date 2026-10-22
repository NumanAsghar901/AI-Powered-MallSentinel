import type {
  Department,
  EmployeeCreateInput,
  EmployeeUpdateInput,
  Page,
  TokenResponse,
  User,
  UserCreateInput,
  UserListParams,
  UserUpdateInput,
} from './types'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const BASE = `${API_URL}/api/v1`

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: { field: string; message: string }[]

  constructor(status: number, code: string, detail: string, fieldErrors: { field: string; message: string }[] = []) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

interface ErrorBody {
  detail?: string
  code?: string
  errors?: { field: string; message: string }[]
}

const TAB_KEY = 'ms-tab'
const SESSION_HINT_KEY = 'ms-session'

function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes) // works on plain-http LAN hosts too, unlike crypto.randomUUID()
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let fallbackTabId: string | null = null

/**
 * Per-tab id (sessionStorage is not shared between tabs). The API names the refresh cookie after it, so signing in
 * as someone else in another tab never changes who this tab is.
 */
function tabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY)
    if (!id) {
      id = randomId()
      sessionStorage.setItem(TAB_KEY, id)
    }
    return id
  } catch {
    fallbackTabId ??= randomId()
    return fallbackTabId
  }
}

/** True when this tab has signed in before, so a visitor to the public site skips the refresh call. */
export function hasSessionHint(): boolean {
  try {
    return sessionStorage.getItem(SESSION_HINT_KEY) === '1'
  } catch {
    return false
  }
}

function setSessionHint(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(SESSION_HINT_KEY, '1')
    else sessionStorage.removeItem(SESSION_HINT_KEY)
  } catch {
    /* storage unavailable */
  }
}

// The access token lives in memory only; the refresh token is an httpOnly cookie.
let accessToken: string | null = null
let onSessionLost: (() => void) | null = null
let refreshInFlight: Promise<TokenResponse | null> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
  setSessionHint(token !== null)
}

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    /* non-JSON error */
  }
  return new ApiError(
    res.status,
    body.code ?? 'ERROR',
    body.detail ?? 'Something went wrong. Please try again.',
    body.errors ?? [],
  )
}

async function rawFetch(path: string, init: RequestInit & { json?: unknown }): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-Tab-Id', tabId())
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }
}

/** Exchanges the refresh cookie for a new access token. Single-flight so parallel 401s share one call. */
export function refreshSession(): Promise<TokenResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const res = await rawFetch('/auth/refresh', { method: 'POST' })
      if (!res.ok) {
        setAccessToken(null)
        return null
      }
      const data = (await res.json()) as TokenResponse
      setAccessToken(data.access_token)
      return data
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function request<T>(path: string, init: RequestInit & { json?: unknown; auth?: boolean } = {}): Promise<T> {
  let res = await rawFetch(path, init)
  if (res.status === 401 && init.auth !== false) {
    const refreshed = await refreshSession()
    if (refreshed) {
      res = await rawFetch(path, init)
    } else {
      onSessionLost?.()
    }
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, json?: unknown, auth = true) => request<T>(path, { method: 'POST', json, auth })

export const api = {
  health: async (): Promise<{ ms: number }> => {
    const t0 = performance.now()
    const res = await rawFetch('/health', { method: 'GET' })
    if (!res.ok) throw await parseError(res)
    return { ms: Math.round(performance.now() - t0) }
  },
  auth: {
    login: async (email: string, password: string): Promise<TokenResponse> => {
      const data = await post<TokenResponse>('/auth/login', { email, password }, false)
      setAccessToken(data.access_token)
      return data
    },
    logout: async (): Promise<void> => {
      try {
        await post<{ detail: string }>('/auth/logout', undefined, false)
      } finally {
        setAccessToken(null)
      }
    },
    me: () => request<User>('/auth/me'),
    forgotPassword: (email: string) => post<{ detail: string }>('/auth/forgot-password', { email }, false),
    resetPassword: (token: string, new_password: string) =>
      post<{ detail: string }>('/auth/reset-password', { token, new_password }, false),
  },
  departments: {
    list: () => request<Department[]>('/departments'),
  },
  users: {
    list: (params: UserListParams) => request<Page<User>>(`/users${buildQuery(params)}`),
    create: (body: UserCreateInput) => post<User>('/users', body),
    update: (id: string, body: UserUpdateInput) => request<User>(`/users/${id}`, { method: 'PATCH', json: body }),
    disable: (id: string) => post<User>(`/users/${id}/disable`),
    enable: (id: string) => post<User>(`/users/${id}/enable`),
    unlock: (id: string) => post<User>(`/users/${id}/unlock`),
  },
  employees: {
    list: (params: Pick<UserListParams, 'search' | 'status' | 'page' | 'page_size' | 'sort' | 'order'>) =>
      request<Page<User>>(`/employees${buildQuery(params)}`),
    create: (body: EmployeeCreateInput) => post<User>('/employees', body),
    update: (id: string, body: EmployeeUpdateInput) =>
      request<User>(`/employees/${id}`, { method: 'PATCH', json: body }),
    remove: (id: string) => request<void>(`/employees/${id}`, { method: 'DELETE' }),
  },
}
