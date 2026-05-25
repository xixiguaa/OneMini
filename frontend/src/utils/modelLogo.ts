import { getProviderLogo } from '../config/providers'
import type { ModelProvider } from '../config/providers'
import type { ModelConfig } from '../types/agent'

/** 预设模型 → logo（优先于服务商默认图标） */
const LOGO_MAP: Record<string, string> = {
  'deepseek-v4-pro': '/logos/deepseek-color.svg',
  'gpt-5.5-high': '/logos/openai.svg',
  'claude-sonnet': '/logos/claude-color.svg',
  'glm-4-plus': '/logos/zhipu-color.svg',
}

const CAPABILITY_LOGO: Record<string, string> = {
  chat: '/logos/codex-color.svg',
  image: '/logos/gemini-color.svg',
  video: '/logos/kling-color.svg',
  world: '/logos/hunyuan-color.svg',
}

const KEYWORD_LOGO: [RegExp, string][] = [
  [/deepseek/i, '/logos/deepseek-color.svg'],
  [/claude|anthropic/i, '/logos/claude-color.svg'],
  [/hunyuan|混元/i, '/logos/hunyuan-color.svg'],
  [/yuanbao|元宝/i, '/logos/yuanbao-color.svg'],
  [/kling|可灵/i, '/logos/kling-color.svg'],
  [/gemini/i, '/logos/gemini-color.svg'],
  [/qwen|通义|tongyi/i, '/logos/qwen-color.svg'],
  [/glm|zhipu|智谱/i, '/logos/zhipu-color.svg'],
  [/百炼|bailian|dashscope/i, '/logos/bailian-color.svg'],
  [/doubao|豆包/i, '/logos/doubao-color.svg'],
  [/bytedance|字节|volces|ark/i, '/logos/bytedance-color.svg'],
  [/minimax/i, '/logos/minimax-color.svg'],
  [/grok|xai/i, '/logos/grok.svg'],
  [/nanobanana/i, '/logos/nanobanana-color.svg'],
  [/codex/i, '/logos/codex-color.svg'],
  [/meta|llama/i, '/logos/meta-color.svg'],
  [/gpt|openai|chatgpt/i, '/logos/openai.svg'],
]

export { getProviderLogo }

/** 品牌图 public/logo.jpg */
export const BRAND_LOGO = '/logo.jpg'
export const BRAND_NAME = 'OneMini'

function matchByKeywords(model: Pick<ModelConfig, 'id' | 'name' | 'model'>): string | null {
  const hint = `${model.id} ${model.name} ${model.model}`
  for (const [re, path] of KEYWORD_LOGO) {
    if (re.test(hint)) return path
  }
  return null
}

export function getModelLogo(
  model: Pick<ModelConfig, 'id' | 'name' | 'model' | 'provider' | 'capability'>,
): string {
  return (
    LOGO_MAP[model.id] ??
    matchByKeywords(model) ??
    getProviderLogo(model.provider as ModelProvider) ??
    CAPABILITY_LOGO[model.capability] ??
    '/logos/codex-color.svg'
  )
}
