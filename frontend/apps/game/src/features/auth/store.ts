import { create } from 'zustand'

const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'
const REFRESH_TOKEN_STORAGE_KEY = 'wish_refresh_token'
const TOKEN_EXPIRY_MARGIN_MS = 30_000

type JwtPayload = {
  sub?: string
  email?: string
  role?: string
  exp?: number
}

function decodeJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length < 2) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return null
  }
}

function isTokenValid(token: string | null): boolean {
  if (!token) return false
  const payload = decodeJwt(token)
  if (!payload) return false
  if (typeof payload.exp !== 'number') return true
  return payload.exp * 1000 > Date.now() + TOKEN_EXPIRY_MARGIN_MS
}

function readInitialToken(): string | null {
  const stored = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  if (stored && isTokenValid(stored)) return stored
  // access 만료라도 refresh 가 있으면 굳이 access 를 지우지 않고 그대로 둔다 — 첫 API 호출에서 인터셉터가 자동 갱신.
  if (stored && !localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    return null
  }
  return stored
}

function readInitialRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
}

type AuthState = {
  token: string | null
  refreshToken: string | null
  /** access 만 갱신 (refresh 발급 받지 못한 레거시 경로용 — 데모 토큰 등). */
  setToken: (token: string) => void
  /** 로그인 직후 호출 — access + refresh 동시 저장. 인터셉터가 자동 회전 가능하도록. */
  setTokens: (access: string, refresh: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>(set => ({
  token: readInitialToken(),
  refreshToken: readInitialRefreshToken(),
  setToken: token => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    set({ token })
  },
  setTokens: (access, refresh) => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refresh)
    set({ token: access, refreshToken: refresh })
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    set({ token: null, refreshToken: null })
  },
}))

export function useIsAuthenticated(): boolean {
  // access 만료여도 refresh 가 있으면 "인증됨" 으로 본다 — 다음 API 호출에서 인터셉터가 회전한다.
  return useAuthStore(state => isTokenValid(state.token) || state.refreshToken !== null)
}

export function hasValidAuthToken(): boolean {
  const state = useAuthStore.getState()
  return isTokenValid(state.token) || state.refreshToken !== null
}
