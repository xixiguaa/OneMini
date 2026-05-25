import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Locale } from '../i18n/messages'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'aji-ui-prefs'

interface UiPrefs {
  theme: ThemeMode
  locale: Locale
}

function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UiPrefs>
      return {
        theme: parsed.theme === 'dark' ? 'dark' : 'light',
        locale: parsed.locale === 'en' ? 'en' : 'zh',
      }
    }
  } catch {
    /* ignore */
  }
  return { theme: 'light', locale: 'zh' }
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}

export function applyLocale(locale: Locale) {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
}

/** 在 createApp 之前调用，避免主题闪烁 */
export function initUiPrefsFromStorage() {
  const prefs = loadPrefs()
  applyTheme(prefs.theme)
  applyLocale(prefs.locale)
  return prefs
}

export const useUiPrefsStore = defineStore('uiPrefs', () => {
  const saved = loadPrefs()
  const theme = ref<ThemeMode>(saved.theme)
  const locale = ref<Locale>(saved.locale)

  watch(
    () => ({ theme: theme.value, locale: locale.value }),
    (val) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
      applyTheme(val.theme)
      applyLocale(val.locale)
    },
    { immediate: true },
  )

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  function setLocale(next: Locale) {
    locale.value = next
  }

  return { theme, locale, toggleTheme, setLocale }
})
