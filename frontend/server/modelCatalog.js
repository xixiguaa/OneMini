/**
 * 模型展示目录（Phase 1）
 * 分类、标签、中文名由产品维护；model 字段为 API 调用标识（Ark 等需替换为接入点 ID 时在 description 说明）
 */

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/plan/v3'

/** 豆包视觉模型（预设选择与兜底列表共用同一 model 标识） */
const DOUBAO_SEEDREAM_5_LITE = {
  model: 'doubao-seedream-5.0-lite',
  label: 'Doubao-Seedream-5.0-lite',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_2 = {
  model: 'doubao-seedance-2.0',
  label: 'Doubao-Seedance-2.0',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_2_FAST = {
  model: 'doubao-seedance-2.0-fast',
  label: 'Doubao-Seedance-2.0-fast',
  baseUrl: ARK_BASE,
}
const DOUBAO_SEEDANCE_1_5_PRO = {
  model: 'doubao-seedance-1.5-pro',
  label: 'Doubao-Seedance-1.5-pro',
  baseUrl: ARK_BASE,
}
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1'
const OPENAI_BASE = 'https://api.openai.com/v1'
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
const ZHIPU_BASE = 'https://open.bigmodel.cn/api/paas/v4'
const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const MINIMAX_BASE = 'https://api.minimax.chat/v1'
const MOONSHOT_BASE = 'https://api.moonshot.cn/v1'

/** 语言模型预设（model 字段与 API 调用标识一致） */
function langModel(id, label, baseUrl, extra = {}) {
  return { id, model: id, label, baseUrl, ...extra }
}

/** @typedef {{ text: string, variant?: 'beta'|'preview'|'featured'|'info' }} CatalogTag */
/** @typedef {{ id: string, model: string, label: string, description?: string, baseUrl?: string, tags?: CatalogTag[] }} CatalogModel */
/** @typedef {{ id: string, label: string, models: CatalogModel[] }} CatalogCategory */

/** @type {Record<string, Partial<Record<string, { categories: CatalogCategory[] }>>>} */
export const MODEL_CATALOG = {
  deepseek: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            langModel('deepseek-v4-pro', 'DeepSeek V4 Pro', DEEPSEEK_BASE, {
              tags: [{ text: '旗舰', variant: 'featured' }],
            }),
            langModel('deepseek-v4-flash', 'DeepSeek V4 Flash', DEEPSEEK_BASE, {
              tags: [{ text: '快速', variant: 'info' }],
            }),
            langModel('deepseek-v3.2', 'DeepSeek V3.2', DEEPSEEK_BASE),
            langModel('deepseek-chat', 'DeepSeek Chat', DEEPSEEK_BASE, {
              tags: [{ text: '通用对话', variant: 'info' }],
            }),
            langModel('deepseek-reasoner', 'DeepSeek Reasoner', DEEPSEEK_BASE, {
              tags: [{ text: '深度推理', variant: 'featured' }],
            }),
          ],
        },
      ],
    },
  },
  openai: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            { id: 'gpt-4o', model: 'gpt-4o', label: 'GPT-4o', baseUrl: OPENAI_BASE },
            { id: 'gpt-4o-mini', model: 'gpt-4o-mini', label: 'GPT-4o Mini', baseUrl: OPENAI_BASE },
            {
              id: 'gpt-4.1',
              model: 'gpt-4.1',
              label: 'GPT-4.1',
              baseUrl: OPENAI_BASE,
              tags: [{ text: '更强能力', variant: 'featured' }],
            },
            { id: 'o3-mini', model: 'o3-mini', label: 'o3-mini', baseUrl: OPENAI_BASE, tags: [{ text: '推理', variant: 'info' }] },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            {
              id: 'gpt-4o-mm',
              model: 'gpt-4o',
              label: 'GPT-4o',
              baseUrl: OPENAI_BASE,
              description: '文本、识图、文件读取与图片/视频生成',
              tags: [{ text: '多模态', variant: 'featured' }],
            },
            { id: 'gpt-4.1-mm', model: 'gpt-4.1', label: 'GPT-4.1', baseUrl: OPENAI_BASE },
            { id: 'gpt-4o-mini-mm', model: 'gpt-4o-mini', label: 'GPT-4o Mini', baseUrl: OPENAI_BASE },
          ],
        },
      ],
    },
    image: {
      categories: [
        {
          id: 'image',
          label: '图片生成',
          models: [
            { id: 'dall-e-3', model: 'dall-e-3', label: 'DALL·E 3', baseUrl: OPENAI_BASE },
            { id: 'gpt-image-1', model: 'gpt-image-1', label: 'GPT Image 1', baseUrl: OPENAI_BASE, tags: [{ text: '公测中', variant: 'beta' }] },
          ],
        },
      ],
    },
    video: {
      categories: [
        {
          id: 'video',
          label: '视频生成',
          models: [
            {
              id: 'sora',
              model: 'sora',
              label: 'Sora',
              baseUrl: OPENAI_BASE,
              description: '需在 OpenAI 账户开通视频能力',
              tags: [{ text: '需开通', variant: 'beta' }],
            },
          ],
        },
      ],
    },
  },
  anthropic: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            {
              id: 'claude-sonnet-4',
              model: 'claude-sonnet-4-20250514',
              label: 'Claude Sonnet 4',
              baseUrl: ANTHROPIC_BASE,
            },
            {
              id: 'claude-3-5-sonnet',
              model: 'claude-3-5-sonnet-20241022',
              label: 'Claude 3.5 Sonnet',
              baseUrl: ANTHROPIC_BASE,
            },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            {
              id: 'claude-sonnet-4-mm',
              model: 'claude-sonnet-4-20250514',
              label: 'Claude Sonnet 4',
              baseUrl: ANTHROPIC_BASE,
              description: '支持图片与文档理解',
              tags: [{ text: '多模态', variant: 'featured' }],
            },
            {
              id: 'claude-3-5-sonnet-mm',
              model: 'claude-3-5-sonnet-20241022',
              label: 'Claude 3.5 Sonnet',
              baseUrl: ANTHROPIC_BASE,
            },
          ],
        },
      ],
    },
  },
  zhipu: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            langModel('glm-5.1', 'GLM-5.1', ZHIPU_BASE, {
              tags: [{ text: '最新', variant: 'featured' }],
            }),
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            langModel('glm-4v-plus', 'GLM-4V Plus', ZHIPU_BASE, {
              description: '视觉理解、文件与多模态对话',
              tags: [{ text: '多模态', variant: 'featured' }],
            }),
            langModel('glm-4v-flash', 'GLM-4V Flash', ZHIPU_BASE),
          ],
        },
      ],
    },
    image: {
      categories: [
        {
          id: 'image',
          label: '图片生成',
          models: [
            { id: 'cogview-3-plus', model: 'cogview-3-plus', label: 'CogView 3 Plus', baseUrl: ZHIPU_BASE },
          ],
        },
      ],
    },
  },
  qwen: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            { id: 'qwen-plus', model: 'qwen-plus', label: 'Qwen Plus', baseUrl: QWEN_BASE },
            { id: 'qwen-turbo', model: 'qwen-turbo', label: 'Qwen Turbo', baseUrl: QWEN_BASE },
            { id: 'qwen-max', model: 'qwen-max', label: 'Qwen Max', baseUrl: QWEN_BASE, tags: [{ text: '更强能力', variant: 'featured' }] },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            {
              id: 'qwen-vl-max',
              model: 'qwen-vl-max',
              label: 'Qwen-VL Max',
              baseUrl: QWEN_BASE,
              description: '视觉理解、文件读取与多模态对话',
              tags: [{ text: '多模态', variant: 'featured' }],
            },
            { id: 'qwen-vl-plus', model: 'qwen-vl-plus', label: 'Qwen-VL Plus', baseUrl: QWEN_BASE },
          ],
        },
      ],
    },
    image: {
      categories: [
        {
          id: 'image',
          label: '图片生成',
          models: [
            { id: 'wanx-v1', model: 'wanx-v1', label: '通义万相', baseUrl: QWEN_BASE },
          ],
        },
      ],
    },
  },
  bailian: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            { id: 'qwen-plus', model: 'qwen-plus', label: '百炼 · Qwen Plus', baseUrl: QWEN_BASE },
            { id: 'qwen-max', model: 'qwen-max', label: '百炼 · Qwen Max', baseUrl: QWEN_BASE },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            {
              id: 'qwen-vl-max-bailian',
              model: 'qwen-vl-max',
              label: '百炼 · Qwen-VL Max',
              baseUrl: QWEN_BASE,
              tags: [{ text: '多模态', variant: 'featured' }],
            },
          ],
        },
      ],
    },
  },
  doubao: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            langModel('doubao-seed-2.0-pro', 'Doubao Seed 2.0 Pro', ARK_BASE, {
              tags: [{ text: '旗舰', variant: 'featured' }],
            }),
            langModel('doubao-seed-2.0-code', 'Doubao Seed 2.0 Code', ARK_BASE, {
              tags: [{ text: '代码', variant: 'info' }],
            }),
            langModel('doubao-seed-2.0-lite', 'Doubao Seed 2.0 Lite', ARK_BASE, {
              tags: [{ text: '轻量', variant: 'info' }],
            }),
            langModel('doubao-seed-2.0-mini', 'Doubao Seed 2.0 Mini', ARK_BASE, {
              tags: [{ text: '高性价比', variant: 'info' }],
            }),
            {
              id: 'doubao-pro-32k',
              model: 'doubao-pro-32k',
              label: '豆包 Pro 32K',
              baseUrl: ARK_BASE,
              description: '火山方舟：请使用控制台创建的推理接入点 ID 替换 model',
            },
            {
              id: 'doubao-lite-32k',
              model: 'doubao-lite-32k',
              label: '豆包 Lite 32K',
              baseUrl: ARK_BASE,
              tags: [{ text: '高性价比', variant: 'info' }],
            },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            langModel('doubao-seed-2.0-pro', 'Doubao Seed 2.0 Pro', ARK_BASE, {
              description: '文本、识图、文件与 Seedream/Seedance 创作',
              tags: [{ text: '多模态', variant: 'featured' }],
            }),
            langModel('doubao-seed-2.0-lite', 'Doubao Seed 2.0 Lite', ARK_BASE),
          ],
        },
      ],
    },
    image: {
      categories: [
        {
          id: 'image',
          label: '图片生成',
          models: [
            {
              id: 'seedream-5-lite',
              model: DOUBAO_SEEDREAM_5_LITE.model,
              label: DOUBAO_SEEDREAM_5_LITE.label,
              baseUrl: ARK_BASE,
              tags: [{ text: '轻量', variant: 'info' }],
            },
            {
              id: 'seedream-5-preview',
              model: 'doubao-seedream-5-0-preview',
              label: 'Doubao-Seedream-5.0-Preview',
              baseUrl: ARK_BASE,
              tags: [{ text: '预览', variant: 'preview' }],
              description: 'Ark 图片模型，model 请填接入点 ID',
            },
            {
              id: 'seedream-4-5',
              model: 'doubao-seedream-4-5',
              label: 'Doubao-Seedream-4.5',
              baseUrl: ARK_BASE,
            },
          ],
        },
      ],
    },
    video: {
      categories: [
        {
          id: 'video',
          label: '视频生成',
          models: [
            {
              id: 'seedance-2',
              model: DOUBAO_SEEDANCE_2.model,
              label: DOUBAO_SEEDANCE_2.label,
              baseUrl: ARK_BASE,
              tags: [{ text: '最新', variant: 'featured' }],
            },
            {
              id: 'seedance-2-fast',
              model: DOUBAO_SEEDANCE_2_FAST.model,
              label: DOUBAO_SEEDANCE_2_FAST.label,
              baseUrl: ARK_BASE,
              tags: [{ text: '快速', variant: 'info' }],
            },
            {
              id: 'seedance-1-5-pro',
              model: DOUBAO_SEEDANCE_1_5_PRO.model,
              label: DOUBAO_SEEDANCE_1_5_PRO.label,
              baseUrl: ARK_BASE,
              tags: [{ text: '更强能力', variant: 'featured' }],
            },
            {
              id: 'seedance-1-pro',
              model: 'doubao-seedance-1-0-pro',
              label: 'Doubao-Seedance-1.0-pro',
              baseUrl: ARK_BASE,
            },
            {
              id: 'seedance-1-pro-fast',
              model: 'doubao-seedance-1-0-pro-fast',
              label: 'Doubao-Seedance-1.0-pro-fast',
              baseUrl: ARK_BASE,
              tags: [{ text: '快速', variant: 'info' }],
            },
          ],
        },
      ],
    },
  },
  bytedance: {},
  tencent: {
    world: {
      categories: [
        {
          id: 'world',
          label: '3D 世界',
          models: [
            {
              id: 'hunyuan-3d-pro',
              model: 'hunyuan-3d-pro',
              label: '混元 3D 专业版',
              description: '使用服务端 .env 腾讯云密钥',
            },
            { id: 'rapid', model: 'rapid', label: '混元 3D Rapid', description: '快速生成' },
          ],
        },
      ],
    },
    image: {
      categories: [
        {
          id: 'image',
          label: '图片生成',
          models: [{ id: 'hunyuan-image', model: 'hunyuan-image', label: '混元生图', description: '腾讯云 AI 绘画' }],
        },
      ],
    },
    video: {
      categories: [
        {
          id: 'video',
          label: '视频生成',
          models: [{ id: 'hunyuan-video', model: 'hunyuan-video', label: '混元视频' }],
        },
      ],
    },
  },
  gemini: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            {
              id: 'gemini-2-flash',
              model: 'gemini-2.0-flash',
              label: 'Gemini 2.0 Flash',
              description: '请填写 Google AI 兼容 Base URL',
            },
            { id: 'gemini-2-pro', model: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro' },
          ],
        },
      ],
    },
    multimodal: {
      categories: [
        {
          id: 'multimodal',
          label: '多模态',
          models: [
            {
              id: 'gemini-2-flash-mm',
              model: 'gemini-2.0-flash',
              label: 'Gemini 2.0 Flash',
              description: '文本、识图、文件与多模态输出',
              tags: [{ text: '多模态', variant: 'featured' }],
            },
            { id: 'gemini-2-5-pro-mm', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          ],
        },
      ],
    },
  },
  minimax: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            langModel('minimax-m2.7', 'MiniMax M2.7', MINIMAX_BASE, {
              tags: [{ text: '最新', variant: 'featured' }],
            }),
          ],
        },
      ],
    },
  },
  moonshot: {
    chat: {
      categories: [
        {
          id: 'language',
          label: '语言对话',
          models: [
            langModel('kimi-k2.6', 'Kimi K2.6', MOONSHOT_BASE, {
              tags: [{ text: '最新', variant: 'featured' }],
            }),
          ],
        },
      ],
    },
  },
}

// bytedance 复用 doubao 的 chat/image/video（需在 doubao 定义之后赋值）
MODEL_CATALOG.bytedance.chat = { categories: MODEL_CATALOG.doubao.chat.categories }
MODEL_CATALOG.bytedance.multimodal = { categories: MODEL_CATALOG.doubao.multimodal.categories }
MODEL_CATALOG.bytedance.image = { categories: MODEL_CATALOG.doubao.image.categories }
MODEL_CATALOG.bytedance.video = { categories: MODEL_CATALOG.doubao.video.categories }

/**
 * @param {string} provider
 * @param {string} capability
 * @returns {{ provider: string, capability: string, source: 'catalog'|'fallback', categories: CatalogCategory[] }}
 */
export function getModelCatalog(provider, capability) {
  const entry = MODEL_CATALOG[provider]?.[capability]
  if (entry?.categories?.length) {
    return {
      provider,
      capability,
      source: 'catalog',
      categories: entry.categories,
    }
  }

  return {
    provider,
    capability,
    source: 'fallback',
    categories: [],
  }
}

export const SUPPORTED_CAPABILITIES = ['chat', 'multimodal', 'image', 'video', 'world']
