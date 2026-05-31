import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'

export type LoginSkyTheme = 'dark' | 'light'

export interface LoginPointerContext {
  nx: Ref<number>
  ny: Ref<number>
  isOverCard: Ref<boolean>
  interactionsEnabled: Ref<boolean>
  skyTheme: Ref<LoginSkyTheme>
}

export const LOGIN_POINTER_KEY: InjectionKey<LoginPointerContext> = Symbol('loginPointer')

export function provideLoginPointer(
  interactionsEnabled: Ref<boolean>,
  skyTheme: Ref<LoginSkyTheme>,
): LoginPointerContext {
  const nx = ref(0)
  const ny = ref(0)
  const isOverCard = ref(false)

  const ctx: LoginPointerContext = { nx, ny, isOverCard, interactionsEnabled, skyTheme }
  provide(LOGIN_POINTER_KEY, ctx)
  return ctx
}

export function useLoginPointer(): LoginPointerContext {
  const ctx = inject(LOGIN_POINTER_KEY)
  if (!ctx) throw new Error('useLoginPointer must be used within LoginPage')
  return ctx
}

export function detectLoginInteractions(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (window.matchMedia('(pointer: coarse)').matches) return false
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (cores <= 2) return false
  if (memory !== undefined && memory <= 2) return false
  return true
}

export function detectInitialLoginTheme(): LoginSkyTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
