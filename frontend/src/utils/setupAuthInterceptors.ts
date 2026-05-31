import axios, { type AxiosInstance } from 'axios'
import { useAuthStore } from '../stores/auth'
import { attachPlatformAuth } from './authHeaders'
import { getAuthToken } from './authToken'

function isSessionInvalidStatus(status?: number) {
  return status === 401 || status === 403
}

export function setupAuthInterceptors(instance: AxiosInstance) {
  instance.interceptors.request.use((config) => {
    attachPlatformAuth(config)
    const auth = useAuthStore()
    if ((auth.isAuthenticated || getAuthToken()) && !getAuthToken()) {
      void auth.forceLogout()
      return Promise.reject(new axios.CanceledError('会话已失效'))
    }
    return config
  })
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (axios.isAxiosError(err) && isSessionInvalidStatus(err.response?.status)) {
        const auth = useAuthStore()
        if (auth.isAuthenticated || getAuthToken()) {
          void auth.forceLogout()
        }
      }
      return Promise.reject(err)
    },
  )
}
