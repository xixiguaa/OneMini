import axios from 'axios'
import type { CreateHistoryItem } from '../stores/createHistory'
import { setupAuthInterceptors } from '../utils/setupAuthInterceptors'

const api = axios.create({
  baseURL: '/api/platform/create-history',
  timeout: 60000,
})

setupAuthInterceptors(api)

export async function fetchPublicGallery(type?: 'image' | 'video'): Promise<CreateHistoryItem[]> {
  const params = type ? { type } : undefined
  const { data } = await api.get<{ items: CreateHistoryItem[] }>('/public', { params })
  return data.items ?? []
}

export async function publishPublicGallery(
  itemId: string,
  payload: { title: string; description?: string },
): Promise<CreateHistoryItem> {
  const { data } = await api.post<CreateHistoryItem>(`/public/${itemId}`, {
    title: payload.title,
    description: payload.description ?? '',
  })
  return data
}
