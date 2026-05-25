import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { randomUUID } from '../utils/uuid'

export interface WorldHistoryItem {
  id: string
  title: string
  prompt: string
  previewUrl?: string
  jobId?: string
  status: string
  files?: { type: string; url: string }[]
  createdAt: number
}

const STORAGE_KEY = 'onemini-world-history'

function load(): WorldHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as WorldHistoryItem[]
  } catch {
    /* ignore */
  }
  return []
}

export const useWorldHistoryStore = defineStore('worldHistory', () => {
  const items = ref<WorldHistoryItem[]>(load())
  const activeId = ref<string | null>(items.value[0]?.id ?? null)
  const rightTab = ref<'explore' | 'create'>('create')

  watch(items, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  function add(item: Omit<WorldHistoryItem, 'id' | 'createdAt'>) {
    const entry: WorldHistoryItem = {
      ...item,
      id: randomUUID(),
      createdAt: Date.now(),
    }
    items.value.unshift(entry)
    activeId.value = entry.id
    return entry
  }

  function update(id: string, patch: Partial<WorldHistoryItem>) {
    const item = items.value.find((i) => i.id === id)
    if (item) Object.assign(item, patch)
  }

  function select(id: string) {
    activeId.value = id
  }

  const activeItem = () => items.value.find((i) => i.id === activeId.value)

  return { items, activeId, rightTab, add, update, select, activeItem }
})
