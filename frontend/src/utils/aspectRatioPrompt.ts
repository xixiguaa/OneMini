import { ASPECT_RATIOS, VIDEO_ASPECT_RATIOS } from '../config/constants'

const RATIO_PROMPT_RE = /[,，]?\s*宽高比\s*[\d:]+/g
const VIDEO_RES_PROMPT_RE = /[,，]?\s*分辨率\s*\d+p?/gi

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

/** 将宽高比 prompt 写入输入框，替换已有比例描述 */
export function applyAspectRatioToPrompt(text: string, ratioId: string): string {
  const cleaned = text.replace(RATIO_PROMPT_RE, '').trim()
  const ratioPart = buildAspectRatioPrompt(ratioId)
  if (!ratioPart) return cleaned
  if (!cleaned) return ratioPart
  return `${cleaned}，${ratioPart}`
}

export function applyVideoPrefsToPrompt(
  text: string,
  ratioId: string,
  resolutionId: string,
): string {
  let cleaned = text.replace(RATIO_PROMPT_RE, '').replace(VIDEO_RES_PROMPT_RE, '').trim()
  const parts: string[] = []
  const ratioPart = buildAspectRatioPrompt(ratioId, VIDEO_ASPECT_RATIOS)
  const resPart = buildVideoResolutionPrompt(resolutionId)
  if (ratioPart) parts.push(ratioPart)
  if (resPart) parts.push(resPart)
  if (!parts.length) return cleaned
  if (!cleaned) return parts.join('，')
  return `${cleaned}，${parts.join('，')}`
}
