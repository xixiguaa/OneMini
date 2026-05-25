import type { WorkspaceFileKey } from '../types/agentConfig'

/** OpenClaw 工作区引导文件元数据（注入顺序） */
export interface WorkspaceFileMeta {
  key: WorkspaceFileKey
  filename: string
  title: string
  subtitle: string
  hint: string
}

export const WORKSPACE_ROOT = 'agent-config/'

export const WORKSPACE_FILES: WorkspaceFileMeta[] = [
  {
    key: 'agents',
    filename: 'AGENTS.md',
    title: '操作指令',
    subtitle: 'AGENTS.md',
    hint: '工作流程、记忆规则、合规边界（OpenClaw 会话启动必读）',
  },
  {
    key: 'soul',
    filename: 'SOUL.md',
    title: '灵魂',
    subtitle: 'SOUL.md',
    hint: '价值观、语气、性格边界（不要写工具策略）',
  },
  {
    key: 'identity',
    filename: 'IDENTITY.md',
    title: '身份',
    subtitle: 'IDENTITY.md',
    hint: '名称、定位、擅长与不擅长',
  },
  {
    key: 'user',
    filename: 'USER.md',
    title: '用户',
    subtitle: 'USER.md',
    hint: '称呼、偏好、禁忌话题、协作习惯',
  },
  {
    key: 'tools',
    filename: 'TOOLS.md',
    title: '工具备注',
    subtitle: 'TOOLS.md',
    hint: '环境事实与端点；工具权限由 onemini.json 控制',
  },
]

export const WORKSPACE_INJECT_ORDER: WorkspaceFileKey[] = WORKSPACE_FILES.map((f) => f.key)
