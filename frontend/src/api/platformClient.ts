import axios from 'axios'
import { getClientUserId } from '../utils/userId'

/** 平台 API 客户端：自动附带用户分区头，不传输 API Key */
export const platformApi = axios.create({
  baseURL: '/api/platform',
  timeout: 120000,
})

platformApi.interceptors.request.use((config) => {
  config.headers.set('X-User-Id', getClientUserId())
  return config
})
