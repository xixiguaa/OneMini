import type { ThinkingTrace, WorkingMemoryState } from '../types/agent'
import { parseStateUpdate } from './workingMemory'

export const THINKING_ONLY_SYSTEM = `你是深度思考分析助手。只输出推理过程，禁止输出最终答案或「综上所述」式结论段落。
要求：简体中文；分析问题意图、需覆盖维度、结构规划、关键假设与不确定性；可用列表；控制在 400 字以内 unless 问题极复杂。`

export const DEEP_THINKING_PROTOCOL = `<!-- DEEP THINKING 深度思考 -->
用户已开启「深度思考」。若你支持分步输出，可先简要推理再回答；正式回答须简洁、有条理。`

const THINKING_RE = /<thinking>\s*([\s\S]*?)\s*<\/thinking>/i
const THINKING_OPEN_RE = /<thinking>/i

const STATUS_PREFIXES = [
  /^🧠\s*深度思考中[…\.]*\s*\n+/,
  /^🌐\s*联网检索完成[^\n]*\n+\n*/,
]

export function stripComposerStatusPrefixes(raw: string): string {
  let text = raw
  for (const re of STATUS_PREFIXES) {
    text = text.replace(re, '')
  }
  return text.trim()
}

export function composeDeepThinkingBlock(enabled: boolean): string {
  return enabled ? DEEP_THINKING_PROTOCOL : ''
}

export interface WebSearchHit {
  title: string
  snippet: string
  url?: string
}

export function composeWebSearchBlock(hits: WebSearchHit[]): string {
  if (!hits.length) return ''
  const lines = hits.map((h, i) => {
    const link = h.url ? ` (${h.url})` : ''
    return `${i + 1}. **${h.title}**${link}\n   ${h.snippet}`
  })
  return `<!-- WEB SEARCH 联网检索 -->
以下为联网检索摘要，请结合检索内容与自身知识回答；若检索与问题无关，可说明并主要依据模型知识作答。
${lines.join('\n')}`
}

export interface SplitThinkingStream {
  thinking: string | null
  answer: string
  inThinking: boolean
  thinkingDone: boolean
}

/** 流式解析：分离 thinking 块与正式回答 */
export function splitThinkingStream(raw: string): SplitThinkingStream {
  const cleaned = stripComposerStatusPrefixes(raw)
  const openMatch = cleaned.match(THINKING_OPEN_RE)
  if (!openMatch || openMatch.index === undefined) {
    return {
      thinking: null,
      answer: cleaned,
      inThinking: false,
      thinkingDone: false,
    }
  }

  const openIdx = openMatch.index
  const afterOpen = cleaned.slice(openIdx + openMatch[0].length)
  const closeIdx = afterOpen.search(/<\/thinking>/i)

  if (closeIdx < 0) {
    return {
      thinking: afterOpen.trim(),
      answer: cleaned.slice(0, openIdx).trim(),
      inThinking: true,
      thinkingDone: false,
    }
  }

  const thinking = afterOpen.slice(0, closeIdx).trim()
  const answerStart = openIdx + openMatch[0].length + closeIdx + '</thinking>'.length
  const answer = (cleaned.slice(0, openIdx) + cleaned.slice(answerStart)).trim()

  return {
    thinking: thinking || null,
    answer,
    inThinking: false,
    thinkingDone: true,
  }
}

export function parseAssistantReply(
  raw: string,
  opts?: { thinkingStartedAt?: number },
): {
  displayContent: string
  thinking?: ThinkingTrace
  workingMemory?: WorkingMemoryState
} {
  const stripped = stripComposerStatusPrefixes(raw)
  const split = splitThinkingStream(stripped)
  let body = split.thinkingDone || split.answer ? split.answer : stripped.replace(THINKING_RE, '').trim()

  const { displayContent, workingMemory } = parseStateUpdate(body)
  const finalContent = displayContent || body

  let thinking: ThinkingTrace | undefined
  if (split.thinking?.trim()) {
    thinking = {
      content: split.thinking.trim(),
      durationMs:
        opts?.thinkingStartedAt != null
          ? Math.max(0, Date.now() - opts.thinkingStartedAt)
          : undefined,
    }
  }

  return { displayContent: finalContent, thinking, workingMemory }
}

/** 无 XML 标签时：将首段或分隔符前内容视为推理（兜底） */
export function extractHeuristicThinking(raw: string): {
  thinking?: string
  answer: string
} {
  const text = stripComposerStatusPrefixes(raw)
  if (THINKING_OPEN_RE.test(text)) {
    return { answer: text }
  }

  const separators = [
    /\n-{3,}\n+/,
    /\n\*{3,}\n+/,
    /\n##\s+回答/m,
    /\n##\s+结论/m,
    /\n【正式回答】/,
  ]
  for (const sep of separators) {
    const m = text.match(sep)
    if (m && m.index != null && m.index > 80) {
      return {
        thinking: text.slice(0, m.index).trim(),
        answer: text.slice(m.index + m[0].length).trim(),
      }
    }
  }

  const paras = text.split(/\n\n+/)
  if (paras.length >= 3 && paras[0].length > 60) {
    const thinking = paras.slice(0, 2).join('\n\n').trim()
    const answer = paras.slice(2).join('\n\n').trim()
    if (answer.length > 40) return { thinking, answer }
  }

  return { answer: text }
}

export function parseAssistantReplyWithFallback(
  raw: string,
  opts?: { thinkingStartedAt?: number; forceDeepThink?: boolean },
) {
  const parsed = parseAssistantReply(raw, opts)
  if (parsed.thinking?.content?.trim()) return parsed
  if (!opts?.forceDeepThink) return parsed

  const heur = extractHeuristicThinking(raw)
  if (!heur.thinking?.trim()) return parsed

  return {
    ...parsed,
    displayContent: heur.answer || parsed.displayContent,
    thinking: {
      content: heur.thinking,
      durationMs:
        opts?.thinkingStartedAt != null
          ? Math.max(0, Date.now() - opts.thinkingStartedAt)
          : parsed.thinking?.durationMs,
    },
  }
}

export function formatThinkingDuration(ms?: number): string {
  if (ms == null || ms < 0) return '已思考'
  const sec = Math.max(1, Math.round(ms / 1000))
  return `已思考 (用时 ${sec} 秒)`
}

export function formatThinkingInProgress(seconds: number): string {
  if (seconds <= 0) return '思考中'
  return `思考中 (${seconds} 秒)`
}
