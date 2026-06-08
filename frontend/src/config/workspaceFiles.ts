import type { WorkspaceFileKey } from '../types/agentConfig'

/** OpenClaw 工作区引导文件元数据（注入顺序） */
export interface WorkspaceFileMeta {
  key: WorkspaceFileKey
  filename: string
  /** 用户可见的友好名称 */
  displayLabel: string
  icon: string
  title: string
  subtitle: string
  hint: string
  /** 注入优先级说明（数字越大越靠后、覆盖力越强） */
  injectPriority: number
  /** 是否由上方表单自动同步（手动改 Markdown 会覆盖表单对应字段） */
  formSynced: boolean
}

export const WORKSPACE_ROOT = 'agent-config/'

/** 注入顺序与优先级：IDENTITY → SOUL → USER → AGENTS → TOOLS */
export const WORKSPACE_INJECT_PRIORITY_HINT =
  '注入顺序：IDENTITY → SOUL → USER → AGENTS → TOOLS；靠后的文件在冲突时优先级更高。'

export const WORKSPACE_FILES: WorkspaceFileMeta[] = [
  {
    key: 'identity',
    filename: 'IDENTITY.md',
    displayLabel: '核心角色',
    icon: '🤖',
    title: '身份',
    subtitle: 'IDENTITY.md',
    hint: '名称、定位、擅长与不擅长——用户问「你是谁」时的回答依据',
    injectPriority: 1,
    formSynced: true,
  },
  {
    key: 'soul',
    filename: 'SOUL.md',
    displayLabel: '思维框架',
    icon: '🧠',
    title: '灵魂',
    subtitle: 'SOUL.md',
    hint: '价值观、语气、性格边界（不要写工具策略或多模态规则）',
    injectPriority: 2,
    formSynced: true,
  },
  {
    key: 'user',
    filename: 'USER.md',
    displayLabel: '用户画像',
    icon: '👤',
    title: '用户',
    subtitle: 'USER.md',
    hint: '称呼、偏好、禁忌话题、协作习惯',
    injectPriority: 3,
    formSynced: true,
  },
  {
    key: 'agents',
    filename: 'AGENTS.md',
    displayLabel: '行为规范',
    icon: '📜',
    title: '操作指令',
    subtitle: 'AGENTS.md',
    hint: '工作流程、多模态规则、合规边界（会话启动必读）',
    injectPriority: 4,
    formSynced: true,
  },
  {
    key: 'tools',
    filename: 'TOOLS.md',
    displayLabel: '工具备注',
    icon: '🔧',
    title: '工具备注',
    subtitle: 'TOOLS.md',
    hint: '环境事实与端点；工具权限由 onemini.json 控制',
    injectPriority: 5,
    formSynced: false,
  },
]

export const WORKSPACE_INJECT_ORDER: WorkspaceFileKey[] = WORKSPACE_FILES.map((f) => f.key)
