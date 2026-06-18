import type { Component } from 'vue'
import { Database, GitBranch, Globe, Terminal, Wrench } from 'lucide-vue-next'

export type AgentSkillKind = 'web' | 'knowledge' | 'mcp' | 'planned' | 'custom'

export type AgentSkillAvailability = 'ready' | 'config' | 'planned'

export interface AgentSkillCatalogItem {
  id: string
  name: string
  description: string
  kind: AgentSkillKind
  icon: Component
  iconTone: 'blue' | 'green' | 'purple' | 'pink' | 'orange' | 'cyan' | 'slate'
  availability: AgentSkillAvailability
  defaultInvokeDescription: string
  /** 知识库模式 */
  knowledgeMode?: 'rag' | 'wiki'
  permissionOptions?: { id: string; label: string; defaultOn: boolean }[]
}

/** 可被 Agent 在对话中「调用」的外部工具类能力（Function Calling / MCP） */
export const AGENT_SKILL_CATALOG: AgentSkillCatalogItem[] = [
  {
    id: 'web-search',
    name: '联网搜索',
    description: '实时查询互联网信息，结合检索摘要生成回答',
    kind: 'web',
    icon: Globe,
    iconTone: 'blue',
    availability: 'ready',
    defaultInvokeDescription:
      '当用户询问实时信息、新闻、价格或知识截止日期之后的内容时调用。',
    permissionOptions: [
      { id: 'read', label: '读取结果', defaultOn: true },
      { id: 'summarize', label: '摘要提取', defaultOn: true },
      { id: 'image', label: '图片搜索', defaultOn: false },
      { id: 'video', label: '视频搜索', defaultOn: false },
    ],
  },
  {
    id: 'knowledge-rag',
    name: '知识库检索',
    description: '从 Milvus 向量库检索用户入库文档的相关段落',
    kind: 'knowledge',
    icon: Database,
    iconTone: 'green',
    availability: 'ready',
    knowledgeMode: 'rag',
    defaultInvokeDescription:
      '当用户问题涉及已入库的内部文档、产品手册或私有资料时调用；优先引用检索结果。',
  },
  {
    id: 'knowledge-wiki',
    name: 'LLM-Wiki',
    description: '结构化 wiki 页检索，适合复杂知识体系维护与查询',
    kind: 'knowledge',
    icon: GitBranch,
    iconTone: 'green',
    availability: 'ready',
    knowledgeMode: 'wiki',
    defaultInvokeDescription:
      '当用户明确要求查询、维护或基于 llm-wiki 结构化知识图谱作答时调用。',
  },
  {
    id: 'code-exec',
    name: '代码执行',
    description: '在沙箱中运行 Python 代码，处理数据与计算',
    kind: 'planned',
    icon: Terminal,
    iconTone: 'purple',
    availability: 'planned',
    defaultInvokeDescription: '当用户需要数据计算、图表绘制或代码验证时调用。',
  },
]

export function catalogItemForMcpTool(tool: {
  qualified_name: string
  name: string
  description: string
  server_id: string
}): AgentSkillCatalogItem {
  return {
    id: `mcp:${tool.qualified_name}`,
    name: tool.name,
    description: tool.description || `MCP 工具 · ${tool.server_id}`,
    kind: 'mcp',
    icon: Wrench,
    iconTone: 'purple',
    availability: 'ready',
    defaultInvokeDescription: tool.description || `当任务需要 ${tool.name} 能力时调用。`,
  }
}

export function getCatalogItem(id: string, mcpTools: AgentSkillCatalogItem[] = []) {
  return (
    AGENT_SKILL_CATALOG.find((s) => s.id === id) ?? mcpTools.find((s) => s.id === id) ?? null
  )
}
