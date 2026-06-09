import { sendChat } from '../api/agent'
import { resolveChatModel } from './resolveModel'
import type { OneMiniSkeleton } from '../types/agentConfig'
import type { ModelConfig } from '../types/agent'

const OPTIMIZE_META = `你是专业的 AI System Prompt 工程师。用户会给出简短的角色描述，你需要将其扩写为结构规范、可直接使用的 System Prompt。

要求：
1. 使用中文简体
2. 用 XML 标签分区，例如 <identity>、<capabilities>、<constraints>、<workflow>、<output_format>
3. 内容具体、可执行，避免空泛形容词
4. 只输出 Prompt 正文，不要解释或包裹 markdown 代码块`

type SettingsLike = {
  getModel: (id: string) => ModelConfig | undefined
  getSkill: (id: 'chat') => { defaultModelId?: string } | undefined
  modelsForChat: () => ModelConfig[]
}

export async function optimizeSystemPrompt(
  brief: string,
  skeleton: OneMiniSkeleton,
  settings: SettingsLike,
): Promise<string> {
  const trimmed = brief.trim()
  if (!trimmed) throw new Error('请先输入简短的角色描述')

  const resolved = resolveChatModel(skeleton, settings)
  if (!resolved.ok) throw new Error(resolved.error)

  const model = resolved.model
  const content = await sendChat({
    messages: [
      { role: 'system', content: OPTIMIZE_META },
      { role: 'user', content: trimmed },
    ],
    model: model.model,
    provider: model.provider,
    baseUrl: model.baseUrl,
    modelConfigId: model.id,
    temperature: 0.4,
  })

  const result = content.trim()
  if (!result) throw new Error('AI 未返回有效内容')
  return result
}
