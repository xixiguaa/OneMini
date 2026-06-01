export type DigitalHumanMode = 'master' | 'fast' | 'basic'

export interface DigitalHumanModeOption {
  id: DigitalHumanMode
  label: string
  desc: string
  /** 标题旁是否显示强调图标（如大师模式） */
  premium?: boolean
}

export const DIGITAL_HUMAN_ENGINE = 'OmniHuman 1.5'

export const DIGITAL_HUMAN_MODES: DigitalHumanModeOption[] = [
  { id: 'master', label: '大师模式', desc: '电影级的表演效果', premium: true },
  { id: 'fast', label: '快速模式', desc: '更低成本，快速生成' },
  { id: 'basic', label: '基础模式', desc: '仅仅修改人物口型。适合演讲、对白' },
]

export function digitalHumanModeLabel(id: DigitalHumanMode) {
  return DIGITAL_HUMAN_MODES.find((m) => m.id === id)?.label ?? '快速模式'
}
