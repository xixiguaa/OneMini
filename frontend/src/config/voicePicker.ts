export type VoiceTab = 'all' | 'mine' | 'favorite'

export type VoiceFilterKey = 'gender' | 'age' | 'language' | 'trait'

export interface VoiceFilterOption {
  id: string
  label: string
}

export interface VoiceItem {
  id: string
  name: string
  tag?: string
  multiEmotion?: boolean
}

export const VOICE_TABS: { id: VoiceTab; label: string }[] = [
  { id: 'all', label: '全部音色' },
  { id: 'mine', label: '我的音色' },
  { id: 'favorite', label: '收藏' },
]

export const VOICE_FILTERS: Record<VoiceFilterKey, { label: string; options: VoiceFilterOption[] }> = {
  gender: {
    label: '性别',
    options: [
      { id: 'all', label: '全部' },
      { id: 'female', label: '女声' },
      { id: 'male', label: '男声' },
    ],
  },
  age: {
    label: '年龄',
    options: [
      { id: 'all', label: '全部' },
      { id: 'child', label: '幼儿' },
      { id: 'teen', label: '少年' },
      { id: 'youth', label: '青年' },
      { id: 'middle', label: '中年' },
      { id: 'elder', label: '老年' },
    ],
  },
  language: {
    label: '语言',
    options: [
      { id: 'all', label: '全部' },
      { id: 'mandarin', label: '普通话' },
      { id: 'dialect', label: '中文方言' },
      { id: 'english', label: '英文' },
    ],
  },
  trait: {
    label: '声音特点',
    options: [
      { id: 'all', label: '全部' },
      { id: 'narration', label: '适合旁白' },
      { id: 'scene', label: '情景演绎' },
      { id: 'multi', label: '多情感' },
      { id: 'broadcast', label: '适合口播' },
      { id: 'ip', label: '知名 IP' },
    ],
  },
}

export const VOICE_EMOTIONS = [
  '中性',
  '吆喝',
  '愤怒',
  '舒缓',
  '开心',
  '憎恨',
  '悲伤',
  '惊讶',
] as const

export type VoiceEmotion = (typeof VOICE_EMOTIONS)[number]

export const DEFAULT_VOICES: VoiceItem[] = [
  { id: 'v1', name: '直爽女大', tag: '多情感', multiEmotion: true },
  { id: 'v2', name: '低音炮', tag: '多情感', multiEmotion: true },
  { id: 'v3', name: '英气飒姐', tag: '多情感', multiEmotion: true },
  { id: 'v4', name: '阳光小男孩', tag: '多情感', multiEmotion: true },
  { id: 'v5', name: '纯净女声', tag: '多情感', multiEmotion: true },
  { id: 'v6', name: '温柔软妹', tag: '多情感', multiEmotion: true },
  { id: 'v7', name: '黛玉', tag: '多情感', multiEmotion: true },
  { id: 'v8', name: '明媚女声', tag: '多情感', multiEmotion: true },
  { id: 'v9', name: '含蓄女声', tag: '多情感', multiEmotion: true },
  { id: 'v10', name: '紫薇', tag: '多情感', multiEmotion: true },
  { id: 'v11', name: '猴哥', tag: '多情感', multiEmotion: true },
  { id: 'v12', name: '蜡笔小新', tag: '多情感', multiEmotion: true },
  { id: 'v13', name: '八戒Pro', tag: '多情感', multiEmotion: true },
  { id: 'v14', name: '动漫海绵', tag: '多情感', multiEmotion: true },
  { id: 'v15', name: '聪明胖仔', tag: '多情感', multiEmotion: true },
  { id: 'v16', name: '糯音女孩', tag: '多情感', multiEmotion: true },
  { id: 'v17', name: '憨萌福娃', tag: '多情感', multiEmotion: true },
  { id: 'v18', name: 'TVB女声', tag: '多情感', multiEmotion: true },
  { id: 'v19', name: '爽快小哥', tag: '多情感', multiEmotion: true },
]
