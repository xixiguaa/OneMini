import { DETAIL_REPAIR_PROMPT } from '../config/imageEditTools'
import { ASPECT_RATIOS, IMAGE_RESOLUTIONS, VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS } from '../config/constants'
import { digitalHumanModeLabel, type DigitalHumanMode } from '../config/digitalHumanModes'
import type { CreateHistoryItem } from '../stores/createHistory'

export type ImageEditAction =
  | 'generate'
  | 'video-generate'
  | 'prompt-edit'
  | 'video-edit'
  | 'detail-repair'
  | 'smart-hd'
  | 'outpaint'
  | 'inpaint'
  | 'eraser'
  | 'lipsync'

export const EDIT_ACTION_LABELS: Record<ImageEditAction, string> = {
  generate: '图片生成',
  'video-generate': '视频生成',
  'prompt-edit': '描述编辑',
  'video-edit': '描述编辑',
  'detail-repair': '细节修复',
  'smart-hd': '超清',
  outpaint: '扩图',
  inpaint: '局部重绘',
  eraser: '消除笔',
  lipsync: '角色说',
}

const EDIT_ACTION_SET = new Set<string>(Object.keys(EDIT_ACTION_LABELS))

export function isImageEditAction(value: string | undefined): value is ImageEditAction {
  return !!value && EDIT_ACTION_SET.has(value)
}

export function isRootEditVersion(item: CreateHistoryItem, versions: CreateHistoryItem[]) {
  if (!item.parentId) return true
  return versions[0]?.id === item.id
}

export function resolveEditAction(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
): ImageEditAction {
  if (isImageEditAction(item.editAction)) return item.editAction
  if (isRootEditVersion(item, versions)) {
    return item.type === 'video' ? 'video-generate' : 'generate'
  }
  if (item.prompt.trim() === DETAIL_REPAIR_PROMPT) return 'detail-repair'
  if (item.type === 'video') return 'video-edit'
  return 'prompt-edit'
}

export function resolveEditActionLabel(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
) {
  return EDIT_ACTION_LABELS[resolveEditAction(item, versions)]
}

export function resolveParentVersion(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
) {
  if (!item.parentId) return null
  return versions.find((v) => v.id === item.parentId) ?? null
}

export function resolveEditTagThumb(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
  mediaUrl: (entry: CreateHistoryItem) => string,
) {
  const own = mediaUrl(item)
  if (own) return own
  const parent = resolveParentVersion(item, versions)
  return parent ? mediaUrl(parent) : ''
}

export function buildEditHistoryMeta(
  item: CreateHistoryItem,
  opts?: { imageResolution?: string; videoResolution?: string; isVideo?: boolean },
) {
  const parts: string[] = []
  if (item.modelName) parts.push(item.modelName)

  const ratioOpts = opts?.isVideo ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS
  const ratioId = item.aspectRatio ?? '1:1'
  const ratioLabel = ratioOpts.find((r) => r.id === ratioId)?.label ?? ratioId
  if (ratioLabel) parts.push(ratioLabel)

  const resOpts = opts?.isVideo ? VIDEO_RESOLUTIONS : IMAGE_RESOLUTIONS
  const resId = opts?.isVideo ? opts.videoResolution : opts?.imageResolution
  const resLabel = resOpts.find((r) => r.id === resId)?.label
  if (resLabel) parts.push(resLabel.replace(/^高清\s|^超清\s/, ''))

  return parts.join(' | ')
}

export function isSystemEditPrompt(prompt: string) {
  return prompt.trim() === DETAIL_REPAIR_PROMPT
}

export function displayEditPrompt(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
) {
  const action = resolveEditAction(item, versions)
  if (action === 'detail-repair') return DETAIL_REPAIR_PROMPT
  return item.prompt.trim()
}

export interface DetailMetaRow {
  label: string
  value: string
  /** 长文本（如台词）纵向排列 */
  multiline?: boolean
}

export function formatDetailDateTime(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '未知时间'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resolveVideoResolutionLabel(resId?: string) {
  const label = VIDEO_RESOLUTIONS.find((r) => r.id === resId)?.label
  if (!label || label === '720P') return '标准'
  return label
}

function resolveAspectRatioLabel(item: CreateHistoryItem) {
  const ratioOpts = item.type === 'video' ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS
  const ratioId = item.aspectRatio ?? (item.type === 'video' ? '16:9' : '1:1')
  const ratioLabel = ratioOpts.find((r) => r.id === ratioId)?.label ?? ratioId
  return ratioLabel === '智能' ? '16:9' : ratioLabel
}

export function buildDigitalHumanSpecsSummary(modeId?: DigitalHumanMode, durationSec = 3) {
  return `${digitalHumanModeLabel(modeId ?? 'fast')} | ${durationSec}s`
}

export function buildDigitalHumanDetailRows(
  item: CreateHistoryItem,
  opts?: {
    digitalHumanModeId?: DigitalHumanMode
    videoResolution?: string
    prompt?: string
  },
): DetailMetaRow[] {
  const rows: DetailMetaRow[] = [
    { label: '数字人模式', value: digitalHumanModeLabel(opts?.digitalHumanModeId ?? 'fast') },
    { label: '视频比例', value: resolveAspectRatioLabel(item) },
    { label: '帧率', value: '25 fps' },
    { label: '分辨率', value: resolveVideoResolutionLabel(opts?.videoResolution) },
  ]

  if (item.modelName) {
    rows.push({ label: '模型', value: item.modelName })
  }

  rows.push({ label: '生成时间', value: formatDetailDateTime(item.createdAt) })

  const prompt = opts?.prompt?.trim()
  if (prompt) {
    rows.push({ label: '角色台词', value: prompt, multiline: true })
  }

  return rows
}

export const GENERATION_HINT_LABEL = '可能调用检索'

const TOOL_ACTIONS_WITH_USED: ImageEditAction[] = [
  'detail-repair',
  'smart-hd',
  'outpaint',
  'inpaint',
  'eraser',
]

function resolveUsedFeatureLabel(action: ImageEditAction): string | null {
  if (TOOL_ACTIONS_WITH_USED.includes(action)) {
    return EDIT_ACTION_LABELS[action]
  }
  return null
}

function isLipsyncDetailContext(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
  opts?: { digitalHumanMode?: boolean },
) {
  return opts?.digitalHumanMode || resolveEditAction(item, versions) === 'lipsync'
}

/** 编辑页右侧栏「详细信息」hover 卡片 */
export function buildActiveEditDetailRows(
  item: CreateHistoryItem,
  versions: CreateHistoryItem[],
  opts?: {
    isVideo?: boolean
    imageResolution?: string
    videoResolution?: string
    digitalHumanMode?: boolean
    digitalHumanModeId?: DigitalHumanMode
  },
): DetailMetaRow[] {
  if (isLipsyncDetailContext(item, versions, opts)) {
    return [
      { label: '视频比例', value: resolveAspectRatioLabel(item) },
      { label: '帧率', value: '25' },
      { label: '分辨率', value: resolveVideoResolutionLabel(opts?.videoResolution) },
      { label: '使用过', value: '对口型' },
      { label: '生成时间', value: formatDetailDateTime(item.createdAt) },
      { label: '生成提示', value: GENERATION_HINT_LABEL },
    ]
  }

  const action = resolveEditAction(item, versions)
  const rows: DetailMetaRow[] = []
  const usedLabel = resolveUsedFeatureLabel(action)
  if (usedLabel) {
    rows.push({ label: '使用过', value: usedLabel })
  }

  rows.push({ label: '生成时间', value: formatDetailDateTime(item.createdAt) })
  rows.push({ label: '生成提示', value: GENERATION_HINT_LABEL })
  return rows
}
