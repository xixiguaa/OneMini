import { sendChatStream, type ChatStreamOptions } from '../api/agent'
import type { ModelConfig } from '../types/agent'
import {
  splitThinkingAnswerStream,
  type ThinkingAnswerStreamSlice,
} from '../utils/deepThinking'

export function isReasonerModel(model: Pick<ModelConfig, 'model'>): boolean {
  const id = (model.model || '').toLowerCase()
  return /reasoner|r1|o1|think/.test(id)
}

/** DeepSeek API 支持 thinking / reasoning_effort 的模型（见官方思考模式文档） */
export function supportsDeepSeekThinkingApi(
  provider?: string,
  model?: string,
): boolean {
  if (provider !== 'deepseek') return false
  const id = (model || '').trim().toLowerCase()
  if (!id) return false
  if (/reasoner/.test(id)) return true
  if (/^deepseek-v4-(pro|flash)$/.test(id)) return true
  if (id === 'deepseek-chat' || id === 'deepseek-reasoner') return true
  return false
}

/** 开启深度思考时走服务商原生推理流（reasoning_content），而非 XML 单次解析 */
export function usesNativeThinkingStream(
  model: Pick<ModelConfig, 'model' | 'provider'>,
  deepThinkingEnabled: boolean,
): boolean {
  if (!deepThinkingEnabled) return false
  if (isReasonerModel(model)) return true
  return supportsDeepSeekThinkingApi(model.provider, model.model)
}

export function resolveThinkingApiParams(
  model: Pick<ModelConfig, 'model' | 'provider'>,
  deepThinkingEnabled: boolean,
): { thinkingEnabled?: boolean; reasoningEffort?: 'high' | 'max' } {
  if (!supportsDeepSeekThinkingApi(model.provider, model.model)) {
    return {}
  }
  return {
    thinkingEnabled: deepThinkingEnabled,
    reasoningEffort: deepThinkingEnabled ? 'high' : undefined,
  }
}

export interface DeepThinkingStreamHandlers {
  onThinkingDelta: (chunk: string) => void
  onAnswerDelta: (chunk: string) => void
}

/** 非 Reasoner + 深度思考：单次请求，完整 context，按 <thinking>/<answer> 分流式解析 */
export async function runSinglePassDeepThinking(
  opts: Omit<ChatStreamOptions, 'onDelta'> & {
    handlers: DeepThinkingStreamHandlers
  },
): Promise<{ thinking: string; answer: string; thinkingDurationMs: number }> {
  const thinkStart = Date.now()
  let raw = ''
  let lastThinkingLen = 0
  let lastAnswerLen = 0

  const emitSlice = (split: ThinkingAnswerStreamSlice) => {
    const thinking = split.thinking ?? ''
    if (thinking.length > lastThinkingLen) {
      opts.handlers.onThinkingDelta(thinking.slice(lastThinkingLen))
      lastThinkingLen = thinking.length
    }
    const answer = split.answer ?? ''
    if (answer.length > lastAnswerLen) {
      opts.handlers.onAnswerDelta(answer.slice(lastAnswerLen))
      lastAnswerLen = answer.length
    }
  }

  await sendChatStream({
    ...opts,
    onDelta: (chunk) => {
      raw += chunk
      emitSlice(splitThinkingAnswerStream(raw))
    },
  })

  const final = splitThinkingAnswerStream(raw)
  emitSlice(final)

  const thinking = (final.thinking ?? '').trim()
  const answer = (final.answer ?? raw).trim()

  return {
    thinking,
    answer: answer || raw.trim(),
    thinkingDurationMs: Date.now() - thinkStart,
  }
}
