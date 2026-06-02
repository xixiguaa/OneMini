export const ACCEPT_CREATE_IMAGE = 'image/*'

export const ACCEPT_CREATE_VIDEO = 'image/*,video/*'

export const ACCEPT_CREATE_DIGITAL_HUMAN = 'image/*,video/*'

/** Agent：图片、视频、文档等；不含表格 xlsx/xls/xlsm */
export const ACCEPT_CREATE_AGENT =
  'image/*,video/*,.pdf,.doc,.docx,.txt,.md,.markdown,.html,.htm,.json,.csv'

/** @deprecated 使用 acceptFilesForCreateMode */
export const ACCEPT_CHAT_FILES = ACCEPT_CREATE_AGENT

export const ASPECT_RATIOS = [
  { id: 'smart', label: '智能' },
  { id: '21:9', label: '21:9' },
  { id: '16:9', label: '16:9' },
  { id: '3:2', label: '3:2' },
  { id: '4:3', label: '4:3' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '2:3', label: '2:3' },
  { id: '9:16', label: '9:16' },
] as const

/** 视频常用宽高比 */
export const VIDEO_ASPECT_RATIOS = [
  { id: '21:9', label: '21:9' },
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
] as const

/** 知识图谱构建页：ingest LLM 选择（localStorage） */
export const WIKI_INGEST_MODEL_STORAGE_KEY = 'onemini-wiki-ingest-model-id'

export const VIDEO_RESOLUTIONS = [
  { id: '480', label: '480P', hint: '短边 480px' },
  { id: '720', label: '720P', hint: '短边 720px' },
  { id: '1080', label: '1080P', hint: '短边 1080px' },
] as const

/** 图片分辨率档位（即梦风格） */
export const IMAGE_RESOLUTIONS = [
  { id: '2k', label: '高清 2K' },
  { id: '4k', label: '超清 4K' },
] as const

/** 视频生成时长（秒） */
export const VIDEO_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const
