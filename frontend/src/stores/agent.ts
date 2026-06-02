import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { sendChatStream, generateImage, generateVideo, pollVideoTask } from '../api/agent'
import { sendRagChatStream } from '../api/platform'
import { sendWikiChatStream } from '../api/wiki'
import { queryJob, submitJob } from '../api/hunyuan'
import { listPluginSkills } from '../config/skillRegistry'
import { DETAIL_REPAIR_PROMPT } from '../config/imageEditTools'
import type { ImageEditAction } from '../utils/imageEditHistory'
import type { DigitalHumanMode } from '../config/digitalHumanModes'
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
  classifyFile,
  createModeAttachmentHint,
  formatAttachmentsForPrompt,
  isFileAllowedForCreateMode,
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
import { searchWeb } from '../api/platform'
import {
  composeSystemPrompt,
  formatRuntimeModelHint,
  truncateHistory,
} from '../utils/promptComposer'
import {
  composeEpisodicMemoryBlock,
  composeWorkingMemoryBlock,
  formatEpisodicSnippet,
  TOOL_AWARENESS_PROTOCOL,
  WORKING_MEMORY_PROTOCOL,
} from '../utils/workingMemory'
import {
  isReasonerModel,
  runTwoPhaseDeepThinking,
} from '../services/deepThinkingChat'
import {
  composeDeepThinkingBlock,
  composeWebSearchBlock,
  parseAssistantReplyWithFallback,
} from '../utils/deepThinking'
import { resolveChatBaseUrl } from '../config/providers'
import { resolveChatModel } from '../utils/resolveModel'
import { withCreateHistoryMediaToken } from '../utils/createHistoryMedia'
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
  const imageEditComposeMode = ref<'edit' | 'video' | 'lipsync'>('edit')
  const lipsyncDialogue = ref('')
  const lipsyncAction = ref('')
  const lipsyncVoiceLabel = ref('音色')
  const lipsyncDigitalMode = ref<DigitalHumanMode>('fast')
  /** 关闭编辑层后滚动定位到创作瀑布流中的会话卡片 */
  const createGalleryLocateSessionId = ref<string | null>(null)
  /** 关闭编辑层后定位到发现页中的已发布作品 */
  const createGalleryLocatePublicItemId = ref<string | null>(null)

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

  watch(createMode, (mode) => {
    pruneAttachmentsForCreateMode(mode)
  })

  function pruneAttachmentsForCreateMode(mode: CreateMode) {
    if (mode === 'digitalHuman') {
      const media = pendingAttachments.value.filter((a) => a.kind === 'image' || a.kind === 'video')
      if (media.length <= 1) {
        pendingAttachments.value = pendingAttachments.value.filter(
          (a) => a.kind === 'image' || a.kind === 'video',
        )
        return
      }
      const keep = media[media.length - 1]!
      for (const item of media) {
        if (item.id !== keep.id && item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      pendingAttachments.value = pendingAttachments.value.filter(
        (a) => (a.kind !== 'image' && a.kind !== 'video') || a.id === keep.id,
      )
      return
    }

    const kept = pendingAttachments.value.filter((a) => {
      if (mode === 'image') return a.kind === 'image'
      if (mode === 'video') return a.kind === 'image' || a.kind === 'video'
      return true
    })
    for (const removed of pendingAttachments.value) {
      if (!kept.some((k) => k.id === removed.id) && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
    }
    pendingAttachments.value = kept
  }

  function filterFilesForCreateMode(files: File[], mode: CreateMode) {
    const allowed: File[] = []
    let rejected = 0
    for (const file of files) {
      if (isFileAllowedForCreateMode(file, mode)) allowed.push(file)
      else rejected += 1
    }
    return { allowed, rejected }
  }

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

  function finalizeAssistantContent(
    messageId: string,
    raw: string,
    opts?: { thinkingStartedAt?: number; forceDeepThink?: boolean },
  ) {
    const parsed = parseAssistantReplyWithFallback(raw, opts)
    const prev = getAllGraphMessages().find((m) => m.id === messageId)
    const meta = { ...prev?.metadata }
    if (parsed.thinking?.content?.trim()) {
      meta.thinking = parsed.thinking
    } else if (prev?.metadata?.thinking?.content?.trim()) {
      meta.thinking = prev.metadata.thinking
    }
    if (parsed.workingMemory) meta.workingMemory = parsed.workingMemory
    patchMessage(messageId, {
      content: parsed.displayContent || raw,
      metadata: Object.keys(meta).length ? meta : undefined,
    })
  }

  function patchThinkingContent(
    messageId: string,
    thinkingContent: string,
    answerContent: string,
    durationMs?: number,
  ) {
    const prev = getAllGraphMessages().find((m) => m.id === messageId)
    const meta = { ...prev?.metadata }
    if (thinkingContent.trim()) {
      meta.thinking = { content: thinkingContent, durationMs }
    }
    patchMessage(messageId, {
      content: answerContent,
      metadata: meta.thinking ? meta : prev?.metadata,
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
    const mode = createMode.value
    const { allowed, rejected } = filterFilesForCreateMode(Array.from(files), mode)
    if (rejected > 0) {
      useToastStore().show({
        message: createModeAttachmentHint(mode),
        kind: 'warning',
      })
    }
    if (!allowed.length) return

    let queue = allowed
    if (mode === 'digitalHuman') {
      pendingAttachments.value = pendingAttachments.value.filter(
        (a) => a.kind !== 'image' && a.kind !== 'video',
      )
      queue = queue.slice(0, 1)
    }

    for (const file of queue) {
      const placeholderId = randomUUID()
      pendingAttachments.value.push({
        id: placeholderId,
        name: file.name,
        mime: file.type,
        size: file.size,
        kind: classifyFile(file),
        loading: true,
      })
      try {
        const parsed = await parseFile(file)
        const idx = pendingAttachments.value.findIndex((a) => a.id === placeholderId)
        if (idx < 0) {
          if (parsed.previewUrl) URL.revokeObjectURL(parsed.previewUrl)
          continue
        }
        pendingAttachments.value[idx] = { ...parsed, id: placeholderId, loading: false }
      } catch {
        removeAttachment(placeholderId)
      }
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

    let webSearchBlock = ''
    if (platform.webSearchEnabled && !conversations.isIncognito) {
      try {
        const webHits = await searchWeb(fullContent.slice(0, 300), 5)
        webSearchBlock = composeWebSearchBlock(webHits)
      } catch {
        /* 联网搜索失败时继续对话 */
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
      composeDeepThinkingBlock(platform.deepThinkingEnabled),
      wmBlock,
      composeEpisodicMemoryBlock(episodicSnippets),
      webSearchBlock,
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

    let temperature = agentConfig.skeleton.models.temperature
    if (platform.deepThinkingEnabled) {
      temperature = Math.min(temperature, 0.25)
    }

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
        const aid = ensureAssistantMessage()
        if (platform.webSearchEnabled && webSearchBlock) {
          trackToolCall(aid, { id: 'web-search', name: '联网搜索', status: 'done' })
          patchMessage(aid, { content: '🌐 联网检索完成，正在生成回答…\n\n' })
          accumulated = '🌐 联网检索完成，正在生成回答…\n\n'
        }

        const chatMessages = [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: fullContent },
        ]
        const streamBase = {
          messages: chatMessages,
          model: model.model,
          provider: model.provider,
          baseUrl: resolveChatBaseUrl(model.provider, model.baseUrl),
          modelConfigId: model.id,
          temperature,
        }

        const deepThinkStart = platform.deepThinkingEnabled ? Date.now() : 0
        let thinkingAcc = ''
        let thinkingClosed = false

        if (platform.deepThinkingEnabled) {
          patchThinkingContent(aid, '正在分析问题…', accumulated)

          if (isReasonerModel(model)) {
            await sendChatStream({
              ...streamBase,
              onThinkingDelta: (chunk) => {
                thinkingAcc += chunk
                patchThinkingContent(aid, thinkingAcc, accumulated)
              },
              onDelta: (chunk) => {
                if (thinkingAcc && !thinkingClosed) {
                  thinkingClosed = true
                  const elapsed = Date.now() - deepThinkStart
                  patchThinkingContent(aid, thinkingAcc, accumulated, elapsed)
                }
                accumulated += chunk
                patchThinkingContent(
                  aid,
                  thinkingAcc,
                  accumulated,
                  thinkingClosed ? Date.now() - deepThinkStart : undefined,
                )
              },
            })
          } else {
            let thinkDurationMs = 0
            const twoPhase = await runTwoPhaseDeepThinking({
              ...streamBase,
              userQuestion: fullContent,
              handlers: {
                onThinkingDelta: (chunk) => {
                  thinkingAcc += chunk
                  patchThinkingContent(aid, thinkingAcc, accumulated)
                },
                onAnswerDelta: (chunk) => {
                  if (!thinkDurationMs && thinkingAcc) {
                    thinkDurationMs = Date.now() - deepThinkStart
                  }
                  accumulated += chunk
                  patchThinkingContent(
                    aid,
                    thinkingAcc,
                    accumulated,
                    thinkDurationMs || undefined,
                  )
                },
              },
            })
            thinkingAcc = twoPhase.thinking || thinkingAcc
            accumulated = twoPhase.answer || accumulated
            thinkDurationMs = twoPhase.thinkingDurationMs || thinkDurationMs
            patchThinkingContent(
              aid,
              thinkingAcc,
              accumulated,
              thinkDurationMs,
            )
          }

          if (assistantId) {
            if (!accumulated.trim() && thinkingAcc.trim()) {
              accumulated = thinkingAcc
            }
            finalizeAssistantContent(assistantId, accumulated, {
              thinkingStartedAt: deepThinkStart,
              forceDeepThink: false,
            })
            const after = getAllGraphMessages().find((m) => m.id === assistantId)
            if (thinkingAcc && !after?.metadata?.thinking?.content) {
              patchMessage(assistantId, {
                content: after?.content || accumulated,
                metadata: {
                  ...after?.metadata,
                  thinking: {
                    content: thinkingAcc,
                    durationMs: Date.now() - deepThinkStart,
                  },
                },
              })
            } else if (thinkingAcc && after) {
              patchThinkingContent(
                assistantId,
                thinkingAcc,
                after.content || accumulated,
                after.metadata?.thinking?.durationMs ?? Date.now() - deepThinkStart,
              )
            }
          }
        } else {
          await sendChatStream({
            ...streamBase,
            onDelta: (chunk) => {
              accumulated += chunk
              patchMessage(aid, { content: accumulated })
            },
          })
          if (assistantId) {
            finalizeAssistantContent(assistantId, accumulated)
          }
        }
      }
    } finally {
      isStreaming.value = false
    }
  }

  function imageGenParams(prompt: string, model?: ModelConfig, imageUrl?: string) {
    const prefs = settings.settings.generationPrefs
    return {
      prompt,
      imageUrl,
      model: model?.model,
      provider: model?.provider,
      modelConfigId: model?.id,
      baseUrl: model?.baseUrl,
      aspectRatio: prefs.aspectRatio,
      resolution: prefs.imageResolution,
      width: prefs.imageWidth,
      height: prefs.imageHeight,
    }
  }

  async function handleImageGen(content: string) {
    const model = requireModelForSkill('image')
    if (!model) {
      throw new Error('请在「模型配置」添加图片生成模型并填写 API Key，或在技能配置中绑定')
    }
    const prompt = buildUserContent(content)
    const imageAtt = pendingAttachments.value.find((a) => a.kind === 'image')
    const result = await generateImage(imageGenParams(prompt, model))
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
      duration: prefs.videoDuration,
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
      editAction: skill === 'video' ? 'video-generate' : 'generate',
      aspectRatio:
        skill === 'video'
          ? settings.settings.generationPrefs.videoAspectRatio
          : settings.settings.generationPrefs.aspectRatio,
    })

    openImageEdit(entry)
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
        const result = await generateImage(imageGenParams(prompt, model))
        await createHistory.complete(entry.id, {
          url: result.url,
          previewUrl: result.url,
          status: 'DONE',
          sessionId: entry.id,
        })
      } else {
        const imageAtt = pendingAttachments.value.find((a) => a.base64)
        const videoParams = videoGenParams(prompt, imageAtt?.base64, model)
        const submitted = await generateVideo({
          ...videoParams,
          modelConfigId: model.id,
          baseUrl: model.baseUrl,
        })
        if (!submitted.jobId) {
          throw new Error('视频 API 未返回任务 ID')
        }
        createHistory.update(entry.id, { jobId: submitted.jobId, status: 'RUNNING' })

        const done = await pollVideoTask({
          jobId: submitted.jobId,
          modelConfigId: model.id,
          provider: model.provider,
          baseUrl: model.baseUrl,
        })
        await createHistory.complete(entry.id, {
          url: done.url,
          previewUrl: done.url,
          jobId: submitted.jobId,
          status: 'DONE',
          sessionId: entry.id,
        })
      }
    } catch (err: unknown) {
      await createHistory.discard(entry.id)
      if (imageEditSessionId.value === (entry.sessionId || entry.id)) {
        closeImageEdit()
      }
      notifyError(err, skill === 'image' ? '图片生成失败' : '视频生成失败')
      throw err
    } finally {
      processingScope.value = null
      clearAttachments()
      selectedCreativeSkillId.value = null
    }
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] ?? '')
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function setReferenceImageFromUrl(url: string, name = 'reference.jpg') {
    clearAttachments()
    const fetchUrl = withCreateHistoryMediaToken(url)
    const response = await fetch(fetchUrl)
    if (!response.ok) {
      throw new Error('参考图加载失败')
    }
    const blob = await response.blob()
    const base64 = await blobToBase64(blob)
    pendingAttachments.value.push({
      id: randomUUID(),
      name,
      mime: blob.type || 'image/jpeg',
      size: blob.size,
      kind: 'image',
      previewUrl: fetchUrl,
      base64,
    })
  }

  async function startVideoComposeFromImageEdit(imageUrl: string, prompt = '') {
    createMode.value = 'video'
    inputText.value = prompt
    imageEditComposeMode.value = 'video'
    await setReferenceImageFromUrl(imageUrl)
  }

  async function commitVideoComposeFromImageEdit() {
    createMode.value = 'video'
    imageEditComposeMode.value = 'edit'
    try {
      await generateCreateMedia('video')
    } catch (err: unknown) {
      console.error('[video-compose]', err)
    }
  }

  function cancelVideoComposeFromImageEdit() {
    if (imageEditComposeMode.value !== 'video') return
    imageEditComposeMode.value = 'edit'
    clearAttachments()
    inputText.value = ''
    createMode.value = imageEditActive.value?.type === 'video' ? 'video' : 'image'
  }

  async function startLipsyncFromImageEdit(imageUrl: string, dialogue = '') {
    if (imageEditComposeMode.value === 'video') {
      cancelVideoComposeFromImageEdit()
    }
    createMode.value = 'digitalHuman'
    imageEditComposeMode.value = 'lipsync'
    lipsyncDialogue.value = dialogue
    lipsyncAction.value = ''
    lipsyncVoiceLabel.value = '音色'
    inputText.value = ''
    await setReferenceImageFromUrl(imageUrl)
  }

  function cancelLipsyncFromImageEdit() {
    if (imageEditComposeMode.value !== 'lipsync') return
    imageEditComposeMode.value = 'edit'
    lipsyncDialogue.value = ''
    lipsyncAction.value = ''
    lipsyncVoiceLabel.value = '音色'
    clearAttachments()
    createMode.value = imageEditActive.value?.type === 'video' ? 'video' : 'image'
  }

  async function commitLipsyncFromImageEdit() {
    if (!lipsyncDialogue.value.trim()) {
      throw new Error('请输入角色台词')
    }
    closeImageEdit()
    setCurrentView('create')
    inputText.value = lipsyncDialogue.value.trim()
    lipsyncDialogue.value = ''
    lipsyncAction.value = ''
    imageEditComposeMode.value = 'edit'
  }

  function openImageEdit(item: CreateHistoryItem) {
    if (item.type !== 'image' && item.type !== 'video') return
    const canOpen =
      item.status === 'RUNNING' || (item.status === 'DONE' && !!item.url)
    if (!canOpen) return

    const sessionId = item.sessionId || item.id
    imageEditSessionId.value = sessionId
    imageEditActiveId.value = item.id
    imageEditInput.value = ''
    inputText.value = ''
    imageEditComposeMode.value = 'edit'
    lipsyncDialogue.value = ''
    lipsyncAction.value = ''
    createMode.value = item.type === 'video' ? 'video' : 'image'
  }

  function closeImageEdit() {
    imageEditSessionId.value = null
    imageEditActiveId.value = null
    imageEditInput.value = ''
    imageEditComposeMode.value = 'edit'
    lipsyncDialogue.value = ''
    lipsyncAction.value = ''
  }

  function locateCreateGallerySession(sessionId: string) {
    closeImageEdit()
    setCurrentView('create')
    createGalleryLocateSessionId.value = sessionId
  }

  function locatePublicGalleryItem(itemId: string) {
    closeImageEdit()
    setCurrentView('create')
    createGalleryLocatePublicItemId.value = itemId
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
    if (!sessionId) return false

    const sessionVersions = createHistory.sessionItems(sessionId)
    const target = sessionVersions.find((v) => v.id === versionId)
    if (!target) return false

    const subtreeIds = new Set(createHistory.versionSubtreeIds(versionId, sessionVersions))
    const activeId = imageEditActiveId.value
    const activeInSubtree = activeId != null && subtreeIds.has(activeId)

    const ok = await createHistory.removeVersionCascade(versionId)
    if (!ok) return false

    const remaining = createHistory.sessionItems(sessionId)
    if (!remaining.length) {
      closeImageEdit()
      return true
    }

    if (activeInSubtree) {
      const parent =
        target.parentId != null
          ? remaining.find((v) => v.id === target.parentId)
          : undefined
      const next =
        parent ??
        [...remaining].reverse().find((v) => v.status === 'DONE') ??
        remaining[remaining.length - 1]
      imageEditActiveId.value = next.id
    }
    return true
  }

  function canDeleteImageEditVersion(versionId: string) {
    const sessionId = imageEditSessionId.value
    if (!sessionId) return false
    return useCreateHistoryStore()
      .sessionItems(sessionId)
      .some((v) => v.id === versionId)
  }

  async function submitImageEdit(
    overridePrompt?: string,
    referenceVersionId?: string,
    editAction: ImageEditAction = 'prompt-edit',
  ): Promise<boolean> {
    const prompt = (overridePrompt ?? imageEditInput.value).trim()
    const sessionId = imageEditSessionId.value
    if (!prompt || !sessionId) return false

    const versions = imageEditVersions.value
    const reference =
      (referenceVersionId ? versions.find((v) => v.id === referenceVersionId) : null) ??
      imageEditActive.value
    if (!reference?.url) return false

    const createHistory = useCreateHistoryStore()
    if (createHistory.sessionItems(sessionId).some((v) => v.status === 'RUNNING')) return false
    if (imageEditProcessingSessionId.value === sessionId) return false

    if (reference.type === 'video') {
      await submitVideoEdit(prompt, reference, sessionId)
      return true
    }

    imageEditProcessingSessionId.value = sessionId
    const model =
      (reference.modelId ? settings.getModel(reference.modelId) : null) ??
      requireModelForSkill('image')

    const aspectRatio =
      reference.aspectRatio ?? settings.settings.generationPrefs.aspectRatio

    const entry = createHistory.add({
      prompt,
      type: 'image',
      status: 'RUNNING',
      parentId: reference.id,
      sessionId,
      modelId: model?.id,
      modelName: model?.name,
      aspectRatio,
      editAction,
    })
    imageEditActiveId.value = entry.id
    imageEditInput.value = ''

    try {
      if (!model) throw new Error('请在「模型配置」添加图片生成模型并填写 API Key')
      const prefs = settings.settings.generationPrefs
      const result = await generateImage({
        ...imageGenParams(prompt, model, reference.url),
        aspectRatio,
        resolution: prefs.imageResolution,
      })
      await createHistory.complete(entry.id, {
        url: result.url,
        previewUrl: result.url,
        status: 'DONE',
      })
      return true
    } catch (err: unknown) {
      await createHistory.discard(entry.id)
      imageEditActiveId.value = reference.id
      notifyError(err, '图片编辑失败')
      console.error('[image-edit]', err)
      return false
    } finally {
      imageEditProcessingSessionId.value = null
    }
  }

  async function submitDetailRepair(): Promise<boolean> {
    const active = imageEditActive.value
    const sessionId = imageEditSessionId.value
    if (!active?.url || !sessionId || active.type === 'video') return false

    const createHistory = useCreateHistoryStore()
    if (createHistory.sessionItems(sessionId).some((v) => v.status === 'RUNNING')) return false
    if (imageEditProcessingSessionId.value === sessionId) return false

    imageEditComposeMode.value = 'edit'
    return submitImageEdit(DETAIL_REPAIR_PROMPT, undefined, 'detail-repair')
  }

  function reeditImageEditVersion(versionId: string) {
    selectImageEditVersion(versionId)
    imageEditComposeMode.value = 'edit'
    const version = imageEditVersions.value.find((v) => v.id === versionId)
    if (!version) return
    inputText.value =
      version.prompt.trim() === DETAIL_REPAIR_PROMPT ? '' : version.prompt
  }

  async function regenerateImageEditVersion(versionId: string): Promise<boolean> {
    const versions = imageEditVersions.value
    const version = versions.find((v) => v.id === versionId)
    if (!version?.parentId || !version.prompt.trim()) return false
    const parent = versions.find((v) => v.id === version.parentId)
    if (!parent?.url) return false

    imageEditComposeMode.value = 'edit'
    const action = version.editAction as ImageEditAction | undefined
    return submitImageEdit(
      version.prompt,
      parent.id,
      action === 'detail-repair' || version.prompt.trim() === DETAIL_REPAIR_PROMPT
        ? 'detail-repair'
        : action ?? 'prompt-edit',
    )
  }

  async function submitVideoEdit(
    prompt: string,
    active: CreateHistoryItem,
    sessionId: string,
  ) {
    const createHistory = useCreateHistoryStore()
    imageEditProcessingSessionId.value = sessionId
    const model =
      (active.modelId ? settings.getModel(active.modelId) : null) ??
      requireModelForSkill('video')

    const entry = createHistory.add({
      prompt,
      type: 'video',
      status: 'RUNNING',
      parentId: active.id,
      sessionId,
      modelId: model?.id,
      modelName: model?.name,
      aspectRatio: settings.settings.generationPrefs.videoAspectRatio,
      editAction: 'video-edit',
    })
    imageEditActiveId.value = entry.id
    imageEditInput.value = ''

    try {
      if (!model) throw new Error('请配置视频生成模型 API Key')
      const videoParams = videoGenParams(prompt, undefined, model)
      const submitted = await generateVideo({
        ...videoParams,
        modelConfigId: model.id,
        baseUrl: model.baseUrl,
      })
      if (!submitted.jobId) throw new Error('视频 API 未返回任务 ID')
      createHistory.update(entry.id, { jobId: submitted.jobId, status: 'RUNNING' })

      const done = await pollVideoTask({
        jobId: submitted.jobId,
        modelConfigId: model.id,
        provider: model.provider,
        baseUrl: model.baseUrl,
      })
      await createHistory.complete(entry.id, {
        url: done.url,
        previewUrl: done.url,
        jobId: submitted.jobId,
        status: 'DONE',
      })
    } catch (err: unknown) {
      await createHistory.discard(entry.id)
      imageEditActiveId.value = active.id
      notifyError(err, '短片编辑失败')
      console.error('[video-edit]', err)
    } finally {
      imageEditProcessingSessionId.value = null
    }
  }

  async function generateFromStudio() {
    if (createMode.value === 'digitalHuman') {
      useToastStore().show({ message: '数字人即将推出', kind: 'info' })
      return
    }

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
    imageEditSessionId,
    imageEditVersions,
    imageEditActive,
    imageEditLoading,
    imageEditInput,
    imageEditComposeMode,
    lipsyncDialogue,
    lipsyncAction,
    lipsyncVoiceLabel,
    lipsyncDigitalMode,
    createGalleryLocateSessionId,
    createGalleryLocatePublicItemId,
    locateCreateGallerySession,
    locatePublicGalleryItem,
    openImageEdit,
    closeImageEdit,
    selectImageEditVersion,
    deleteGallerySession,
    deleteImageEditSession,
    deleteImageEditVersion,
    canDeleteImageEditVersion,
    submitImageEdit,
    submitDetailRepair,
    reeditImageEditVersion,
    regenerateImageEditVersion,
    startVideoComposeFromImageEdit,
    commitVideoComposeFromImageEdit,
    cancelVideoComposeFromImageEdit,
    startLipsyncFromImageEdit,
    cancelLipsyncFromImageEdit,
    commitLipsyncFromImageEdit,
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
