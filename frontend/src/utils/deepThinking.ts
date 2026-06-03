import type { ChatMessage, ThinkingTrace, WorkingMemoryState } from '../types/agent'
import { parseStateUpdate } from './workingMemory'

/** Reasoner 等自带推理通道的模型：简短提示即可 */
export const DEEP_THINKING_PROTOCOL = `<!-- DEEP THINKING 深度思考 -->
用户已开启「深度思考」。若你支持分步输出，可先简要推理再回答；正式回答须简洁、有条理。`

/** 普通模型单次调用：必须先 <thinking> 再 <answer>，推理与回答同享完整 context */
export const SINGLE_PASS_DEEP_THINKING_FORMAT = `<!-- DEEP THINKING 单次深度思考 -->
你是一个深度思考助手。用户已开启「深度思考」。

你必须先输出推理过程，再输出正式回答。格式严格如下（标签英文小写）：

<thinking>
[完整推理：结合对话历史、工作记忆、RAG/联网等上下文；分析意图与指代；列举可能性并排除；形成回答策略。不要写最终答案正文]
</thinking>

<answer>
[面向用户的正式回答，自然流畅，不要重复 thinking 的内容]
</answer>

规则：
1. 严格按上述顺序与标签输出；不要在 <thinking> 之前或 </answer> 之后输出任何文字
2. 使用简体中文
3. 若需输出工作记忆，仅在 <answer> 末尾按既有协议附加 <state_update>（勿放入 <thinking>）`

export function composeDeepThinkingBlock(
  enabled: boolean,
  opts?: { singlePass?: boolean },
): string {
  if (!enabled) return ''
  return opts?.singlePass ? SINGLE_PASS_DEEP_THINKING_FORMAT : DEEP_THINKING_PROTOCOL
}

const THINKING_RE = /<thinking>\s*([\s\S]*?)\s*<\/thinking>/i
const THINKING_OPEN_RE = /<thinking>/i
const ANSWER_RE = /<answer>\s*([\s\S]*?)\s*<\/answer>/i

/** `` 标签（字符串拼接构造 RegExp，避免被误解析） */
const THINK_TAG = 'think'
const THINK_OPEN_RE = new RegExp(`<${THINK_TAG}>`, 'i')
const THINK_CLOSE_RE = new RegExp(`</${THINK_TAG}>`, 'i')
const THINK_START_RE = new RegExp(`^<${THINK_TAG}>`, 'i')

/** 各模型/部署在 content 里使用的推理标签变体 */
interface ThinkingTagFormat {
  id: string
  startRe: RegExp
  openRe: RegExp
  closeRe: RegExp
  answerOpenRe?: RegExp
  answerCloseRe?: RegExp
}

const THINKING_TAG_FORMATS: ThinkingTagFormat[] = [
  {
    id: 'onemini',
    startRe: /^<thinking>/i,
    openRe: /<thinking>/i,
    closeRe: /<\/thinking>/i,
    answerOpenRe: /<answer>/i,
    answerCloseRe: /<\/answer>/i,
  },
  {
    id: 'redacted',
    startRe: /^<think>/i,
    openRe: /<think>/i,
    closeRe: /<\/redacted_thinking>/i,
    answerOpenRe: /<response>/i,
    answerCloseRe: /<\/response>/i,
  },
  {
    id: 'think',
    startRe: THINK_START_RE,
    openRe: THINK_OPEN_RE,
    closeRe: THINK_CLOSE_RE,
  },
]

function pickThinkingTagFormat(cleaned: string): ThinkingTagFormat | null {
  for (const format of THINKING_TAG_FORMATS) {
    if (format.startRe.test(cleaned)) return format
  }
  for (const format of THINKING_TAG_FORMATS) {
    const m = cleaned.match(format.openRe)
    if (m && m.index != null && m.index < 400) return format
  }
  return null
}

function splitResponseOnlyAnswer(cleaned: string): ThinkingAnswerStreamSlice | null {
  const trimmed = cleaned.trim()
  if (!/^<response>/i.test(trimmed)) return null

  const openTag = trimmed.match(/^<response>/i)![0]
  const afterOpen = trimmed.slice(openTag.length)
  const closeMatch = afterOpen.match(/<\/response>/i)

  if (!closeMatch || closeMatch.index === undefined) {
    return {
      thinking: null,
      answer: afterOpen.trim(),
      phase: 'answer',
      thinkingDone: false,
    }
  }

  const inner = afterOpen.slice(0, closeMatch.index).trim()
  const tail = afterOpen.slice(closeMatch.index + closeMatch[0].length).trim()
  const answer = [inner, tail].filter(Boolean).join('\n\n')
  return {
    thinking: null,
    answer,
    phase: 'done',
    thinkingDone: true,
  }
}

export function stripDuplicateThinkingPrefix(content: string, thinking: string): string {
  const t = thinking.trim()
  let c = content.trim()
  if (!t || !c) return c
  if (c.startsWith(t)) {
    c = c.slice(t.length).trim().replace(/^[\n\r-]+/, '')
  }
  return c
}

function looksLikeLeakedReasoning(text: string): boolean {
  if (text.length < 120) return false
  return /我需要用|最后总结|画个对比表|推理过程|用户问|我们被要求|需要专业简洁/.test(text)
}

function splitByThinkingTagFormat(
  cleaned: string,
  format: ThinkingTagFormat,
): ThinkingAnswerStreamSlice {
  const openTag = cleaned.match(format.openRe)?.[0]
  if (!openTag) {
    return { thinking: null, answer: cleaned, phase: 'none', thinkingDone: false }
  }

  const openIdx = cleaned.search(format.openRe)
  const afterOpen = cleaned.slice(openIdx + openTag.length)
  const closeMatch = afterOpen.match(format.closeRe)

  if (!closeMatch || closeMatch.index === undefined) {
    return {
      thinking: afterOpen.trim(),
      answer: '',
      phase: 'thinking',
      thinkingDone: false,
    }
  }

  const thinking = afterOpen.slice(0, closeMatch.index).trim()
  let rest = afterOpen.slice(closeMatch.index + closeMatch[0].length)

  if (!format.answerOpenRe) {
    return {
      thinking: thinking || null,
      answer: rest.trim(),
      phase: rest.trim() ? 'done' : 'between',
      thinkingDone: true,
    }
  }

  const answerOpenIdx = rest.search(format.answerOpenRe)
  if (answerOpenIdx < 0) {
    return {
      thinking: thinking || null,
      answer: rest.trim(),
      phase: 'between',
      thinkingDone: true,
    }
  }

  const answerOpenTag = rest.match(format.answerOpenRe)![0]
  const afterAnswerOpen = rest.slice(answerOpenIdx + answerOpenTag.length)
  const answerCloseRe = format.answerCloseRe
  const answerCloseMatch = answerCloseRe ? afterAnswerOpen.match(answerCloseRe) : null

  if (!answerCloseMatch || answerCloseMatch.index === undefined) {
    return {
      thinking: thinking || null,
      answer: afterAnswerOpen.trim(),
      phase: 'answer',
      thinkingDone: true,
    }
  }

  const answer = afterAnswerOpen.slice(0, answerCloseMatch.index).trim()
  return {
    thinking: thinking || null,
    answer,
    phase: 'done',
    thinkingDone: true,
  }
}

export type ThinkingAnswerPhase = 'none' | 'thinking' | 'between' | 'answer' | 'done'

export interface ThinkingAnswerStreamSlice {
  thinking: string | null
  answer: string
  phase: ThinkingAnswerPhase
  thinkingDone: boolean
}

/** 从累积流式原文中拆分推理块与正式回答（支持多种标签变体） */
export function splitThinkingAnswerStream(raw: string): ThinkingAnswerStreamSlice {
  const cleaned = stripComposerStatusPrefixes(raw)

  const responseOnly = splitResponseOnlyAnswer(cleaned)
  if (responseOnly) return responseOnly

  const format = pickThinkingTagFormat(cleaned)
  if (format) {
    return splitByThinkingTagFormat(cleaned, format)
  }

  if (/^<answer>/i.test(cleaned)) {
    const answerOnly = cleaned.match(ANSWER_RE)
    if (answerOnly) {
      return {
        thinking: null,
        answer: answerOnly[1].trim(),
        phase: 'done',
        thinkingDone: true,
      }
    }
  }

  return {
    thinking: null,
    answer: cleaned,
    phase: 'none',
    thinkingDone: false,
  }
}

const STATUS_PREFIX_RE = [
  /^🧠\s*深度思考中[…\.]*\s*\n+/,
  /^🌐\s*联网检索完成[^\n]*\n+\n*/,
  /^📚\s*Milvus RAG 检索中…\s*\n+/,
  /^🕸️\s*LLM-Wiki 检索中…\s*\n+/,
  /^🦞\s*多智能体协作中[^\n]*\n+\n*/,
  /^>\s*引用：[^\n]*\n\n?/,
  /^>\s*Wiki 页：[^\n]*\n\n?/,
]

export function stripComposerStatusPrefixes(raw: string): string {
  let text = raw
  for (const re of STATUS_PREFIX_RE) {
    text = text.replace(re, '')
  }
  return text.trim()
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
  const tagged = splitThinkingAnswerStream(cleaned)
  if (tagged.phase === 'none' && !tagged.thinkingDone) {
    return {
      thinking: null,
      answer: cleaned,
      inThinking: false,
      thinkingDone: false,
    }
  }
  return {
    thinking: tagged.thinking,
    answer: tagged.answer,
    inThinking: tagged.phase === 'thinking',
    thinkingDone: tagged.thinkingDone,
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
  const tagged = splitThinkingAnswerStream(stripped)
  const split =
    tagged.phase !== 'none' || tagged.thinkingDone
      ? {
          thinking: tagged.thinking,
          answer: tagged.answer,
          inThinking: tagged.phase === 'thinking',
          thinkingDone: tagged.thinkingDone,
        }
      : splitThinkingStream(stripped)
  let body = split.thinkingDone || split.answer ? split.answer : stripped.replace(THINKING_RE, '').trim()
  if (ANSWER_RE.test(stripped) && !body) {
    const m = stripped.match(ANSWER_RE)
    if (m) body = m[1].trim()
  }

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

/** 推理已在 metadata.thinking（原生 reasoning_content 流）时，只剥离 state_update；若 content 仍含标签则再拆 */
export function finalizeSeparatedThinkingReply(
  raw: string,
): {
  displayContent: string
  workingMemory?: WorkingMemoryState
  thinking?: ThinkingTrace
} {
  const stripped = stripComposerStatusPrefixes(raw)
  const tagged = splitThinkingAnswerStream(stripped)
  if (tagged.thinking?.trim() && tagged.thinkingDone) {
    const { displayContent, workingMemory } = parseStateUpdate(tagged.answer || '')
    return {
      displayContent: displayContent || tagged.answer,
      workingMemory,
      thinking: {
        content: tagged.thinking.trim(),
      },
    }
  }
  const { displayContent, workingMemory } = parseStateUpdate(stripped)
  return {
    displayContent: displayContent || stripped,
    workingMemory,
  }
}

/** 从 content 中提取标签推理（API 未返回 reasoning_content 时的流式/收尾拆分） */
export function peelTaggedThinkingFromContent(
  content: string,
): { thinking: string; answer: string } | null {
  const split = splitThinkingAnswerStream(content)
  if (split.thinking?.trim()) {
    return { thinking: split.thinking.trim(), answer: split.answer.trim() }
  }
  if (/^<response>/i.test(content.trim()) && split.answer.trim()) {
    return null
  }
  if (split.phase === 'none') return null
  return null
}

/** 统一提取助手消息展示正文（运行时 finalize + 历史 repair 共用） */
export function normalizeAssistantDisplay(
  raw: string,
  opts?: {
    existingThinking?: string
    forceHeuristic?: boolean
    thinkingDurationMs?: number
  },
): {
  displayContent: string
  thinking?: ThinkingTrace
  workingMemory?: WorkingMemoryState
} {
  const stripped = stripComposerStatusPrefixes(raw)
  if (/^\.{2,8}$/.test(stripped) || stripped === '…') {
    return { displayContent: '' }
  }

  const existingThinking = opts?.existingThinking?.trim()
  if (existingThinking) {
    const tagged = splitThinkingAnswerStream(stripped)
    if (tagged.answer?.trim() && (tagged.thinking?.trim() || /^<response>/i.test(stripped))) {
      const { displayContent, workingMemory } = parseStateUpdate(tagged.answer)
      return {
        displayContent: displayContent || tagged.answer,
        workingMemory,
        thinking: {
          content: existingThinking,
          durationMs: opts?.thinkingDurationMs,
        },
      }
    }

    let answer = stripDuplicateThinkingPrefix(stripped, existingThinking)
    if (
      opts?.forceHeuristic ||
      answer === stripped ||
      looksLikeLeakedReasoning(answer)
    ) {
      const heur = extractHeuristicThinking(stripped)
      if (heur.answer?.trim() && heur.thinking?.trim()) {
        answer = heur.answer
      }
    }

    const { displayContent, workingMemory } = parseStateUpdate(answer)
    return {
      displayContent: displayContent || answer,
      workingMemory,
      thinking: {
        content: existingThinking,
        durationMs: opts?.thinkingDurationMs,
      },
    }
  }

  return parseAssistantReplyWithFallback(stripped, {
    forceDeepThink: opts?.forceHeuristic,
    thinkingStartedAt:
      opts?.thinkingDurationMs != null
        ? Date.now() - opts.thinkingDurationMs
        : undefined,
  })
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
    /\n-{3,}\n+(?=##\s)/,
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

/** 修复已持久化的助手消息（content 混入推理 / 残留标签 / 占位符） */
export function repairAssistantMessage(msg: ChatMessage): ChatMessage {
  if (msg.role !== 'assistant' || msg.type !== 'text') return msg

  const raw = msg.content ?? ''
  const existingThinking = msg.metadata?.thinking?.content?.trim()
  if (!raw.trim() && !existingThinking) return msg

  const normalized = normalizeAssistantDisplay(raw, {
    existingThinking,
    forceHeuristic: Boolean(existingThinking),
    thinkingDurationMs: msg.metadata?.thinking?.durationMs,
  })

  const nextContent = normalized.displayContent?.trim() ?? ''
  const prevContent = raw.trim()
  const nextThinking = normalized.thinking?.content?.trim() ?? existingThinking

  if (nextContent === prevContent && !normalized.thinking?.content) return msg

  return {
    ...msg,
    content: nextContent,
    metadata: {
      ...msg.metadata,
      ...(normalized.workingMemory
        ? { workingMemory: normalized.workingMemory }
        : {}),
      ...(nextThinking
        ? {
            thinking: {
              content: nextThinking,
              durationMs: msg.metadata?.thinking?.durationMs,
            },
          }
        : {}),
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
