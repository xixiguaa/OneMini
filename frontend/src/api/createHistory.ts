import axios from 'axios'
import type { CreateHistoryItem } from '../stores/createHistory'
import { setupAuthInterceptors } from '../utils/setupAuthInterceptors'

const api = axios.create({
  baseURL: '/api/platform/create-history',
  timeout: 60000,
})

setupAuthInterceptors(api)

export async function fetchCreateHistory(): Promise<CreateHistoryItem[]> {
  const { data } = await api.get<{ items: CreateHistoryItem[] }>('')
  return data.items ?? []
}

export async function upsertCreateHistoryItem(item: CreateHistoryItem): Promise<CreateHistoryItem> {
  const { data } = await api.post<CreateHistoryItem>('', item)
  return data
}

export async function patchCreateHistoryItem(
  id: string,
  patch: Partial<CreateHistoryItem>,
): Promise<CreateHistoryItem> {
  const { data } = await api.patch<CreateHistoryItem>(`/${id}`, patch)
  return data
}

export async function syncCreateHistory(items: CreateHistoryItem[]): Promise<CreateHistoryItem[]> {
  const { data } = await api.post<{ items: CreateHistoryItem[] }>('/sync', { items })
  return data.items ?? []
}

export async function deleteCreateSessionApi(sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`)
}

export async function deleteCreateVersionApi(
  versionId: string,
  opts?: { cascade?: boolean },
): Promise<void> {
  await api.delete(`/versions/${versionId}`, {
    params: opts?.cascade ? { cascade: true } : undefined,
  })
}
