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
  | 'profile'
export type CreateMode = 'agent' | 'image' | 'video' | 'digitalHuman'
export type ModelCapability = 'chat' | 'multimodal' | 'image' | 'video' | 'world'

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
  kind: 'image' | 'video' | 'text' | 'document'
  previewUrl?: string
  size?: number
}

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType = 'text' | 'image' | 'video' | 'world' | 'error'
export type MessageFeedback = 'like' | 'dislike'

/** 工作记忆：Prompt 内 intent_stack + active_slots */
export interface WorkingMemoryState {
  intent_stack: string[]
  active_slots: Record<string, unknown>
  confidence?: number
}

export interface AgentToolCallRecord {
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error'
  summary?: string
}

/** 深度思考过程（CoT），UI 展示为可折叠「已思考」 */
export interface ThinkingTrace {
  content: string
  durationMs?: number
}

export interface MessageMetadata {
  action?: 'regenerate' | 'branch' | 'send'
  targetAssistantId?: string
  workingMemory?: WorkingMemoryState
  toolCalls?: AgentToolCallRecord[]
  thinking?: ThinkingTrace
}

/** 消息节点 (MessageNode) */
export interface ChatMessage {
  id: string
  role: MessageRole
  type: MessageType
  content: string
  skillId: SkillId
  timestamp: number
  feedback?: MessageFeedback
  /** DAG 父节点 */
  parentId?: string
  /** 分支根（通常为该轮 user 消息 id） */
  branchRootId?: string
  /** 同 parent 下的版本序号 */
  variantIndex?: number
  metadata?: MessageMetadata
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
  /** 是否已在服务端创建（本地占位会话为 false） */
  serverSynced?: boolean
  /** 分支时间线当前激活叶节点 */
  activeLeafId?: string | null
  /** 会话级工作记忆缓存 */
  workingMemory?: WorkingMemoryState
}

export interface GenerationPrefs {
  /** 图片宽高比 */
  aspectRatio: string
  /** 图片分辨率档位：2k | 4k */
  imageResolution: string
  /** 图片输出宽度（px） */
  imageWidth: number
  /** 图片输出高度（px） */
  imageHeight: number
  /** 宽高比锁定时，修改 W/H 自动联动 */
  imageSizeLocked: boolean
  /** 视频宽高比 */
  videoAspectRatio: string
  /** 视频分辨率：480 | 720 | 1080 */
  videoResolution: string
  /** 视频时长（秒） */
  videoDuration: number
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
  imageResolution: '2k',
  imageWidth: 2048,
  imageHeight: 2048,
  imageSizeLocked: true,
  videoAspectRatio: '16:9',
  videoResolution: '720',
  videoDuration: 5,
  autoMode: true,
}
