export type Locale = 'zh' | 'en'

export const messages = {
  zh: {
    nav: {
      chat: '对话',
      create: '创作',
      world: '世界生成',
      models: '模型配置',
      skills: 'Agent 配置',
      knowledge: '知识库',
    },
    sidebar: {
      newChat: '新对话',
      external: '外链',
      arenaTitle: '模型竞技场',
      arenaSub: 'Chatbot Arena 排名',
    },
    history: {
      label: '对话历史',
      empty: '暂无历史，开始新对话吧',
      delete: '删除',
      messages: '条',
    },
    footer: {
      about: '关于',
      language: '语言',
      themeLight: '浅色模式',
      themeDark: '深色模式',
      aboutTitle: '关于 OneMini',
      aboutDesc: '个人 AI 创作与对话平台，支持多模型配置、技能编排与世界生成。',
      langZh: '简体中文',
      langEn: 'English',
    },
  },
  en: {
    nav: {
      chat: 'Chat',
      create: 'Create',
      world: 'World Gen',
      models: 'Models',
      skills: 'Agent Config',
      knowledge: 'Knowledge',
    },
    sidebar: {
      newChat: 'New chat',
      external: 'Links',
      arenaTitle: 'Model Arena',
      arenaSub: 'Chatbot Arena rankings',
    },
    history: {
      label: 'History',
      empty: 'No history yet — start a new chat',
      delete: 'Delete',
      messages: 'msgs',
    },
    footer: {
      about: 'About',
      language: 'Language',
      themeLight: 'Light mode',
      themeDark: 'Dark mode',
      aboutTitle: 'About OneMini',
      aboutDesc: 'Personal AI studio for chat, multi-model setup, skills, and world generation.',
      langZh: '简体中文',
      langEn: 'English',
    },
  },
} as const
