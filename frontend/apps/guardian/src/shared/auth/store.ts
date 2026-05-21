import { create } from 'zustand'
import { decodeJwt, isJwtExpired } from './jwt'

const ACCESS_TOKEN_STORAGE_KEY = 'wish_access_token'

type AuthState = {
  token: string | null
  email: string | null
  role: string | null
  setToken: (token: string) => void
  clear: () => void
}

function readState(token: string | null) {
  if (!token) {
    return { token: null, email: null, role: null }
  }
  const payload = decodeJwt(token)
  if (!payload || isJwtExpired(payload)) {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    return { token: null, email: null, role: null }
  }
  return {
    token,
    email: payload.email ?? null,
    role: payload.role ?? null,
  }
}

export const useAuthStore = create<AuthState>(set => ({
  ...readState(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)),
  setToken: (token: string) => {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token)
    set(readState(token))
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    set({ token: null, email: null, role: null })
  },
}))
