import type { ModelProvider } from '../config/providers'

export type { ModelProvider }
export type SkillId = 'chat' | 'image' | 'video' | 'world'
export type ViewId =
  | 'chat'
  | 'create'
  | 'world'
  | 'models'
  | 'skills'
  | 'knowledge'
  | 'wikiGraph'
export type CreateMode = 'agent' | 'image' | 'video'
export type ModelCapability = 'chat' | 'image' | 'video' | 'world'

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
  model: string
  capability: ModelCapability
  baseUrl?: string
  /** 密钥是否已保存在服务端（明文不在浏览器） */
  secretConfigured?: boolean
  /** 服务端返回的掩码，如 sk-…abc */
  secretHint?: string
  enabled: boolean
  description?: string
  preset?: boolean
}

export interface SkillConfig {
  id: SkillId
  name: string
  description: string
  icon: string
  enabled: boolean
  defaultModelId: string
  systemPrompt: string
}

export interface FileAttachmentMeta {
  id: string
  name: string
  kind: 'image' | 'text' | 'document'
  previewUrl?: string
  size?: number
}

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType = 'text' | 'image' | 'video' | 'world' | 'error'

export interface ChatMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  skillId: SkillId
  timestamp: number
  attachments?: {
    url?: string
    previewUrl?: string
    jobId?: string
    files?: { type: string; url: string }[]
    status?: string
    uploadedFiles?: FileAttachmentMeta[]
  }
}

export type ConversationTimeGroup =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'older'

export interface ConversationGroup {
  key: ConversationTimeGroup
  conversations: Conversation[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface GenerationPrefs {
  /** 图片宽高比 */
  aspectRatio: string
  /** 视频宽高比 */
  videoAspectRatio: string
  /** 视频分辨率：480 | 720 | 1080 */
  videoResolution: string
  autoMode: boolean
}

export interface AgentSettings {
  models: ModelConfig[]
  skills: SkillConfig[]
  generationPrefs: GenerationPrefs
}

export const APP_VERSION = 'V1.0.0'

export const DEFAULT_GENERATION_PREFS: GenerationPrefs = {
  aspectRatio: '1:1',
  videoAspectRatio: '16:9',
  videoResolution: '720',
  autoMode: true,
}
