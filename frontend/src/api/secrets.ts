import { platformApi } from './platformClient'

export interface SecretStatus {
  model_id: string
  configured: boolean
  hint: string
}

export async function fetchSecretStatuses(): Promise<SecretStatus[]> {
  const { data } = await platformApi.get<{ secrets: SecretStatus[] }>('/secrets')
  return data.secrets ?? []
}

export async function saveModelSecret(modelId: string, apiKey: string): Promise<SecretStatus> {
  const { data } = await platformApi.put<SecretStatus>(`/secrets/${encodeURIComponent(modelId)}`, {
    api_key: apiKey,
  })
  return data
}

export async function deleteModelSecret(modelId: string): Promise<void> {
  await platformApi.delete(`/secrets/${encodeURIComponent(modelId)}`)
}
