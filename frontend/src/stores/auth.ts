import axios from 'axios'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  fetchMeApi,
  loginApi,
  logoutApi,
  registerApi,
  type AuthUser,
} from '../api/auth'
import { setAuthToken, getAuthToken } from '../utils/authToken'
import { clearClientUserId, setClientUserId } from '../utils/userId'
import { useToastStore } from './toast'

const SESSION_EXPIRED_MESSAGE = '请重新登录'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const token = ref<string | null>(getAuthToken())
  const ready = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let forceLogoutTask: Promise<void> | null = null

  const isAuthenticated = computed(() => Boolean(token.value && user.value))

  function clearSession() {
    token.value = null
    setAuthToken(null)
    clearClientUserId()
    user.value = null
    error.value = null
  }

  function applySession(accessToken: string, nextUser: AuthUser) {
    if (!accessToken || !nextUser?.id) {
      throw new Error('登录响应无效')
    }
    token.value = accessToken
    setAuthToken(accessToken)
    setClientUserId(nextUser.id)
    user.value = nextUser
    error.value = null
  }

  async function hydrate(): Promise<void> {
    const stored = getAuthToken()
    token.value = stored
    if (!stored) {
      ready.value = true
      return
    }
    try {
      const { user: me } = await fetchMeApi()
      user.value = me
      setClientUserId(me.id)
    } catch (e) {
      const expired =
        axios.isAxiosError(e) &&
        (e.response?.status === 401 || e.response?.status === 403)
      if (expired) {
        await forceLogout(SESSION_EXPIRED_MESSAGE)
      } else {
        clearSession()
      }
    } finally {
      ready.value = true
    }
  }

  async function login(identifier: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const res = await loginApi({ identifier, password, website: '' })
      applySession(res.token, res.user)
    } catch (e) {
      error.value = parseAuthError(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register(payload: {
    email?: string
    phone?: string
    password: string
    website?: string
  }) {
    loading.value = true
    error.value = null
    try {
      const res = await registerApi({ ...payload, website: payload.website ?? '' })
      applySession(res.token, res.user)
    } catch (e) {
      error.value = parseAuthError(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await logoutApi()
    } catch {
      /* 无 token 时忽略 */
    }
    clearSession()
  }

  async function forceLogout(message = SESSION_EXPIRED_MESSAGE) {
    if (forceLogoutTask) return forceLogoutTask
    forceLogoutTask = (async () => {
      try {
        await logoutApi().catch(() => {})
        clearSession()
        useToastStore().showError(message)
      } finally {
        forceLogoutTask = null
      }
    })()
    return forceLogoutTask
  }

  function parseAuthError(e: unknown): string {
    if (axios.isAxiosError(e)) {
      if (e.code === 'ECONNABORTED') {
        return '请求超时，请确认 Python 后端已启动（端口 8000）'
      }
      if (!e.response) {
        return '无法连接服务器，请确认 Python 后端已启动（端口 8000）'
      }
      const d = e.response?.data as { detail?: string | { msg?: string }[] }
      if (typeof d?.detail === 'string') return d.detail
      if (Array.isArray(d?.detail)) return d.detail.map((x) => x.msg).join('; ')
    }
    return e instanceof Error ? e.message : '操作失败'
  }

  return {
    user,
    ready,
    loading,
    error,
    isAuthenticated,
    hydrate,
    login,
    register,
    logout,
    forceLogout,
  }
})
