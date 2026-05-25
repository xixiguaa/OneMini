import axios from 'axios'
import type { QueryJobResponse, SubmitJobResponse } from '../types/api'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
})

export interface SubmitParams {
  prompt?: string
  imageUrl?: string
  imageBase64?: string
  generateType?: string
  enablePBR?: boolean
  faceCount?: number
  model?: string
  rapid?: boolean
}

export async function submitJob(params: SubmitParams): Promise<SubmitJobResponse> {
  const endpoint = params.rapid ? '/submit-rapid' : '/submit'
  const { rapid: _, ...body } = params
  const { data } = await api.post<SubmitJobResponse>(endpoint, body)
  return data
}

export async function queryJob(jobId: string, rapid = false): Promise<QueryJobResponse> {
  const endpoint = rapid ? '/query-rapid' : '/query'
  const { data } = await api.post<QueryJobResponse>(endpoint, { jobId })
  return data
}

export async function checkHealth() {
  const { data } = await api.get<{ ok: boolean; configured: boolean }>('/health')
  return data
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
