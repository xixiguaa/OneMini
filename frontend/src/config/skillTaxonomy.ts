/** Agent 技能 taxonomy：扩展 agent「能做什么」，而不只是生成文本 */

export const SKILL_TAXONOMY = {
  retrieval: {
    id: 'retrieval',
    label: '知识检索',
    hint: '从私有文档与结构化 wiki 检索答案，减少幻觉。',
  },
  api: {
    id: 'api',
    label: 'API 调用',
    hint: '通过 Function Calling 连接外部服务；OneMini 以 MCP Server 接入。',
  },
  multimodal: {
    id: 'multimodal',
    label: '多模态',
    hint: '生成图片 / 视频 / 3D，读取上传文件，执行多模态创作。',
  },
  workflow: {
    id: 'workflow',
    label: '流程编排',
    hint: '触发多步任务拆分与协作，如分镜、报告、审批流。',
  },
  code: {
    id: 'code',
    label: '代码执行',
    hint: '让 agent 运行代码处理数据与计算（规划中）。',
  },
} as const
