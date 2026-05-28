import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

/** 对话页知识增强：关闭 / Milvus RAG / LLM-Wiki 结构化检索 */
export type KnowledgeChatMode = 'off' | 'rag' | 'wiki'

const MODE_KEY = 'onemini-knowledge-chat-mode'
const LEGACY_RAG_KEY = 'onemini-rag-enabled'

function loadKnowledgeChatMode(): KnowledgeChatMode {
  const v = localStorage.getItem(MODE_KEY)
  if (v === 'off' || v === 'rag' || v === 'wiki') return v
  if (localStorage.getItem(LEGACY_RAG_KEY) === '1') return 'rag'
  return 'off'
}

export const usePlatformStore = defineStore('platform', () => {
  const knowledgeChatMode = ref<KnowledgeChatMode>(loadKnowledgeChatMode())
  const milvusOk = ref<boolean | null>(null)
  const platformOnline = ref<boolean | null>(null)

  const ragEnabled = computed(() => knowledgeChatMode.value === 'rag')
  const wikiChatEnabled = computed(() => knowledgeChatMode.value === 'wiki')

  function setKnowledgeChatMode(mode: KnowledgeChatMode) {
    knowledgeChatMode.value = mode
    localStorage.setItem(MODE_KEY, mode)
    localStorage.setItem(LEGACY_RAG_KEY, mode === 'rag' ? '1' : '0')
  }

  function setRagEnabled(v: boolean) {
    setKnowledgeChatMode(v ? 'rag' : 'off')
  }

  async function refreshHealth() {
    try {
      const { checkPlatformHealth } = await import('../api/platform')
      const data = await checkPlatformHealth()
      platformOnline.value = data.ok
      milvusOk.value = data.milvus?.ok ?? false
      return data
    } catch {
      platformOnline.value = false
      milvusOk.value = false
      return null
    }
  }

  return {
    knowledgeChatMode,
    ragEnabled,
    wikiChatEnabled,
    milvusOk,
    platformOnline,
    setKnowledgeChatMode,
    setRagEnabled,
    refreshHealth,
  }
})
