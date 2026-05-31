import axios from 'axios'
import { attachPlatformAuth } from '../utils/authHeaders'

export interface AuthUser {
  id: string
  email?: string | null
  phone?: string | null
  displayName: string
  createdAt?: number
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

const api = axios.create({
  baseURL: '/api/platform/auth',
  timeout: 30000,
})

api.interceptors.request.use(attachPlatformAuth)

export async function registerApi(payload: {
  email?: string
  phone?: string
  password: string
  website?: string
}): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/register', payload)
  return data
}

export async function loginApi(payload: {
  identifier: string
  password: string
  website?: string
}): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/login', payload)
  return data
}

export async function fetchMeApi(): Promise<{ user: AuthUser }> {
  const { data } = await api.get<{ user: AuthUser }>('/me')
  return data
}

export async function logoutApi(): Promise<void> {
  try {
    await api.post('/logout')
  } catch {
    /* 无 token 时忽略 */
  }
}
