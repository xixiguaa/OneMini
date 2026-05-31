import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { sendChatStream, generateImage, generateVideo } from '../api/agent'
import { sendRagChatStream } from '../api/platform'
import { sendWikiChatStream } from '../api/wiki'
import { queryJob, submitJob } from '../api/hunyuan'
import { listPluginSkills } from '../config/skillRegistry'
import {
  runMultiAgentPipeline,
  shouldUseMultiAgent,
} from '../services/multiAgentOrchestrator'
import type {
  AgentToolCallRecord,
  ChatMessage,
  CreateMode,
  MessageFeedback,
  ModelCapability,
  ModelConfig,
  SkillId,
  ViewId,
  WorkingMemoryState,
} from '../types/agent'
import {
  formatAttachmentsForPrompt,
  parseFile,
  revokeAttachmentPreviews,
  type ParsedAttachment,
} from '../utils/files'
import {
  attachNode,
  buildActivePath,
  buildBranchTimeline,
  buildDisplayTimeline,
  getSiblingVariants,
  mergeWorkingMemoryFromMessages,
  normalizeToGraph,
  resolveDefaultLeaf,
  resolveLeafForBranch,
} from '../services/conversationGraph'
import { searchEpisodicMemory } from '../api/conversations'
import {
  composeSystemPrompt,
  formatRuntimeModelHint,
  truncateHistory,
} from '../utils/promptComposer'
import {
  composeEpisodicMemoryBlock,
  composeWorkingMemoryBlock,
  formatEpisodicSnippet,
  parseStateUpdate,
  TOOL_AWARENESS_PROTOCOL,
  WORKING_MEMORY_PROTOCOL,
} from '../utils/workingMemory'
import { resolveChatBaseUrl } from '../config/providers'
import { resolveChatModel } from '../utils/resolveModel'
import { randomUUID } from '../utils/uuid'
import { resolveVideoDimensions } from '../utils/videoSize'
import { formatUserError } from '../utils/formatUserError'
import { useAgentConfigStore } from './agentConfig'
import { useConversationsStore } from './conversations'
import { useCreateHistoryStore } from './createHistory'
import type { CreateHistoryItem } from './createHistory'
import { useSettingsStore } from './settings'
import { usePlatformStore } from './platform'
import { useToastStore } from './toast'
import { useWorldHistoryStore } from './worldHistory'

function notifyError(err: unknown, fallback: string) {
  useToastStore().showError(formatUserError(err, fallback))
}

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
  type ProcessingScope = 'chat' | 'create' | 'world'
  const processingScope = ref<ProcessingScope | null>(null)
  const isProcessing = computed(() => processingScope.value !== null)
  const isChatProcessing = computed(() => processingScope.value === 'chat')
  const isCreateProcessing = computed(() => processingScope.value === 'create')
  const isWorldProcessing = computed(() => processingScope.value === 'world')
  const isStreaming = ref(false)
  const pendingAttachments = ref<ParsedAttachment[]>([])
  const selectedCreativeSkillId = ref<string | null>(null)
  const showSkillsMenu = ref(false)
  const showPrefsMenu = ref(false)

  const worldJobId = ref<string | null>(null)
  const worldStatus = ref<string | null>(null)
  const worldPreviewUrl = ref<string | null>(null)

  const imageEditSessionId = ref<string | null>(null)
  const imageEditActiveId = ref<string | null>(null)
  const imageEditProcessingSessionId = ref<string | null>(null)
  const imageEditInput = ref('')

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const isIncognito = computed(() => conversations.isIncognito)

  function getAllGraphMessages(): ChatMessage[] {
    if (conversations.isIncognito) return conversations.getIncognitoMessages()
    const id = conversations.activeId
    if (!id) return []
    return conversations.getMessages(id)
  }

  function setAllGraphMessages(val: ChatMessage[]) {
    const normalized = normalizeToGraph(val)
    if (conversations.isIncognito) {
      conversations.setIncognitoMessages(normalized)
      return
    }
    const id = conversations.activeId
    if (!id) return
    conversations.setMessages(id, normalized)
  }

  function getActiveLeafId(): string | null {
    if (conversations.isIncognito) {
      return conversations.getActiveLeafId('incognito')
    }
    const id = conversations.activeId
    if (!id) return null
    return conversations.getActiveLeafId(id)
  }

  function setActiveLeafId(leafId: string | null) {
    if (conversations.isIncognito) {
      conversations.setActiveLeafId('incognito', leafId)
      return
    }
    const id = conversations.activeId
    if (!id) return
    conversations.setActiveLeafId(id, leafId)
  }

  /** UI：展示全部消息（含重新生成的历史回答），按时间排序 */
  const messages = computed(() => buildDisplayTimeline(getAllGraphMessages()))

  const activePathIds = computed(() => {
    const all = getAllGraphMessages()
    const leaf = getActiveLeafId() ?? resolveDefaultLeaf(all)?.id ?? null
    return new Set(buildActivePath(all, leaf).map((m) => m.id))
  })

  const branchTimeline = computed(() =>
    buildBranchTimeline(getAllGraphMessages(), getActiveLeafId()),
  )

  const workingMemory = computed((): WorkingMemoryState | undefined => {
    if (conversations.isIncognito) {
      return conversations.getWorkingMemory('incognito')
    }
    const id = conversations.activeId
    const fromConv = id ? conversations.getWorkingMemory(id) : undefined
    return (
      mergeWorkingMemoryFromMessages(getAllGraphMessages(), fromConv) ?? fromConv
    )
  })

  const activeCreativeSkill = computed(() => {
    const id = selectedCreativeSkillId.value
    if (!id || !agentConfig.isPluginEnabled(id)) return undefined
    return listPluginSkills().find((s) => s.id === id)
  })

  const imageEditOpen = computed(() => imageEditSessionId.value != null)

  const imageEditVersions = computed(() => {
    const sid = imageEditSessionId.value
    if (!sid) return [] as CreateHistoryItem[]
    return useCreateHistoryStore().sessionItems(sid)
  })

  const imageEditActive = computed(() => {
    const versions = imageEditVersions.value
    if (!versions.length) return null
    const picked = versions.find((v) => v.id === imageEditActiveId.value)
    if (picked) return picked
    for (let i = versions.length - 1; i >= 0; i--) {
      if (versions[i].status === 'DONE') return versions[i]
    }
    return versions[versions.length - 1]
  })

  const imageEditLoading = computed(() => imageEditActive.value?.status === 'RUNNING')

  watch(
    () => conversations.activeId,
    () => {
      stopWorldPolling()
      worldJobId.value = null
      worldStatus.value = null
      worldPreviewUrl.value = null
    },
  )

  function addMessage(
    msg: Omit<ChatMessage, 'id' | 'timestamp'>,
    opts?: { parentId?: string | null; activate?: boolean },
  ): string {
    const all = getAllGraphMessages()
    const parentId =
      opts && 'parentId' in opts ? (opts.parentId ?? null) : getActiveLeafId()
    const { messages: next, nodeId } = attachNode(
      all,
      { ...msg, timestamp: Date.now() } as ChatMessage,
      parentId,
    )
    setAllGraphMessages(next)
    if (opts?.activate !== false) setActiveLeafId(nodeId)
    return nodeId
  }

  function patchMessage(messageId: string, patch: Partial<ChatMessage>) {
    const list = [...getAllGraphMessages()]
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const next = [...list]
    const prev = next[idx]
    if (patch.metadata && prev.metadata) {
      patch = { ...patch, metadata: { ...prev.metadata, ...patch.metadata } }
    }
    next[idx] = { ...prev, ...patch }
    setAllGraphMessages(next)
    if (patch.metadata?.workingMemory) {
      const convId = conversations.isIncognito ? 'incognito' : conversations.activeId
      if (convId) conversations.setWorkingMemory(convId, patch.metadata.workingMemory)
    }
  }

  function finalizeAssistantContent(messageId: string, raw: string) {
    const { displayContent, workingMemory: wm } = parseStateUpdate(raw)
    patchMessage(messageId, {
      content: displayContent || raw,
      metadata: wm ? { workingMemory: wm } : undefined,
    })
  }

  function trackToolCall(
    messageId: string,
    tool: AgentToolCallRecord,
  ) {
    const msg = getAllGraphMessages().find((m) => m.id === messageId)
    const prev = msg?.metadata?.toolCalls ?? []
    const merged = [...prev.filter((t) => t.id !== tool.id), tool]
    patchMessage(messageId, { metadata: { toolCalls: merged } })
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
    if (model.provider !== 'tencent' && !model.secretConfigured) return null
    return model
  }

  function buildUserContent(text: string) {
    const fileCtx = formatAttachmentsForPrompt(pendingAttachments.value)
    const skill = activeCreativeSkill.value
    const prefix = skill ? `${skill.promptHint}\n` : ''
    return `${prefix}${text}${fileCtx}`.trim()
  }

  async function handleChat(content: string, parentUserId: string) {
    const skill = settings.getSkill('chat')
    const resolved = resolveChatModel(agentConfig.skeleton, settings)
    if (!resolved.ok) {
      throw new Error(resolved.error)
    }
    const model = resolved.model

    const fullContent = buildUserContent(content)
    const runtimeHint = formatRuntimeModelHint(model)

    let episodicSnippets: string[] = []
    if (!conversations.isIncognito) {
      try {
        const hits = await searchEpisodicMemory(fullContent, 5)
        const convId = conversations.activeId
        episodicSnippets = hits
          .filter((h) => h.conversationId !== convId && (h.content || '').trim())
          .slice(0, 3)
          .map(formatEpisodicSnippet)
      } catch {
        /* Milvus 不可用时跳过情节记忆 */
      }
    }

    const wmBlock = composeWorkingMemoryBlock(workingMemory.value)
    const systemPrompt = [
      composeSystemPrompt(
        agentConfig.workspace,
        skill?.systemPrompt || '',
        undefined,
        agentConfig.bootstrapMaxChars,
      ),
      WORKING_MEMORY_PROTOCOL,
      TOOL_AWARENESS_PROTOCOL,
      wmBlock,
      composeEpisodicMemoryBlock(episodicSnippets),
      runtimeHint,
    ]
      .filter(Boolean)
      .join('\n\n')

    const maxHist = agentConfig.skeleton.session.maxHistoryMessages
    const path = buildActivePath(getAllGraphMessages(), getActiveLeafId())
    const history = truncateHistory(
      path
        .filter((m) => m.id !== parentUserId)
        .filter((m) => (m.type === 'text' || m.type === 'error') && m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
      maxHist,
    )

    let assistantId: string | null = null
    const ensureAssistantMessage = () => {
      if (!assistantId) {
        assistantId = addMessage(
          {
            role: 'assistant',
            type: 'text',
            content: '',
            skillId: 'chat',
          },
          { parentId: parentUserId },
        )
      }
      return assistantId
    }

    const temperature = agentConfig.skeleton.models.temperature

    if (shouldUseMultiAgent(fullContent, agentConfig.skeleton.multiAgent)) {
      isStreaming.value = true
      try {
        const aid = ensureAssistantMessage()
        trackToolCall(aid, {
          id: 'multi-agent',
          name: '多智能体协作',
          status: 'running',
        })
        patchMessage(aid, {
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
        const raw = `**${result.plan.summary}**\n\n${sections}\n\n---\n\n**最终答复**\n\n${result.finalAnswer}`
        trackToolCall(aid, {
          id: 'multi-agent',
          name: '多智能体协作',
          status: 'done',
          summary: result.plan.summary,
        })
        finalizeAssistantContent(aid, raw)
      } finally {
        isStreaming.value = false
      }
      return
    }

    isStreaming.value = true
    let accumulated = ''

    try {
      if (platform.knowledgeChatMode === 'rag') {
        const aid = ensureAssistantMessage()
        trackToolCall(aid, { id: 'rag', name: 'Milvus RAG', status: 'running' })
        const ragPrefix = '📚 Milvus RAG 检索中…\n\n'
        patchMessage(aid, { content: ragPrefix })
        accumulated = ragPrefix

        await sendRagChatStream({
          question: fullContent,
          messages: history,
          systemExtra: systemPrompt,
          model: model.model,
          provider: model.provider,
          modelConfigId: model.id,
          baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
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
              patchMessage(aid, { content: accumulated })
            }
          },
          onDelta: (chunk) => {
            accumulated += chunk
            patchMessage(aid, { content: accumulated })
          },
        })
        trackToolCall(aid, { id: 'rag', name: 'Milvus RAG', status: 'done' })
        finalizeAssistantContent(aid, accumulated)
      } else if (platform.knowledgeChatMode === 'wiki') {
        const aid = ensureAssistantMessage()
        trackToolCall(aid, { id: 'wiki', name: 'LLM-Wiki', status: 'running' })
        const wikiPrefix = '🕸️ LLM-Wiki 检索中…\n\n'
        patchMessage(aid, { content: wikiPrefix })
        accumulated = wikiPrefix

        await sendWikiChatStream({
          question: fullContent,
          messages: history,
          systemExtra: systemPrompt,
          model: model.model,
          provider: model.provider,
          modelConfigId: model.id,
          baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
          onContexts: (ctxs) => {
            if (!ctxs.length) return
            const refs = ctxs
              .slice(0, 3)
              .map((c, i) => `[${i + 1}] ${c.title} (${(c.score * 100).toFixed(0)}%)`)
              .join(' · ')
            const hint = `> Wiki 页：${refs}\n\n`
            if (!accumulated.includes('Wiki 页：')) {
              accumulated = hint + accumulated.replace(wikiPrefix, '')
              accumulated = wikiPrefix + accumulated
              patchMessage(aid, { content: accumulated })
            }
          },
          onDelta: (chunk) => {
            accumulated += chunk
            patchMessage(aid, { content: accumulated })
          },
        })
        trackToolCall(aid, { id: 'wiki', name: 'LLM-Wiki', status: 'done' })
        finalizeAssistantContent(aid, accumulated)
      } else {
        await sendChatStream({
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: fullContent },
          ],
          model: model.model,
          provider: model.provider,
          baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
          modelConfigId: model.id,
          temperature,
          onDelta: (chunk) => {
            accumulated += chunk
            patchMessage(ensureAssistantMessage(), { content: accumulated })
          },
        })
        if (assistantId) finalizeAssistantContent(assistantId, accumulated)
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
      modelConfigId: model.id,
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

  function videoGenParams(prompt: string, imageBase64?: string, model?: ModelConfig) {
    const prefs = settings.settings.generationPrefs
    const { width, height } = resolveVideoDimensions(prefs.videoResolution, prefs.videoAspectRatio)
    return {
      prompt,
      imageBase64,
      model: model?.model,
      provider: model?.provider,
      modelConfigId: model?.id,
      aspectRatio: prefs.videoAspectRatio,
      resolution: prefs.videoResolution,
      width,
      height,
    }
  }

  async function handleVideoGen(content: string) {
    const model = requireModelForSkill('video')
    if (!model) throw new Error('请配置视频生成模型 API Key')
    const prompt = buildUserContent(content)
    const imageAtt = pendingAttachments.value.find((a) => a.base64)
    const result = await generateVideo(
      videoGenParams(prompt, imageAtt?.base64, model),
    )
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
    if (processingScope.value) return

    const skill = skillOverride ?? activeSkill.value
    const displayContent = content || '（含附件）'
    const savedContent = content

    if (!conversations.isIncognito && !conversations.hydrated) {
      await conversations.hydrate()
    }
    if (!conversations.isIncognito) {
      conversations.ensureLocalSession()
    }

    const userMsgId = addMessage({
      role: 'user',
      type: skill === 'chat' ? 'text' : skill,
      content: displayContent,
      skillId: skill,
      metadata: { action: 'send' },
      attachments: {
        previewUrl: pendingAttachments.value.find((a) => a.previewUrl)?.previewUrl,
        uploadedFiles: attachmentMeta(),
      },
    })

    if (!conversations.isIncognito && conversations.activeId) {
      conversations.updateTitleFromText(conversations.activeId, displayContent)
    }

    inputText.value = ''
    processingScope.value = 'chat'
    let enteredMainFlow = false

    try {
      void conversations.syncActiveConversation()

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

      enteredMainFlow = true
      conversations.setPersistPaused(true)

      try {
        switch (skill) {
          case 'chat':
            await handleChat(savedContent, userMsgId)
            break
          case 'image':
            await handleImageGen(savedContent)
            break
          case 'video':
            await handleVideoGen(savedContent)
            break
          case 'world':
            await handleWorldGen(savedContent)
            break
        }
      } catch (err: unknown) {
        const msg = formatUserError(err, '处理失败')
        addMessage({ role: 'assistant', type: 'error', content: msg, skillId: skill })
        if (skill === 'image' || skill === 'video') {
          notifyError(err, skill === 'image' ? '图片生成失败' : '视频生成失败')
        }
      }
    } finally {
      processingScope.value = null
      if (enteredMainFlow) {
        conversations.setPersistPaused(false)
        if (!conversations.isIncognito && conversations.activeId) {
          try {
            await conversations.syncActiveConversation()
            await conversations.flushPersist(conversations.activeId)
          } catch {
            /* flushPersist 已写入 persistError */
          }
        }
        clearAttachments()
        selectedCreativeSkillId.value = null
      }
    }
  }

  async function regenerateAssistant(messageId: string) {
    if (processingScope.value) return

    const all = getAllGraphMessages()
    const assistant = all.find((m) => m.id === messageId)
    if (!assistant || assistant.role !== 'assistant' || assistant.type !== 'text') return

    const userMsg = assistant.parentId
      ? all.find((m) => m.id === assistant.parentId)
      : undefined
    if (!userMsg || userMsg.role !== 'user') return

    const text = userMsg.content === '（含附件）' ? '' : userMsg.content
    if (!text.trim() && !userMsg.attachments?.uploadedFiles?.length) return

    if (!conversations.isIncognito && !conversations.hydrated) {
      await conversations.hydrate()
    }
    if (!conversations.isIncognito) {
      conversations.ensureLocalSession()
    }

    setActiveLeafId(userMsg.id)

    processingScope.value = 'chat'
    let enteredMainFlow = false
    let branchAssistantId: string | null = null

    try {
      void conversations.syncActiveConversation()

      const skillCfg = settings.getSkill('chat')
      if (!skillCfg?.enabled) {
        branchAssistantId = addMessage(
          {
            role: 'assistant',
            type: 'error',
            content: `技能「${skillCfg?.name || 'chat'}」已禁用`,
            skillId: 'chat',
          },
          { parentId: userMsg.id },
        )
        return
      }

      const sandbox = agentConfig.skeleton.sandbox
      if (sandbox.mode === 'strict' && !agentConfig.isSkillAllowed('chat')) {
        branchAssistantId = addMessage(
          {
            role: 'assistant',
            type: 'error',
            content: '沙箱已禁止技能「chat」，请在 Agent 配置 → 骨架 中调整 allowedSkills',
            skillId: 'chat',
          },
          { parentId: userMsg.id },
        )
        return
      }

      enteredMainFlow = true
      conversations.setPersistPaused(true)

      const regenHint =
        `[系统指令·用户不可见] 这是对问题「${userMsg.content.slice(0, 120)}」的重新生成请求（分支 v${getSiblingVariants(all, userMsg.id).filter((m) => m.role === 'assistant').length + 1}）。请给出不同角度的回答，避免重复上一版开头结构。\n\n`

      try {
        await handleChat(regenHint + text, userMsg.id)
      } catch (err: unknown) {
        const msg = formatUserError(err, '处理失败')
        addMessage(
          { role: 'assistant', type: 'error', content: msg, skillId: 'chat', metadata: { action: 'regenerate', targetAssistantId: messageId } },
          { parentId: userMsg.id },
        )
      }
    } finally {
      processingScope.value = null
      if (enteredMainFlow) {
        conversations.setPersistPaused(false)
        if (!conversations.isIncognito && conversations.activeId) {
          try {
            await conversations.syncActiveConversation()
            await conversations.flushPersist(conversations.activeId)
          } catch {
            /* flushPersist 已写入 persistError */
          }
        }
      }
      void branchAssistantId
    }
  }

  function getMessageBranchVariants(messageId: string): ChatMessage[] {
    return getSiblingVariants(getAllGraphMessages(), messageId)
  }

  function switchMessageBranch(variantMessageId: string) {
    const leaf = resolveLeafForBranch(getAllGraphMessages(), variantMessageId)
    setActiveLeafId(leaf)
  }

  function applyMessageFeedback(messageId: string, feedback: MessageFeedback | null) {
    const list = [...getAllGraphMessages()]
    const idx = list.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const next = { ...list[idx] }
    if (feedback) next.feedback = feedback
    else delete next.feedback
    list[idx] = next
    setAllGraphMessages(list)
  }

  async function setMessageFeedback(messageId: string, feedback: MessageFeedback) {
    const msg = messages.value.find((m) => m.id === messageId)
    if (!msg) return

    const nextFeedback: MessageFeedback | null = msg.feedback === feedback ? null : feedback

    if (conversations.isIncognito) {
      applyMessageFeedback(messageId, nextFeedback)
      return
    }

    const convId = conversations.activeId
    if (!convId) return

    try {
      await conversations.updateMessageFeedback(convId, messageId, nextFeedback)
    } catch {
      useToastStore().showError('保存反馈失败')
    }
  }

  function skillFromCreateMode(mode: CreateMode): SkillId {
    if (mode === 'video') return 'video'
    if (mode === 'image') return 'image'
    return 'chat'
  }

  async function generateCreateMedia(skill: 'image' | 'video') {
    const content = inputText.value.trim()
    if (!content && !pendingAttachments.value.length) return
    if (processingScope.value) return

    processingScope.value = 'create'
    const displayContent = content || '（含附件）'
    const prompt = buildUserContent(content)
    const createHistory = useCreateHistoryStore()
    const model = requireModelForSkill(skill)

    const entry = createHistory.add({
      prompt: displayContent,
      type: skill,
      status: 'RUNNING',
      modelId: model?.id,
      modelName: model?.name,
    })

    inputText.value = ''

    try {
      if (!model) {
        throw new Error(
          skill === 'image'
            ? '请在「模型配置」添加图片生成模型并填写 API Key，或在技能配置中绑定'
            : '请配置视频生成模型 API Key',
        )
      }

      if (skill === 'image') {
        const result = await generateImage({
          prompt,
          model: model.model,
          provider: model.provider,
          modelConfigId: model.id,
          baseUrl: model.baseUrl,
          aspectRatio: settings.settings.generationPrefs.aspectRatio,
        })
        await createHistory.complete(entry.id, {
          url: result.url,
          previewUrl: result.url,
          status: 'DONE',
          sessionId: entry.id,
        })
      } else {
        const imageAtt = pendingAttachments.value.find((a) => a.base64)
        const result = await generateVideo(
          videoGenParams(prompt, imageAtt?.base64, model),
        )
        await createHistory.complete(entry.id, {
          url: result.url,
          previewUrl: result.url,
          jobId: result.jobId,
          status: 'DONE',
        })
      }
    } catch (err: unknown) {
      await createHistory.discard(entry.id)
      notifyError(err, skill === 'image' ? '图片生成失败' : '视频生成失败')
      throw err
    } finally {
      processingScope.value = null
      clearAttachments()
      selectedCreativeSkillId.value = null
    }
  }

  function openImageEdit(item: CreateHistoryItem) {
    if (item.type !== 'image' || item.status !== 'DONE' || !item.url) return
    const sessionId = item.sessionId || item.id
    imageEditSessionId.value = sessionId
    imageEditActiveId.value = item.id
    imageEditInput.value = ''
    createMode.value = 'image'
  }

  function closeImageEdit() {
    imageEditSessionId.value = null
    imageEditActiveId.value = null
    imageEditInput.value = ''
  }

  function selectImageEditVersion(id: string) {
    imageEditActiveId.value = id
  }

  async function deleteGallerySession(sessionId: string) {
    const createHistory = useCreateHistoryStore()
    if (imageEditSessionId.value === sessionId) {
      closeImageEdit()
    }
    await createHistory.removeSession(sessionId)
  }

  async function deleteImageEditSession() {
    const sessionId = imageEditSessionId.value
    if (!sessionId) return
    await deleteGallerySession(sessionId)
  }

  async function deleteImageEditVersion(versionId: string) {
    const createHistory = useCreateHistoryStore()
    const sessionId = imageEditSessionId.value
    if (!sessionId || !createHistory.isVersionLeaf(versionId)) return false

    const wasActive = imageEditActiveId.value === versionId
    const ok = await createHistory.removeVersion(versionId)
    if (!ok) return false

    const remaining = createHistory.sessionItems(sessionId)
    if (!remaining.length) {
      closeImageEdit()
      return true
    }

    if (wasActive) {
      const next =
        [...remaining].reverse().find((v) => v.status === 'DONE') ??
        remaining[remaining.length - 1]
      imageEditActiveId.value = next.id
    }
    return true
  }

  function canDeleteImageEditVersion(versionId: string) {
    return useCreateHistoryStore().isVersionLeaf(versionId)
  }

  async function submitImageEdit() {
    const prompt = imageEditInput.value.trim()
    const active = imageEditActive.value
    const sessionId = imageEditSessionId.value
    if (!prompt || !active?.url || !sessionId) return

    const createHistory = useCreateHistoryStore()
    if (createHistory.sessionItems(sessionId).some((v) => v.status === 'RUNNING')) return
    if (imageEditProcessingSessionId.value === sessionId) return

    imageEditProcessingSessionId.value = sessionId
    const model =
      (active.modelId ? settings.getModel(active.modelId) : null) ??
      requireModelForSkill('image')

    const entry = createHistory.add({
      prompt,
      type: 'image',
      status: 'RUNNING',
      parentId: active.id,
      sessionId,
      modelId: model?.id,
      modelName: model?.name,
    })
    imageEditActiveId.value = entry.id
    imageEditInput.value = ''

    try {
      if (!model) throw new Error('请在「模型配置」添加图片生成模型并填写 API Key')
      const result = await generateImage({
        prompt,
        imageUrl: active.url,
        model: model.model,
        provider: model.provider,
        modelConfigId: model.id,
        baseUrl: model.baseUrl,
        aspectRatio: settings.settings.generationPrefs.aspectRatio,
      })
      await createHistory.complete(entry.id, {
        url: result.url,
        previewUrl: result.url,
        status: 'DONE',
      })
    } catch (err: unknown) {
      await createHistory.discard(entry.id)
      imageEditActiveId.value = active.id
      notifyError(err, '图片编辑失败')
      console.error('[image-edit]', err)
    } finally {
      imageEditProcessingSessionId.value = null
    }
  }

  async function generateFromStudio() {
    const skill = skillFromCreateMode(createMode.value)
    if (skill === 'chat') {
      currentView.value = 'chat'
      await conversations.ensureMessagingSession()
      try {
        await sendMessage('chat')
      } finally {
        activeSkill.value = 'chat'
      }
      return
    }

    if (skill !== 'image' && skill !== 'video') return

    try {
      await generateCreateMedia(skill)
    } catch (err: unknown) {
      console.error('[create]', err)
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
    conversations.startDraftSession()
    resetChatSurface()
  }

  function newIncognitoSession() {
    conversations.startIncognito()
    resetChatSurface()
  }

  async function exitIncognito() {
    if (!conversations.isIncognito) return
    conversations.exitIncognito()
    conversations.ensureActive()
    resetChatSurface()
  }

  function selectConversation(id: string) {
    conversations.selectConversation(id)
    resetChatSurface()
  }

  async function deleteConversation(id: string) {
    await conversations.deleteConversation(id)
  }

  async function initConversations() {
    await conversations.hydrate()
    const createHistory = useCreateHistoryStore()
    await createHistory.hydrate()
    await createHistory.migrateFromConversations(conversations.list)
    conversations.ensureActive()
  }

  async function bootstrapAfterLogin() {
    await initConversations()
  }

  function setCurrentView(id: ViewId) {
    if (id === 'world' && currentView.value !== 'world') {
      previousView.value = currentView.value
    }
    if (id === 'chat') {
      activeSkill.value = 'chat'
    }
    currentView.value = id
    if (id === 'create') {
      void useCreateHistoryStore().hydrate(true)
    }
  }

  function exitWorld() {
    currentView.value = previousView.value
  }

  async function generateWorldFromStudio(
    content: string,
    opts?: { imageBase64?: string; previewUrl?: string },
  ) {
    if (processingScope.value) return
    processingScope.value = 'world'
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
      processingScope.value = null
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
    activePathIds,
    branchTimeline,
    workingMemory,
    inputText,
    isProcessing,
    isChatProcessing,
    isCreateProcessing,
    isWorldProcessing,
    isStreaming,
    pendingAttachments,
    selectedCreativeSkillId,
    activeCreativeSkill,
    showSkillsMenu,
    showPrefsMenu,
    worldJobId,
    worldStatus,
    worldPreviewUrl,
    imageEditOpen,
    imageEditVersions,
    imageEditActive,
    imageEditLoading,
    imageEditInput,
    openImageEdit,
    closeImageEdit,
    selectImageEditVersion,
    deleteGallerySession,
    deleteImageEditSession,
    deleteImageEditVersion,
    canDeleteImageEditVersion,
    submitImageEdit,
    addAttachments,
    removeAttachment,
    clearAttachments,
    setImageFile,
    clearImage,
    sendMessage,
    regenerateAssistant,
    getMessageBranchVariants,
    switchMessageBranch,
    setMessageFeedback,
    generateFromStudio,
    isIncognito,
    newSession,
    newIncognitoSession,
    exitIncognito,
    selectConversation,
    deleteConversation,
    initConversations,
    bootstrapAfterLogin,
    generateWorldFromStudio,
    stopWorldPolling,
  }
})
