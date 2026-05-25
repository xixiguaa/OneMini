import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { sendChatStream, generateImage, generateVideo } from '../api/agent'
import { sendRagChatStream } from '../api/platform'
import { queryJob, submitJob } from '../api/hunyuan'
import { listPluginSkills } from '../config/skillRegistry'
import {
  runMultiAgentPipeline,
  shouldUseMultiAgent,
} from '../services/multiAgentOrchestrator'
import type {
  ChatMessage,
  CreateMode,
  ModelCapability,
  ModelConfig,
  SkillId,
  ViewId,
} from '../types/agent'
import {
  formatAttachmentsForPrompt,
  parseFile,
  revokeAttachmentPreviews,
  type ParsedAttachment,
} from '../utils/files'
import { composeSystemPrompt, truncateHistory } from '../utils/promptComposer'
import { resolveModelForChat } from '../utils/resolveModel'
import { randomUUID } from '../utils/uuid'
import { useAgentConfigStore } from './agentConfig'
import { useConversationsStore } from './conversations'
import { useSettingsStore } from './settings'
import { usePlatformStore } from './platform'
import { useWorldHistoryStore } from './worldHistory'

export const useAgentStore = defineStore('agent', () => {
  const settings = useSettingsStore()
  const agentConfig = useAgentConfigStore()
  const conversations = useConversationsStore()
  const platform = usePlatformStore()

  const currentView = ref<ViewId>('chat')
  const previousView = ref<ViewId>('chat')
  const createMode = ref<CreateMode>('image')
  const activeSkill = ref<SkillId>('chat')
  const inputText = ref('')
  const isProcessing = ref(false)
  const isStreaming = ref(false)
  const pendingAttachments = ref<ParsedAttachment[]>([])
  const selectedCreativeSkillId = ref<string | null>(null)
  const showSkillsMenu = ref(false)
  const showPrefsMenu = ref(false)

  const worldJobId = ref<string | null>(null)
  const worldStatus = ref<string | null>(null)
  const worldPreviewUrl = ref<string | null>(null)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const isIncognito = computed(() => conversations.isIncognito)

  const messages = computed({
    get: () => {
      if (conversations.isIncognito) return conversations.getIncognitoMessages()
      const id = conversations.activeId
      if (!id) return []
      return conversations.getMessages(id)
    },
    set: (val: ChatMessage[]) => {
      if (conversations.isIncognito) {
        conversations.setIncognitoMessages(val)
        return
      }
      const id = conversations.ensureActive()
      conversations.setMessages(id, val)
    },
  })

  const activeCreativeSkill = computed(() => {
    const id = selectedCreativeSkillId.value
    if (!id || !agentConfig.isPluginEnabled(id)) return undefined
    return listPluginSkills().find((s) => s.id === id)
  })

  watch(
    () => conversations.activeId,
    () => {
      stopWorldPolling()
      worldJobId.value = null
      worldStatus.value = null
      worldPreviewUrl.value = null
    },
  )

  function addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): string {
    const id = randomUUID()
    messages.value = [
      ...messages.value,
      { ...msg, id, timestamp: Date.now() },
    ]
    return id
  }

  function patchMessage(messageId: string, patch: Partial<ChatMessage>) {
    const list = conversations.isIncognito
      ? [...conversations.getIncognitoMessages()]
      : [...conversations.getMessages(conversations.ensureActive())]
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const next = [...list]
    next[idx] = { ...next[idx], ...patch }
    messages.value = next
  }

  async function addAttachments(files: FileList | File[]) {
    const list = Array.from(files)
    for (const file of list) {
      pendingAttachments.value.push(await parseFile(file))
    }
  }

  function removeAttachment(id: string) {
    const f = pendingAttachments.value.find((a) => a.id === id)
    if (f?.previewUrl) URL.revokeObjectURL(f.previewUrl)
    pendingAttachments.value = pendingAttachments.value.filter((a) => a.id !== id)
  }

  function clearAttachments() {
    revokeAttachmentPreviews(pendingAttachments.value)
    pendingAttachments.value = []
  }

  async function setImageFile(file: File) {
    await addAttachments([file])
  }

  function clearImage() {
    pendingAttachments.value = pendingAttachments.value.filter((a) => a.kind !== 'image')
  }

  function requireModelForSkill(skillId: SkillId): ModelConfig | null {
    const skill = settings.getSkill(skillId)
    let modelId = skill?.defaultModelId
    if (!modelId) {
      const cap = skillId as ModelCapability
      modelId = settings.modelsByCapability(cap).find((m) => m.enabled)?.id
    }
    if (!modelId) return null
    const model = settings.getModel(modelId)
    if (!model?.enabled) return null
    if (model.provider !== 'tencent' && !model.apiKey?.trim()) return null
    return model
  }

  function buildUserContent(text: string) {
    const fileCtx = formatAttachmentsForPrompt(pendingAttachments.value)
    const skill = activeCreativeSkill.value
    const prefix = skill ? `${skill.promptHint}\n` : ''
    return `${prefix}${text}${fileCtx}`.trim()
  }

  async function handleChat(content: string) {
    const skill = settings.getSkill('chat')
    const model =
      resolveModelForChat(agentConfig.skeleton, settings) ??
      requireModelForSkill('chat')
    if (!model) {
      throw new Error('请在「模型配置」填写对话模型 API Key，或在「Agent 配置 → 运行时」设置主模型')
    }

    const fullContent = buildUserContent(content)
    const systemPrompt = composeSystemPrompt(
      agentConfig.workspace,
      skill?.systemPrompt || '',
      undefined,
      agentConfig.bootstrapMaxChars,
    )
    const maxHist = agentConfig.skeleton.session.maxHistoryMessages
    const history = truncateHistory(
      messages.value
        .filter((m) => (m.type === 'text' || m.type === 'error') && m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      maxHist,
    )

    const assistantId = addMessage({
      role: 'assistant',
      type: 'text',
      content: '',
      skillId: 'chat',
    })

    const temperature = agentConfig.skeleton.models.temperature

    if (shouldUseMultiAgent(fullContent, agentConfig.skeleton.multiAgent)) {
      isStreaming.value = true
      try {
        patchMessage(assistantId, {
          content: '🦞 多智能体协作中：总指挥正在拆解任务…\n\n',
        })
        const result = await runMultiAgentPipeline({
          userPrompt: fullContent,
          workspace: agentConfig.workspace,
          skillPrompt: skill?.systemPrompt || '',
          multiAgent: agentConfig.skeleton.multiAgent,
          model,
          baseTemperature: temperature,
          bootstrapMaxChars: agentConfig.bootstrapMaxChars,
        })
        const sections = result.stepOutputs
          .map((s) => `### ${s.agentName}\n${s.content}`)
          .join('\n\n')
        patchMessage(assistantId, {
          content: `**${result.plan.summary}**\n\n${sections}\n\n---\n\n**最终答复**\n\n${result.finalAnswer}`,
        })
      } finally {
        isStreaming.value = false
      }
      return
    }

    isStreaming.value = true
    let accumulated = ''

    try {
      if (platform.ragEnabled) {
        const ragPrefix =
          '📚 知识库检索中…\n\n'
        patchMessage(assistantId, { content: ragPrefix })
        accumulated = ragPrefix

        await sendRagChatStream({
          question: fullContent,
          messages: history,
          model: model.model,
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          onContexts: (ctxs) => {
            if (!ctxs.length) return
            const refs = ctxs
              .slice(0, 3)
              .map((c, i) => `[${i + 1}] ${c.source} (${(c.score * 100).toFixed(0)}%)`)
              .join(' · ')
            const hint = `> 引用：${refs}\n\n`
            if (!accumulated.includes('引用：')) {
              accumulated = hint + accumulated.replace(ragPrefix, '')
              accumulated = ragPrefix + accumulated
              patchMessage(assistantId, { content: accumulated })
            }
          },
          onDelta: (chunk) => {
            accumulated += chunk
            patchMessage(assistantId, { content: accumulated })
          },
        })
      } else {
        await sendChatStream({
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: fullContent },
          ],
          model: model.model,
          provider: model.provider,
          baseUrl: model.baseUrl,
          apiKey: model.apiKey,
          temperature,
          onDelta: (chunk) => {
            accumulated += chunk
            patchMessage(assistantId, { content: accumulated })
          },
        })
      }
    } finally {
      isStreaming.value = false
    }
  }

  async function handleImageGen(content: string) {
    const model = requireModelForSkill('image')
    if (!model) {
      throw new Error('请在「模型配置」添加图片生成模型并填写 API Key，或在技能配置中绑定')
    }
    const prompt = buildUserContent(content)
    const imageAtt = pendingAttachments.value.find((a) => a.kind === 'image')
    const result = await generateImage({
      prompt,
      model: model.model,
      provider: model.provider,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      aspectRatio: settings.settings.generationPrefs.aspectRatio,
    })
    addMessage({
      role: 'assistant',
      type: 'image',
      content: result.message || '图片已生成',
      skillId: 'image',
      attachments: { url: result.url, previewUrl: result.url },
    })
    void imageAtt
  }

  async function handleVideoGen(content: string) {
    const model = requireModelForSkill('video')
    if (!model) throw new Error('请配置视频生成模型 API Key')
    const prompt = buildUserContent(content)
    const imageAtt = pendingAttachments.value.find((a) => a.base64)
    const result = await generateVideo({
      prompt,
      imageBase64: imageAtt?.base64,
      model: model.model,
      provider: model.provider,
      apiKey: model.apiKey,
    })
    addMessage({
      role: 'assistant',
      type: 'video',
      content: result.message || '视频任务已提交',
      skillId: 'video',
      attachments: { url: result.url, jobId: result.jobId, status: result.status },
    })
  }

  function stopWorldPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  async function pollWorldJob() {
    if (!worldJobId.value) return
    const worldModel = requireModelForSkill('world')
    const rapid = worldModel?.model === 'rapid'
    const result = await queryJob(worldJobId.value, rapid)
    worldStatus.value = result.Status

    const history = useWorldHistoryStore()
    const activeId = history.activeId
    if (activeId) {
      history.update(activeId, { status: result.Status, jobId: worldJobId.value })
    }

    if (result.Status === 'DONE') {
      stopWorldPolling()
      const preview = result.ResultFile3Ds?.[0]?.PreviewImageUrl ?? null
      worldPreviewUrl.value = preview
      const files = result.ResultFile3Ds?.map((f) => ({ type: f.Type, url: f.Url }))
      if (activeId) {
        history.update(activeId, { previewUrl: preview ?? undefined, status: 'DONE', files })
      }
    } else if (result.Status === 'FAIL') {
      stopWorldPolling()
      if (activeId) history.update(activeId, { status: 'FAIL' })
    }
  }

  async function handleWorldGen(content: string) {
    const worldModel = requireModelForSkill('world')
    if (!worldModel) {
      throw new Error(
        '请在「模型配置」右侧添加并启用 3D 世界生成模型，并在「技能配置」中绑定到世界生成。',
      )
    }
    const imageAtt = pendingAttachments.value.find((a) => a.base64)
    const rapid = worldModel.model === 'rapid'
    const res = await submitJob(
      imageAtt?.base64
        ? { imageBase64: imageAtt.base64, rapid }
        : { prompt: content, rapid },
    )
    worldJobId.value = res.JobId
    worldStatus.value = 'WAIT'
    stopWorldPolling()
    pollWorldJob()
    pollTimer = setInterval(pollWorldJob, 5000)
    return res
  }

  function attachmentMeta() {
    return pendingAttachments.value.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      previewUrl: a.previewUrl,
      size: a.size,
    }))
  }

  async function sendMessage(skillOverride?: SkillId) {
    const content = inputText.value.trim()
    if (!content && !pendingAttachments.value.length) return
    if (isProcessing.value) return

    conversations.ensureMessagingSession()
    const skill = skillOverride ?? activeSkill.value
    const skillCfg = settings.getSkill(skill)

    if (!skillCfg?.enabled) {
      addMessage({
        role: 'assistant',
        type: 'error',
        content: `技能「${skillCfg?.name || skill}」已禁用`,
        skillId: skill,
      })
      return
    }

    const sandbox = agentConfig.skeleton.sandbox
    if (
      sandbox.mode === 'strict' &&
      !agentConfig.isSkillAllowed(skill)
    ) {
      addMessage({
        role: 'assistant',
        type: 'error',
        content: `沙箱已禁止技能「${skill}」，请在 Agent 配置 → 骨架 中调整 allowedSkills`,
        skillId: skill,
      })
      return
    }
    isProcessing.value = true
    const displayContent = content || '（含附件）'

    addMessage({
      role: 'user',
      type: skill === 'chat' ? 'text' : skill,
      content: displayContent,
      skillId: skill,
      attachments: {
        previewUrl: pendingAttachments.value.find((a) => a.previewUrl)?.previewUrl,
        uploadedFiles: attachmentMeta(),
      },
    })

    inputText.value = ''

    try {
      switch (skill) {
        case 'chat':
          await handleChat(content)
          break
        case 'image':
          await handleImageGen(content)
          break
        case 'video':
          await handleVideoGen(content)
          break
        case 'world':
          await handleWorldGen(content)
          break
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '处理失败'
      addMessage({ role: 'assistant', type: 'error', content: msg, skillId: skill })
    } finally {
      isProcessing.value = false
      clearAttachments()
      selectedCreativeSkillId.value = null
    }
  }

  function skillFromCreateMode(mode: CreateMode): SkillId {
    if (mode === 'video') return 'video'
    if (mode === 'image') return 'image'
    return 'chat'
  }

  async function generateFromStudio() {
    const skill = skillFromCreateMode(createMode.value)
    currentView.value = 'chat'
    conversations.ensureMessagingSession()
    try {
      await sendMessage(skill)
    } finally {
      activeSkill.value = 'chat'
    }
  }

  function resetChatSurface() {
    stopWorldPolling()
    worldJobId.value = null
    worldStatus.value = null
    worldPreviewUrl.value = null
    inputText.value = ''
    clearAttachments()
    currentView.value = 'chat'
  }

  function newSession() {
    void conversations.createConversation().then(() => resetChatSurface())
  }

  function newIncognitoSession() {
    conversations.startIncognito()
    resetChatSurface()
  }

  function exitIncognito() {
    if (!conversations.isIncognito) return
    conversations.exitIncognito()
    conversations.ensureActive()
    resetChatSurface()
  }

  function selectConversation(id: string) {
    conversations.selectConversation(id)
    resetChatSurface()
  }

  function deleteConversation(id: string) {
    conversations.deleteConversation(id)
  }

  async function initConversations() {
    await conversations.hydrate()
    if (conversations.persistError.value && conversations.list.length === 0) {
      conversations.createConversationLocal()
      return
    }
    if (conversations.list.length === 0) {
      await conversations.createConversation()
    } else {
      conversations.ensureActive()
    }
  }

  function setCurrentView(id: ViewId) {
    if (id === 'world' && currentView.value !== 'world') {
      previousView.value = currentView.value
    }
    if (id === 'chat') {
      activeSkill.value = 'chat'
    }
    currentView.value = id
  }

  function exitWorld() {
    currentView.value = previousView.value
  }

  async function generateWorldFromStudio(
    content: string,
    opts?: { imageBase64?: string; previewUrl?: string },
  ) {
    if (isProcessing.value) return
    isProcessing.value = true
    clearAttachments()
    if (opts?.imageBase64) {
      pendingAttachments.value.push({
        id: randomUUID(),
        name: 'reference.jpg',
        mime: 'image/jpeg',
        size: 0,
        kind: 'image',
        previewUrl: opts.previewUrl ?? '',
        base64: opts.imageBase64,
      })
    }
    try {
      await handleWorldGen(content)
    } finally {
      isProcessing.value = false
      clearAttachments()
    }
  }

  return {
    currentView,
    previousView,
    setCurrentView,
    exitWorld,
    createMode,
    activeSkill,
    messages,
    inputText,
    isProcessing,
    isStreaming,
    pendingAttachments,
    selectedCreativeSkillId,
    activeCreativeSkill,
    showSkillsMenu,
    showPrefsMenu,
    worldJobId,
    worldStatus,
    worldPreviewUrl,
    addAttachments,
    removeAttachment,
    clearAttachments,
    setImageFile,
    clearImage,
    sendMessage,
    generateFromStudio,
    isIncognito,
    newSession,
    newIncognitoSession,
    exitIncognito,
    selectConversation,
    deleteConversation,
    initConversations,
    generateWorldFromStudio,
    stopWorldPolling,
  }
})
