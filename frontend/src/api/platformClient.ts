import axios from 'axios'
import { setupAuthInterceptors } from '../utils/setupAuthInterceptors'

/** 平台 API 客户端：JWT + 用户分区头 */
export const platformApi = axios.create({
  baseURL: '/api/platform',
  timeout: 120000,
})

setupAuthInterceptors(platformApi)
