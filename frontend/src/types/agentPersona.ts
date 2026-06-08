/** Agent 人设表单：语义字段，后端组装为 workspace Markdown */

export type AgentPersonaTone = 'professional' | 'friendly' | 'concise' | 'creative'

export interface AgentPersonaForm {
  templateId: string
  name: string
  tagline: string
  tone: AgentPersonaTone
  strengths: string
  weaknesses: string
  userNickname: string
  language: string
  responseStyle: string
  customInstructions: string
  restrictions: string[]
  clarifyFirst: boolean
  planComplexTasks: boolean
  conclusionFirst: boolean
}

export const RESTRICTION_PRESETS = [
  '不生成违法、侵权或仇恨内容',
  '不泄露 API Key 与密钥',
  '不确定时不编造事实与数据',
  '不提供医疗 / 法律等专业建议',
  '不代替用户做不可逆操作',
  '不使用未启用的能力或工具',
] as const

export const TONE_OPTIONS: { id: AgentPersonaTone; label: string; sample: string }[] = [
  {
    id: 'professional',
    label: '专业严谨',
    sample: '我会先确认需求，再给出可执行的步骤与结论。',
  },
  {
    id: 'friendly',
    label: '友好亲切',
    sample: '很高兴帮你！我们一步步来，把这件事理清楚。',
  },
  {
    id: 'concise',
    label: '简洁直接',
    sample: '结论：可以这样做。步骤如下。',
  },
  {
    id: 'creative',
    label: '创意发散',
    sample: '可以从三个方向展开——视觉、叙事、技术实现，你更倾向哪一种？',
  },
]
