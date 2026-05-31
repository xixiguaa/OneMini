import type { WorkingMemoryState } from '../types/agent'

const STATE_UPDATE_RE = /<state_update>\s*([\s\S]*?)\s*<\/state_update>/i

export const WORKING_MEMORY_PROTOCOL = `<!-- WORKING MEMORY PROTOCOL -->
你维护一份内部工作记忆（用户不可见）。每轮回复末尾必须输出：

<state_update>
{
  "intent_stack": ["当前主意图"],
  "active_slots": {
    "topic": "正在讨论的主题",
    "pending_clarification": null,
    "regenerate_context": null
  },
  "confidence": 0.85
}
</state_update>

规则：
1. intent_stack 最多 3 层；完成则出栈，新子意图则压栈
2. confidence < 0.6 或存在多种合理解读时，在正文列出 2–4 个澄清选项，并设 pending_clarification
3. 收到重新生成请求时，在 active_slots.regenerate_context 写入被重答问题摘要
4. 正文与 state_update 分离；正文不得包含 JSON 或 XML 标签
5. 若调用了工具（检索、生图、多 Agent 等），在 active_slots.last_tool 记录工具名与状态`

export const TOOL_AWARENESS_PROTOCOL = `<!-- AGENT TOOL AWARENESS -->
当系统注入「工具/技能执行」状态时，你必须：
- 在正文中简要说明正在使用的能力（如 RAG、Wiki、多智能体、生图），不暴露内部 API
- 在 state_update.active_slots.last_tool 记录 { "name": "...", "status": "running|done" }
- 工具失败时给出可操作的下一步，勿编造已成功`

export function composeWorkingMemoryBlock(state?: WorkingMemoryState): string {
  if (!state?.intent_stack?.length && !state?.active_slots) return ''
  return `<!-- WORKING MEMORY (session) -->
当前会话工作记忆（请在此基础上更新 state_update）：
${JSON.stringify(state, null, 2)}`
}

export function composeEpisodicMemoryBlock(snippets: string[]): string {
  if (!snippets.length) return ''
  return `<!-- EPISODIC MEMORY -->
以下是与当前问题相关的历史片段（可能来自其它会话），仅供参考，勿当作本轮用户原话：
${snippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
}

export function parseStateUpdate(raw: string): {
  displayContent: string
  workingMemory?: WorkingMemoryState
} {
  const match = raw.match(STATE_UPDATE_RE)
  if (!match) {
    return { displayContent: raw.trim() }
  }
  const displayContent = raw.replace(STATE_UPDATE_RE, '').trim()
  try {
    const parsed = JSON.parse(match[1]) as WorkingMemoryState
    if (parsed && typeof parsed === 'object') {
      return { displayContent, workingMemory: parsed }
    }
  } catch {
    /* ignore malformed */
  }
  return { displayContent }
}

export function formatEpisodicSnippet(hit: {
  content?: string
  role?: string
  conversationId?: string
  timestamp?: number
}): string {
  const text = (hit.content || '').replace(/\n/g, ' ').trim().slice(0, 200)
  const role = hit.role === 'user' ? '用户' : '助手'
  const date = hit.timestamp
    ? new Date(hit.timestamp).toLocaleDateString('zh-CN')
    : ''
  return `[${date}·${role}] ${text}`
}
