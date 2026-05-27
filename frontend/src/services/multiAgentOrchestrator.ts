import { sendChat } from '../api/agent'
import { resolveChatBaseUrl } from '../config/providers'
import type { ModelConfig } from '../types/agent'
import type {
  AgentWorkspace,
  MultiAgentConfig,
  OrchestrationPlan,
  OrchestrationResult,
  SpecialistAgent,
} from '../types/agentConfig'
import { composeSystemPrompt } from '../utils/promptComposer'

function specialistById(agents: SpecialistAgent[], id: string) {
  return agents.find((a) => a.id === id)
}

function parsePlanJson(raw: string): OrchestrationPlan | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as OrchestrationPlan
    if (!parsed.steps?.length) return null
    return {
      summary: parsed.summary || '多智能体协作任务',
      steps: parsed.steps.map((s) => ({
        agentId: s.agentId,
        task: s.task,
      })),
    }
  } catch {
    return null
  }
}

function fallbackPlan(
  userPrompt: string,
  agents: SpecialistAgent[],
): OrchestrationPlan {
  const ids = agents.map((a) => a.id)
  const pick = (i: number) => ids[i % ids.length] || 'planner'
  return {
    summary: '默认三步协作流程',
    steps: [
      { agentId: pick(0), task: `分析需求并列出步骤：${userPrompt}` },
      { agentId: pick(1), task: `根据上一步产出可交付内容：${userPrompt}` },
      { agentId: pick(2), task: `质检并给出最终答复要点：${userPrompt}` },
    ],
  }
}

export function shouldUseMultiAgent(
  prompt: string,
  cfg: MultiAgentConfig,
): boolean {
  if (!cfg.enabled) return false
  if (prompt.length >= cfg.minPromptLength) return true
  return cfg.triggerKeywords.some((kw) => prompt.includes(kw))
}

async function callSpecialist(params: {
  workspace: AgentWorkspace
  skillPrompt: string
  agent: SpecialistAgent
  userContent: string
  model: ModelConfig
  temperature: number
  bootstrapMaxChars: number
}): Promise<string> {
  const system = composeSystemPrompt(
    params.workspace,
    params.skillPrompt,
    `${params.agent.name}：${params.agent.role}${params.agent.systemPrompt ? `\n${params.agent.systemPrompt}` : ''}`,
    params.bootstrapMaxChars,
  )

  return sendChat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: params.userContent },
    ],
    model: params.model.model,
    provider: params.model.provider,
    baseUrl: resolveChatBaseUrl(params.model.provider, params.model.baseUrl),
    modelConfigId: params.model.id,
    temperature: params.agent.temperature ?? params.temperature,
  })
}

export async function runMultiAgentPipeline(params: {
  userPrompt: string
  workspace: AgentWorkspace
  skillPrompt: string
  multiAgent: MultiAgentConfig
  model: ModelConfig
  baseTemperature: number
  bootstrapMaxChars: number
}): Promise<OrchestrationResult> {
  const {
    multiAgent,
    model,
    workspace,
    skillPrompt,
    userPrompt,
    baseTemperature,
    bootstrapMaxChars,
  } = params
  const orch = multiAgent.orchestrator

  const planPrompt = composeSystemPrompt(
    workspace,
    skillPrompt,
    `${orch.name}：${orch.role}。请将用户任务拆解为 JSON，格式：
{"summary":"一句话","steps":[{"agentId":"planner|creator|reviewer","task":"子任务描述"}]}
仅输出 JSON，steps 2～4 项。可用 agentId：${multiAgent.agents.map((a) => a.id).join(', ')}`,
    bootstrapMaxChars,
  )

  let planRaw = await sendChat({
    messages: [
      { role: 'system', content: planPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: model.model,
    provider: model.provider,
    baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
    modelConfigId: model.id,
    temperature: orch.temperature ?? 0.1,
  })

  let plan = parsePlanJson(planRaw)
  if (!plan) plan = fallbackPlan(userPrompt, multiAgent.agents)

  const stepOutputs: OrchestrationResult['stepOutputs'] = []
  let context = ''

  for (const step of plan.steps) {
    const agent =
      specialistById(multiAgent.agents, step.agentId) ?? multiAgent.agents[0]
    const content = await callSpecialist({
      workspace,
      skillPrompt,
      agent: agent!,
      userContent: `【总任务】${userPrompt}\n【本子任务】${step.task}\n【前序摘要】${context.slice(-2000) || '无'}`,
      model,
      temperature: baseTemperature,
      bootstrapMaxChars,
    })
    stepOutputs.push({
      agentId: agent!.id,
      agentName: agent!.name,
      content,
    })
    context += `\n### ${agent!.name}\n${content}`
  }

  const finalAnswer = await sendChat({
    messages: [
      {
        role: 'system',
        content: composeSystemPrompt(
          workspace,
          skillPrompt,
          `${orch.name}：汇总各子 Agent 产出，给用户一份完整、可执行的最终答复。`,
          bootstrapMaxChars,
        ),
      },
      {
        role: 'user',
        content: `用户问题：${userPrompt}\n\n协作过程：${context}\n\n请输出最终答复。`,
      },
    ],
    model: model.model,
    provider: model.provider,
    baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
    modelConfigId: model.id,
    temperature: baseTemperature,
  })

  return { plan, stepOutputs, finalAnswer }
}
