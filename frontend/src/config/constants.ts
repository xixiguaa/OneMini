export const ACCEPT_CHAT_FILES =
  'image/*,.pdf,.doc,.docx,.txt,.md,.markdown,.html,.htm,.json,.csv'

export const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
] as const

/** 视频常用宽高比 */
export const VIDEO_ASPECT_RATIOS = [
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
] as const

/** 知识图谱构建页：ingest LLM 选择（localStorage） */
export const WIKI_INGEST_MODEL_STORAGE_KEY = 'onemini-wiki-ingest-model-id'

export const VIDEO_RESOLUTIONS = [
  { id: '480', label: '480P', hint: '短边 480px' },
  { id: '720', label: '720P', hint: '短边 720px' },
  { id: '1080', label: '1080P', hint: '短边 1080px' },
] as const
