import { computed, ref, watch } from 'vue'
import { useCreateHistoryStore } from '../stores/createHistory'
import type { CreateHistoryItem } from '../stores/createHistory'
import { resolveCreateHistoryImageUrl } from '../utils/createHistoryMedia'

function isRootCreate(item: CreateHistoryItem) {
  return !item.parentId
}

export function useCreateGenerationPill() {
  const createHistory = useCreateHistoryStore()
  const completedFlash = ref<CreateHistoryItem | null>(null)
  const dismissedFlashId = ref<string | null>(null)
  let prevRunningRootIds = new Set<string>()
  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null

  const runningRoots = computed(() =>
    createHistory.sortedItems.filter((i) => i.status === 'RUNNING' && isRootCreate(i)),
  )

  const focusItem = computed(() => {
    if (runningRoots.value.length > 0) return runningRoots.value[0]
    if (completedFlash.value && completedFlash.value.id !== dismissedFlashId.value) {
      return completedFlash.value
    }
    return null
  })

  const visible = computed(() => focusItem.value != null)

  const isGenerating = computed(() => runningRoots.value.length > 0)

  const doneCount = computed(() => (isGenerating.value ? 0 : 1))

  const totalCount = computed(() =>
    isGenerating.value ? Math.max(1, runningRoots.value.length) : 1,
  )

  const statusLabel = computed(() => {
    if (isGenerating.value) return `${doneCount.value}/${totalCount.value} 生成中...`
    return `${doneCount.value}/${totalCount.value} 生成完成`
  })

  function clearAutoDismiss() {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer)
      autoDismissTimer = null
    }
  }

  function scheduleAutoDismiss() {
    clearAutoDismiss()
    autoDismissTimer = setTimeout(() => {
      if (completedFlash.value) {
        dismissedFlashId.value = completedFlash.value.id
        completedFlash.value = null
      }
    }, 28000)
  }

  watch(
    () => runningRoots.value.map((i) => i.id),
    (ids) => {
      const nextSet = new Set(ids)
      if (ids.length === 0 && prevRunningRootIds.size > 0) {
        for (const id of prevRunningRootIds) {
          const item = createHistory.items.find((i) => i.id === id)
          if (item?.status === 'DONE') {
            completedFlash.value = item
            dismissedFlashId.value = null
            scheduleAutoDismiss()
            break
          }
        }
      }
      if (ids.length > 0) {
        clearAutoDismiss()
        completedFlash.value = null
        dismissedFlashId.value = null
      }
      prevRunningRootIds = nextSet
    },
    { immediate: true },
  )

  function dismiss() {
    clearAutoDismiss()
    if (completedFlash.value) dismissedFlashId.value = completedFlash.value.id
    completedFlash.value = null
  }

  function thumbUrl(item: CreateHistoryItem) {
    return resolveCreateHistoryImageUrl(item) || item.previewUrl || ''
  }

  function sessionKey(item: CreateHistoryItem) {
    return item.sessionId || item.id
  }

  return {
    visible,
    focusItem,
    statusLabel,
    isGenerating,
    dismiss,
    thumbUrl,
    sessionKey,
  }
}
