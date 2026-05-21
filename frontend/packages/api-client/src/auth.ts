import { apiClient } from './client'
import type { ApiResponse } from './artworks'

export type TokenResponse = {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  refreshExpiresIn: number
}

export type LoginRequest = {
  email: string
  password: string
}

export type SignupRequest = {
  email: string
  nickname: string
  password: string
}

export type RefreshTokenRequest = {
  refreshToken: string
}

export type UserRole = 'USER' | 'ADMIN'

export type UserResponse = {
  id: number
  email: string
  nickname: string
  role?: UserRole
  createdAt?: string
}

export async function login(request: LoginRequest) {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/login', request)
  return response.data
}

export async function signup(request: SignupRequest) {
  const response = await apiClient.post<ApiResponse<UserResponse>>('/auth/signup', request)
  return response.data
}

/**
 * Refresh token 회전 — 새 access + 새 refresh 발급. 401 인터셉터에서 자동 호출된다 (S14P31E103-780). 호출자가 응답 토큰을
 * 직접 저장할 필요는 없음 — 인터셉터가 localStorage 갱신을 담당.
 */
export async function refreshTokens(request: RefreshTokenRequest) {
  const response = await apiClient.post<ApiResponse<TokenResponse>>('/auth/refresh', request)
  return response.data
}
