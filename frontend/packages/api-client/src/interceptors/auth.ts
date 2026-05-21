import type { InternalAxiosRequestConfig } from 'axios'

export function authInterceptor(config: InternalAxiosRequestConfig) {
  const token = localStorage.getItem('wish_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}
