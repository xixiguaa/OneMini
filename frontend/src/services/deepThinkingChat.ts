import { sendChatStream, type ChatStreamOptions } from '../api/agent'
import type { ModelConfig } from '../types/agent'
import { THINKING_ONLY_SYSTEM } from '../utils/deepThinking'

export function isReasonerModel(model: Pick<ModelConfig, 'model'>): boolean {
  const id = (model.model || '').toLowerCase()
  return /reasoner|r1|o1|think/.test(id)
}

export interface DeepThinkingStreamHandlers {
  onThinkingDelta: (chunk: string) => void
  onAnswerDelta: (chunk: string) => void
}

/** 非 Reasoner 模型：先流式生成推理，再流式生成正式回答 */
export async function runTwoPhaseDeepThinking(
  opts: Omit<ChatStreamOptions, 'onDelta'> & {
    userQuestion: string
    handlers: DeepThinkingStreamHandlers
  },
): Promise<{ thinking: string; answer: string; thinkingDurationMs: number }> {
  const thinkStart = Date.now()
  let thinking = ''

  await sendChatStream({
    ...opts,
    messages: [
      { role: 'system', content: THINKING_ONLY_SYSTEM },
      {
        role: 'user',
        content: `请分析以下用户问题并输出推理过程（不要写最终答案）：\n\n${opts.userQuestion}`,
      },
    ],
    temperature: Math.min(opts.temperature ?? 0.3, 0.35),
    onDelta: (chunk) => {
      thinking += chunk
      opts.handlers.onThinkingDelta(chunk)
    },
  })

  const thinkingDurationMs = Date.now() - thinkStart
  thinking = thinking.trim()

  const answerSystem = [
    opts.messages.find((m) => m.role === 'system')?.content ?? '',
    thinking
      ? `【深度思考·推理摘要（内部参考，勿原样复述）】\n${thinking}\n\n请基于上述推理，输出面向用户的正式回答。`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const answerMessages = opts.messages.map((m, i) =>
    i === 0 && m.role === 'system' ? { role: 'system', content: answerSystem } : m,
  )

  let answer = ''
  await sendChatStream({
    ...opts,
    messages: answerMessages,
    onDelta: (chunk) => {
      answer += chunk
      opts.handlers.onAnswerDelta(chunk)
    },
  })

  return { thinking, answer, thinkingDurationMs }
}
