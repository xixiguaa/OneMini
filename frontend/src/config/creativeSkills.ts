/** 即梦风格创作技能（图片/视频） */
export interface CreativeSkill {
  id: string
  name: string
  description: string
  promptHint: string
  modes: ('image' | 'video')[]
}

export const CREATIVE_SKILLS: CreativeSkill[] = [
  {
    id: 'short-film',
    name: '剧情短片',
    description: '自动生成故事大纲、分镜脚本并产出短片',
    promptHint: '请根据以下创意生成短片分镜与画面描述：',
    modes: ['video'],
  },
  {
    id: 'ecommerce-set',
    name: '电商套图',
    description: '风格统一的商品全套视觉素材',
    promptHint: '请为以下商品生成统一风格的电商视觉套图：',
    modes: ['image'],
  },
  {
    id: 'poster',
    name: '海报设计',
    description: '更有创意的海报，擅长营销场景',
    promptHint: '请设计一张营销海报，要求：',
    modes: ['image'],
  },
  {
    id: 'brand',
    name: '品牌设计',
    description: '根据公司与业务生成品牌视觉',
    promptHint: '请为以下品牌生成视觉方案：',
    modes: ['image'],
  },
  {
    id: 'cinematic',
    name: '电影感镜头',
    description: '一镜到底、电影级运镜与光影',
    promptHint: '请用电影感镜头语言描述以下场景：',
    modes: ['video'],
  },
]
