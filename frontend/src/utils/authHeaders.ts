import type { InternalAxiosRequestConfig } from 'axios'
import { getAuthToken } from './authToken'
import { getClientUserId } from './userId'

export function attachPlatformAuth(config: InternalAxiosRequestConfig) {
  const token = getAuthToken()
  const uid = getClientUserId()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  if (uid) config.headers.set('X-User-Id', uid)
  return config
}

export function platformAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const token = getAuthToken()
  const uid = getClientUserId()
  if (token) h.Authorization = `Bearer ${token}`
  if (uid) h['X-User-Id'] = uid
  return h
}
