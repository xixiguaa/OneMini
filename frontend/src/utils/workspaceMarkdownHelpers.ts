import type { WorkspaceFileKey } from '../types/agentConfig'

/** 各文件可快速插入的 Markdown 片段 */
export const WORKSPACE_SNIPPETS: Record<WorkspaceFileKey, { label: string; content: string }[]> = {
  identity: [
    {
      label: '角色简介',
      content: `## 角色
你是 {名称}，{定位}。

## 能力
- **擅长**：{擅长领域}
- **不擅长**：{局限说明}`,
    },
    {
      label: '自我介绍模板',
      content: `当用户问「你是谁」时，简要介绍为 **{名称}**（{定位}），并说明当前可用的技能类型。`,
    },
  ],
  soul: [
    {
      label: '价值观',
      content: `## 价值观
- **可靠**：不确定时明确说明，不编造事实。
- **务实**：少空话，多可执行步骤。
- **尊重**：对用户时间与隐私保持敏感。`,
    },
    {
      label: '边界',
      content: `## 边界
- 不生成违法、侵权或仇恨内容
- 不泄露 API Key 与密钥
- 不确定时不编造事实与数据`,
    },
  ],
  user: [
    {
      label: '用户偏好',
      content: `- **称呼**：用户
- **语言**：简体中文
- **偏好**：结论先行；列表与步骤清晰
- **禁忌话题**：（在此填写）`,
    },
  ],
  agents: [
    {
      label: '工作流程',
      content: `## 流程
1. **澄清**：需求含糊时，用 1～2 个问题确认目标、风格与约束。
2. **合规**：遵守边界与禁止行为；不泄露 API Key。`,
    },
    {
      label: '多模态规则',
      content: `## 多模态策略
- **对话**：结合用户上传的文件内容作答。
- **生图/生视频**：遵循创作模板中的 \`promptHint\` 前缀。
- **3D 世界**：描述需包含场景、风格、尺度；图生 3D 时需参考构图。`,
    },
    {
      label: '边界',
      content: `## 边界
- 不夸大产品能力
- 价格与合同条款以官方文档为准`,
    },
  ],
  tools: [
    {
      label: '环境说明',
      content: `## 环境
- 前端：Vue 3 + Vite
- 后端：（在此填写端点）

## 注意
工具权限由 onemini.json 控制，此处仅作备注。`,
    },
  ],
}

const SENSITIVE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bsk-[a-zA-Z0-9]{20,}\b/g, label: 'OpenAI API Key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS Access Key' },
  { re: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S+/gi, label: '密钥/密码字段' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, label: '私钥' },
]

/** 将松散行转为规范 Markdown 列表 */
export function formatMarkdownLists(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let listBuffer: string[] = []

  function flushList() {
    if (!listBuffer.length) return
    listBuffer.forEach((item, i) => {
      const cleaned = item.replace(/^[\s\-*•·\d.]+\s*/, '').trim()
      if (cleaned) out.push(`${i + 1}. ${cleaned}`)
    })
    listBuffer = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      out.push('')
      continue
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      flushList()
      out.push(trimmed)
      continue
    }
    if (/^[-*•·]\s/.test(trimmed) || /^\d+[.)]\s/.test(trimmed)) {
      listBuffer.push(trimmed)
      continue
    }
    flushList()
    out.push(line)
  }
  flushList()
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

export interface SensitiveMatch {
  label: string
  snippet: string
}

export function scanSensitiveInfo(text: string): SensitiveMatch[] {
  const found: SensitiveMatch[] = []
  for (const { re, label } of SENSITIVE_PATTERNS) {
    re.lastIndex = 0
    const m = re.exec(text)
    if (m) {
      found.push({
        label,
        snippet: m[0].length > 24 ? `${m[0].slice(0, 12)}…${m[0].slice(-4)}` : m[0],
      })
    }
  }
  return found
}

export function scanWorkspaceSensitive(
  workspace: Record<WorkspaceFileKey, string>,
): SensitiveMatch[] {
  const all = Object.values(workspace).join('\n')
  return scanSensitiveInfo(all)
}
