import { computed } from 'vue'
import { messages, type Locale } from '../i18n/messages'
import { useUiPrefsStore } from '../stores/uiPrefs'

type MessageTree = (typeof messages)[Locale]

function resolvePath(tree: MessageTree, path: string): string | undefined {
  const parts = path.split('.')
  let node: unknown = tree
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

export function useLocale() {
  const ui = useUiPrefsStore()
  const locale = computed(() => ui.locale)

  function t(path: string): string {
    return resolvePath(messages[ui.locale], path) ?? path
  }

  function dateLocale(): string {
    return ui.locale === 'zh' ? 'zh-CN' : 'en-US'
  }

  return { t, locale, dateLocale }
}
