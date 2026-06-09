import { buildDefaultPersonaForm } from '../config/agentPersonaTemplates'
import type { AgentWorkspace } from '../types/agentConfig'
import type { AgentPersonaForm, AgentPersonaTone } from '../types/agentPersona'

const TONE_LABELS: Record<AgentPersonaTone, string> = {
  professional: '专业、友好，与品牌一致；避免过度卖萌或冗长寒暄',
  friendly: '温暖、耐心、鼓励式表达；适度使用口语化称呼',
  concise: '极简、直接、少废话；优先结论与列表',
  creative: '开放、联想丰富；善用比喻与多方案对比',
}

const KNOWLEDGE_BLOCK = `## 知识来源（两套系统，勿混用）

| 系统 | 路径 | 何时使用 |
|------|------|----------|
| **Milvus RAG** | 用户经 UI「知识库」入库 | 对话勾选「知识库增强」时由后端检索 |
| **LLM-Wiki** | 仓库 \`llm-wiki/\`（见 \`WIKI.md\`） | 用户明确要求维护/查询结构化 wiki 时 |

处理 \`llm-wiki/\` 时：先读 \`llm-wiki/wiki/index.md\`，遵守 ingest / query / lint 流程；**不要**将 wiki 写入 Milvus。`

export function composeIdentityMd(form: AgentPersonaForm) {
  return `# ${form.name} 身份

- **名称**：${form.name}
- **定位**：${form.tagline}
- **擅长**：${form.strengths}
- **不擅长**：${form.weaknesses}

当用户问「你是谁」时，简要介绍为 **${form.name}**（${form.tagline}），并说明当前可用的技能类型。不要使用与配置不符的别称或 emoji 人设。`
}

export function composeSoulMd(form: AgentPersonaForm) {
  const restrictionLines =
    form.restrictions.length > 0
      ? form.restrictions.map((r) => `- ${r}`).join('\n')
      : '- （未设置额外边界）'

  return `# ${form.name} 灵魂 · 价值观与语气

## 价值观
- **可靠**：不确定时明确说明，不编造 API、价格或政策。
- **务实**：少空话，多可执行步骤与示例。
- **尊重**：对用户时间与隐私保持敏感。

## 语气
- ${TONE_LABELS[form.tone]}

## 边界
${restrictionLines}`
}

export function composeUserMd(form: AgentPersonaForm) {
  const taboo =
    form.restrictions.find((r) => r.includes('医疗') || r.includes('法律')) ??
    '（在此填写，例如：不讨论投资理财建议）'

  return `# 用户人设（可按需修改）

- **称呼**：${form.userNickname}
- **语言**：${form.language}
- **偏好**：${form.responseStyle}
- **时区**：Asia/Shanghai
- **禁忌话题**：${taboo}

## 协作习惯
- 复杂任务欢迎拆成子任务并行处理（多智能体模式开启时）。
- 上传图片/文档时，请结合附件内容回答。`
}

export function composeAgentsMd(form: AgentPersonaForm) {
  const workflowSteps: string[] = []
  if (form.clarifyFirst) {
    workflowSteps.push('1. **澄清**：需求含糊时，用 1～2 个问题确认目标、风格与约束。')
  }
  if (form.planComplexTasks) {
    workflowSteps.push(
      `${workflowSteps.length + 1}. **规划**：复杂任务先给出简短步骤（≤5 步），再逐步执行。`,
    )
  }
  if (form.conclusionFirst) {
    workflowSteps.push(
      `${workflowSteps.length + 1}. **交付**：结论先行；技术细节放后；附可操作建议。`,
    )
  }
  workflowSteps.push(
    `${workflowSteps.length + 1}. **合规**：遵守边界与禁止行为；不泄露 API Key。`,
  )

  const customBlock = form.customInstructions.trim()
    ? `\n## 额外指令\n${form.customInstructions.trim()}\n`
    : ''

  return `# ${form.name} 宪法 · 工作流程与行为规范

## 角色
你是 ${form.name}，${form.tagline}

## 目标
优先理解用户目标，再选择合适技能（对话 / 生图 / 生视频 / 世界生成）。

## 流程
${workflowSteps.join('\n')}
${customBlock ? customBlock.replace('## 额外指令', '## 补充指令') : ''}
## 多模态策略
- **对话**：结合用户上传的文件内容作答。
- **生图/生视频**：遵循创作模板中的 \`promptHint\` 前缀。
- **3D 世界**：描述需包含场景、风格、尺度；图生 3D 时需参考构图。

## 输出格式
- ${form.language}；专业、简洁。
- 代码/配置用 Markdown 代码块；流程图可用 Mermaid。

${KNOWLEDGE_BLOCK}`
}

export function composeWorkspaceFromPersona(
  form: AgentPersonaForm,
  existing?: AgentWorkspace,
): AgentWorkspace {
  return {
    agents: composeAgentsMd(form),
    soul: composeSoulMd(form),
    identity: composeIdentityMd(form),
    user: composeUserMd(form),
    tools: existing?.tools ?? '',
  }
}

export interface SystemPromptSegment {
  key: 'identity' | 'soul' | 'user' | 'agents'
  filename: string
  label: string
  content: string
}

export function composeSystemPromptSegments(form: AgentPersonaForm): SystemPromptSegment[] {
  return [
    { key: 'identity', filename: 'IDENTITY.md', label: '核心角色', content: composeIdentityMd(form) },
    { key: 'soul', filename: 'SOUL.md', label: '思维框架', content: composeSoulMd(form) },
    { key: 'user', filename: 'USER.md', label: '用户画像', content: composeUserMd(form) },
    { key: 'agents', filename: 'AGENTS.md', label: '行为规范', content: composeAgentsMd(form) },
  ]
}

export function composeSystemPromptPreview(form: AgentPersonaForm) {
  if (form.promptOverride?.trim()) return form.promptOverride.trim()
  return composeSystemPromptSegments(form)
    .map((s) => s.content)
    .join('\n\n---\n\n')
}

export function buildIntroPreview(form: AgentPersonaForm) {
  const toneSample =
    form.tone === 'friendly'
      ? `你好呀，${form.userNickname}！我是 ${form.name}。`
      : `你好，${form.userNickname}。我是 ${form.name}。`

  return `${toneSample}

${form.tagline}

我擅长：${form.strengths}。若你有创作、分析或规划类任务，可以直接告诉我目标与约束。`
}

/** 从已有 workspace 粗略解析（无法解析的字段保留当前表单值） */
export function parsePersonaFromWorkspace(
  workspace: AgentWorkspace,
  fallback: AgentPersonaForm = buildDefaultPersonaForm(),
): AgentPersonaForm {
  const form = { ...fallback }
  const pick = (text: string, re: RegExp) => text.match(re)?.[1]?.trim()

  const name = pick(workspace.identity, /\*\*名称\*\*[：:]\s*(.+)/)
  if (name) form.name = name

  const tagline = pick(workspace.identity, /\*\*定位\*\*[：:]\s*(.+)/)
  if (tagline) form.tagline = tagline

  const strengths = pick(workspace.identity, /\*\*擅长\*\*[：:]\s*(.+)/)
  if (strengths) form.strengths = strengths

  const weaknesses = pick(workspace.identity, /\*\*不擅长\*\*[：:]\s*(.+)/)
  if (weaknesses) form.weaknesses = weaknesses

  const nickname = pick(workspace.user, /\*\*称呼\*\*[：:]\s*(.+)/)
  if (nickname) form.userNickname = nickname

  const language = pick(workspace.user, /\*\*语言\*\*[：:]\s*(.+)/)
  if (language) form.language = language

  const pref = pick(workspace.user, /\*\*偏好\*\*[：:]\s*(.+)/)
  if (pref) form.responseStyle = pref

  const restrictions: string[] = []
  let inBoundary = false
  for (const line of workspace.soul.split('\n')) {
    if (/^## 边界/.test(line)) {
      inBoundary = true
      continue
    }
    if (inBoundary && /^## /.test(line)) break
    const m = line.match(/^-\s+(.+)/)
    if (inBoundary && m && !m[1].includes('未设置')) {
      restrictions.push(m[1].trim())
    }
  }
  if (restrictions.length) form.restrictions = restrictions

  form.clarifyFirst = /澄清/.test(workspace.agents)
  form.planComplexTasks = /规划/.test(workspace.agents)
  form.conclusionFirst = /结论先行|交付/.test(workspace.agents)

  const extra = workspace.agents.match(/## 额外指令\n([\s\S]*?)(?:\n##|$)/)
  if (extra?.[1]) form.customInstructions = extra[1].trim()

  return form
}
