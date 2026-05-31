import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Locale } from '../i18n/messages'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'aji-ui-prefs'

interface UiPrefs {
  theme: ThemeMode
  locale: Locale
  sidebarCollapsed: boolean
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return resolveSystemTheme()
  return mode
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveTheme(mode)
  document.documentElement.dataset.themeMode = mode
}

export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
}

function normalizeTheme(raw: unknown): ThemeMode {
  if (raw === 'dark' || raw === 'system' || raw === 'light') return raw
  return 'dark'
}

function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiPrefs>
      return {
        theme: normalizeTheme(parsed.theme),
        locale: parsed.locale === 'en' ? 'en' : 'zh',
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
      }
    }
  } catch {
    /* ignore */
  }
  return { theme: 'dark', locale: 'zh', sidebarCollapsed: false }
}

/** 在 createApp 之前调用，避免主题闪烁 */
export function initUiPrefsFromStorage() {
  const prefs = loadPrefs()
  applyTheme(prefs.theme)
  applyLocale(prefs.locale)
  document.documentElement.dataset.sidebarCollapsed = prefs.sidebarCollapsed
    ? 'true'
    : 'false'
  return prefs
}

export const useUiPrefsStore = defineStore('uiPrefs', () => {
  const saved = loadPrefs()
  const theme = ref<ThemeMode>(saved.theme)
  const locale = ref<Locale>(saved.locale)
  const sidebarCollapsed = ref(saved.sidebarCollapsed)

  const resolvedTheme = computed<ResolvedTheme>(() => resolveTheme(theme.value))

  let systemMedia: MediaQueryList | null = null

  function onSystemPrefChange() {
    if (theme.value === 'system') applyTheme('system')
  }

  function bindSystemMediaListener() {
    if (typeof window === 'undefined') return
    systemMedia?.removeEventListener('change', onSystemPrefChange)
    systemMedia = null
    if (theme.value !== 'system') return
    systemMedia = window.matchMedia('(prefers-color-scheme: light)')
    systemMedia.addEventListener('change', onSystemPrefChange)
  }

  watch(
    () => ({
      theme: theme.value,
      locale: locale.value,
      sidebarCollapsed: sidebarCollapsed.value,
    }),
    (val) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
      applyTheme(val.theme)
      applyLocale(val.locale)
      document.documentElement.dataset.sidebarCollapsed = val.sidebarCollapsed
        ? 'true'
        : 'false'
      bindSystemMediaListener()
    },
    { immediate: true },
  )

  function setTheme(mode: ThemeMode) {
    theme.value = mode
  }

  function toggleTheme() {
    const current = resolveTheme(theme.value)
    theme.value = current === 'light' ? 'dark' : 'light'
  }

  function setLocale(next: Locale) {
    locale.value = next
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setSidebarCollapsed(v: boolean) {
    sidebarCollapsed.value = v
  }

  return {
    theme,
    resolvedTheme,
    locale,
    sidebarCollapsed,
    setTheme,
    toggleTheme,
    setLocale,
    toggleSidebar,
    setSidebarCollapsed,
  }
})
