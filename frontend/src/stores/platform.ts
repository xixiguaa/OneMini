import { defineStore } from 'pinia'
import { ref } from 'vue'

const RAG_KEY = 'onemini-rag-enabled'

export const usePlatformStore = defineStore('platform', () => {
  const ragEnabled = ref(localStorage.getItem(RAG_KEY) === '1')
  const milvusOk = ref<boolean | null>(null)
  const platformOnline = ref<boolean | null>(null)

  function setRagEnabled(v: boolean) {
    ragEnabled.value = v
    localStorage.setItem(RAG_KEY, v ? '1' : '0')
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
    ragEnabled,
    milvusOk,
    platformOnline,
    setRagEnabled,
    refreshHealth,
  }
})
