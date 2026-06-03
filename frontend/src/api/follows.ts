import axios from 'axios'
import { setupAuthInterceptors } from '../utils/setupAuthInterceptors'

export interface FollowStats {
  userId: string
  followerCount: number
  followingCount: number
  isFollowing: boolean
}

const api = axios.create({
  baseURL: '/api/platform/users',
  timeout: 15000,
})

setupAuthInterceptors(api)

export async function fetchFollowStats(userId: string): Promise<FollowStats> {
  const { data } = await api.get<FollowStats>(`/${encodeURIComponent(userId)}/follow-stats`)
  return data
}

export async function followUserApi(userId: string): Promise<FollowStats> {
  const { data } = await api.post<FollowStats>(`/${encodeURIComponent(userId)}/follow`)
  return data
}

export async function unfollowUserApi(userId: string): Promise<FollowStats> {
  const { data } = await api.delete<FollowStats>(`/${encodeURIComponent(userId)}/follow`)
  return data
}
