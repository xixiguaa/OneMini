import { ASPECT_RATIOS, VIDEO_ASPECT_RATIOS } from '../config/constants'

const RATIO_PROMPT_RE = /[,，]?\s*宽高比\s*[\d:]+/g
const VIDEO_RES_PROMPT_RE = /[,，]?\s*分辨率\s*\d+p?/gi
const VIDEO_DURATION_PROMPT_RE = /[,，]?\s*(?:时长|视频时长)\s*\d+\s*秒/gi

function normalizePromptText(text: string): string {
  return text
    .replace(/\s*[,，]+\s*/g, '，')
    .replace(/^[,，\s]+|[,，\s]+$/g, '')
    .trim()
}

/** 移除视频分辨率、时长等仅视频模式写入的 prompt 片段 */
export function stripVideoPrefsFromPrompt(text: string): string {
  return normalizePromptText(
    text.replace(VIDEO_RES_PROMPT_RE, '').replace(VIDEO_DURATION_PROMPT_RE, ''),
  )
}

export function buildAspectRatioPrompt(
  ratioId: string,
  list: readonly { id: string; label: string }[] = ASPECT_RATIOS,
): string {
  if (ratioId === 'smart') return ''
  const item = list.find((r) => r.id === ratioId)
  return `宽高比 ${item?.label ?? ratioId}`
}

export function buildVideoResolutionPrompt(resolutionId: string): string {
  if (!resolutionId) return ''
  return `分辨率 ${resolutionId}P`
}

export function buildVideoDurationPrompt(seconds: number): string {
  if (!seconds) return ''
  return `时长 ${seconds} 秒`
}

function joinConfigPrompt(parts: string[]): string {
  return parts.filter(Boolean).join('，')
}

/** 配置类 prompt 始终排在用户正文之前 */
function applyConfigToPrompt(cleaned: string, configParts: string[]): string {
  const config = joinConfigPrompt(configParts)
  if (!config) return cleaned
  if (!cleaned) return config
  return `${config}，${cleaned}`
}

/** 将宽高比 prompt 写入输入框，替换已有比例描述（并清除视频专用片段） */
export function applyAspectRatioToPrompt(text: string, ratioId: string): string {
  const cleaned = normalizePromptText(
    text
      .replace(RATIO_PROMPT_RE, '')
      .replace(VIDEO_RES_PROMPT_RE, '')
      .replace(VIDEO_DURATION_PROMPT_RE, ''),
  )
  return applyConfigToPrompt(cleaned, [buildAspectRatioPrompt(ratioId)])
}

export function applyVideoPrefsToPrompt(
  text: string,
  ratioId: string,
  resolutionId: string,
  durationSeconds?: number,
): string {
  let cleaned = normalizePromptText(
    text
      .replace(RATIO_PROMPT_RE, '')
      .replace(VIDEO_RES_PROMPT_RE, '')
      .replace(VIDEO_DURATION_PROMPT_RE, ''),
  )
  const parts: string[] = []
  const ratioPart = buildAspectRatioPrompt(ratioId, VIDEO_ASPECT_RATIOS)
  const resPart = buildVideoResolutionPrompt(resolutionId)
  const durPart = durationSeconds ? buildVideoDurationPrompt(durationSeconds) : ''
  if (ratioPart) parts.push(ratioPart)
  if (resPart) parts.push(resPart)
  if (durPart) parts.push(durPart)
  return applyConfigToPrompt(cleaned, parts)
}
