<script setup lang="ts">
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FileUp,
  Focus,
  Info,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Network,
  CircleStop,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  cancelWikiIngest,
  deleteWikiRawFile,
  dismissWikiIngestErrors,
  getWikiGraph,
  getWikiIngestStatus,
  getWikiNodeContent,
  getWikiStatus,
  listWikiIngestConflicts,
  listWikiRawFiles,
  rebuildWikiGraph,
  repairUnknownWikiNodes,
  resolveWikiIngestConflict,
  uploadWikiRawFile,
  WIKI_RAW_ACCEPT,
  type WikiConflictResolution,
  type WikiGraphNode,
  type WikiIngestConflict,
  type WikiIngestStatus,
  type WikiNodeContent,
  type WikiIngestLlmConfig,
  type WikiRawFile,
} from '../api/wiki'
import { WIKI_INGEST_MODEL_STORAGE_KEY } from '../config/constants'
import { CHAT_MODEL_CAPABILITIES } from '../config/defaults'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useSettingsStore } from '../stores/settings'
import { isModelReady } from '../utils/resolveModel'
import type { ModelConfig } from '../types/agent'
import {
  OBSIDIAN_DOWNLOAD_URL,
  resolveObsidianTargetPath,
  tryOpenObsidianVault,
} from '../utils/openObsidian'
import ConfirmDialog from './ConfirmDialog.vue'
import LoadingIndicator from './LoadingIndicator.vue'
import ModelLogo from './ModelLogo.vue'
import WikiGraphCanvas from './WikiGraphCanvas.vue'
import WikiIssuesDrawer from './WikiIssuesDrawer.vue'
import WikiNodeDetail from './WikiNodeDetail.vue'

const settingsStore = useSettingsStore()

const {
  open: confirmOpen,
  loading: confirmLoading,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  confirm: showConfirm,
  setLoading: setConfirmLoading,
  close: closeConfirm,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const deleteRawPath = ref<string | null>(null)

const loading = ref(false)
const ingestJob = ref<WikiIngestStatus | null>(null)
const ingestErrorsDismissed = ref(false)
const ingestConflictsDismissed = ref(false)
const ingestConflicts = ref<WikiIngestConflict[]>([])
const resolvingConflictId = ref<string | null>(null)
const error = ref('')
const ingestNotice = ref('')
const cancellingIngest = ref(false)
const rawFiles = ref<WikiRawFile[]>([])
const graphNodes = ref<WikiGraphNode[]>([])
const graphEdges = ref<{ source: string; target: string; type: string }[]>([])
const selectedNodeId = ref<string | null>(null)
const nodeContent = ref<WikiNodeContent | null>(null)
const nodeContentLoading = ref(false)
const nodeContentError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const canvasRef = ref<InstanceType<typeof WikiGraphCanvas> | null>(null)
const graphFullscreen = ref(false)
const wikiRoot = ref('')
const obsidianDialogOpen = ref(false)
const openingObsidian = ref(false)
let contentRequestSeq = 0
let ingestPollTimer: ReturnType<typeof setInterval> | null = null
let finishIngestPollWait: (() => void) | null = null

const ingestModelId = ref('')
const showIngestModelMenu = ref(false)
const ingestModelPickerRef = ref<HTMLElement | null>(null)

const ingestModelCandidates = computed(() =>
  settingsStore.settings.models.filter(
    (m) => CHAT_MODEL_CAPABILITIES.includes(m.capability) && isModelReady(m),
  ),
)

const selectedIngestModel = computed(
  () =>
    ingestModelCandidates.value.find((m) => m.id === ingestModelId.value) ??
    ingestModelCandidates.value[0] ??
    null,
)

function persistIngestModelId(id: string) {
  ingestModelId.value = id
  try {
    localStorage.setItem(WIKI_INGEST_MODEL_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

function loadIngestModelIdPreference(server?: WikiIngestLlmConfig) {
  const fromJob = ingestJob.value?.llm?.model_config_id
  if (fromJob && isModelReady(settingsStore.getModel(fromJob))) {
    persistIngestModelId(fromJob)
    return
  }
  if (server?.model_config_id && isModelReady(settingsStore.getModel(server.model_config_id))) {
    persistIngestModelId(server.model_config_id)
    return
  }
  try {
    const saved = localStorage.getItem(WIKI_INGEST_MODEL_STORAGE_KEY)
    if (saved && isModelReady(settingsStore.getModel(saved))) {
      persistIngestModelId(saved)
      return
    }
  } catch {
    /* ignore */
  }
  const skillDefault = settingsStore.getSkill('chat')?.defaultModelId
  if (skillDefault && isModelReady(settingsStore.getModel(skillDefault))) {
    persistIngestModelId(skillDefault)
    return
  }
  const first = ingestModelCandidates.value[0]
  if (first) persistIngestModelId(first.id)
}

function buildIngestLlmPayload(): WikiIngestLlmConfig | undefined {
  const m = selectedIngestModel.value
  if (!m) return undefined
  return {
    model_config_id: m.id,
    provider: m.provider,
    model: m.model,
    base_url: m.baseUrl?.trim() || undefined,
  }
}

function selectIngestModel(m: ModelConfig) {
  persistIngestModelId(m.id)
  showIngestModelMenu.value = false
}

function toggleIngestModelMenu() {
  if (ingestRunning.value) return
  showIngestModelMenu.value = !showIngestModelMenu.value
}

function completeIngestPollWait() {
  finishIngestPollWait?.()
  finishIngestPollWait = null
}

const ingestRunning = computed(() => ingestJob.value?.running === true)

const ingestActive = computed(() => ingestRunning.value || loading.value)

const ingestProgressPct = computed(() => {
  const job = ingestJob.value
  if (!job?.total) return 0
  return Math.min(100, Math.round((job.done / job.total) * 100))
})

const ingestErrorCount = computed(() => ingestJob.value?.errors?.length ?? 0)

const ingestConflictList = computed(() =>
  ingestConflicts.value.length
    ? ingestConflicts.value
    : (ingestJob.value?.conflicts ?? []),
)

const ingestConflictCount = computed(() => ingestConflictList.value.length)

const issuesDrawerOpen = ref(false)
const issuesDrawerTab = ref<'conflicts' | 'errors'>('conflicts')
const flowInfoOpen = ref(false)
const flowInfoWrapRef = ref<HTMLElement | null>(null)
const flowInfoAnchorRef = ref<HTMLElement | null>(null)
const flowInfoPos = ref({ top: 0, left: 0 })

const showIssuesStrip = computed(
  () =>
    (ingestConflictCount.value > 0 && !ingestConflictsDismissed.value) ||
    (ingestErrorCount.value > 0 && !ingestErrorsDismissed.value),
)

const WIKI_FLOW_FILE_TYPES = [
  { key: 'raw', label: 'Raw 原始', desc: '上传的 md / PDF / Word 等，作为 ingest 输入。' },
  { key: 'source', label: '来源 Source', desc: '对应某一 raw 的章节摘要，链回原始文件。' },
  { key: 'concept', label: '概念 Concept', desc: '从原文提炼的知识点、术语与原理。' },
  { key: 'entity', label: '实体 Entity', desc: '库、框架、工具等可引用对象（如 NumPy、pandas）。' },
  { key: 'synthesis', label: '综合 Synthesis', desc: '跨多篇来源整合后的论述页。' },
  { key: 'query', label: '查询 Query', desc: '问答或检索场景的沉淀页。' },
] as const

const KIND_LABELS: Record<string, string> = {
  text: '文本',
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
}

const TYPE_LABELS: Record<string, string> = {
  raw: '原始',
  raw_extract: '提取文本',
  entity: '实体',
  concept: '概念',
  source: '来源摘要',
  synthesis: '综合',
  query: '查询',
  meta: '目录页',
  unknown: '未知',
  orphan: '待补全链接',
}

const CATEGORY_ORDER = ['source', 'concept', 'entity', 'synthesis', 'query', 'meta']

const sidebarSearch = ref('')
const sidebarCollapseInited = ref(false)
const collapsedSections = ref<Set<string>>(new Set())

function inferWikiTypeFromPath(pathOrId: string): string {
  const p = pathOrId.replace(/\\/g, '/')
  if (p.includes('/concepts/')) return 'concept'
  if (p.includes('/entities/')) return 'entity'
  if (p.includes('/sources/')) return 'source'
  if (p.includes('/synthesis/')) return 'synthesis'
  if (p.includes('/queries/')) return 'query'
  return 'unknown'
}

function resolveWikiDisplayType(node: WikiGraphNode): string {
  if (node.orphan || node.file_exists === false) return 'orphan'
  if (node.type && node.type !== 'unknown') return node.type
  return inferWikiTypeFromPath(node.path || node.id)
}

const selectedNode = computed(() =>
  graphNodes.value.find((n) => n.id === selectedNodeId.value),
)

const showNodeDetail = computed(
  () =>
    !!selectedNodeId.value || nodeContentLoading.value || !!nodeContentError.value,
)

/** 图谱点击时可能仅有 id，用节点元数据或已加载内容补全 */
const detailNode = computed((): WikiGraphNode | null => {
  if (selectedNode.value) return selectedNode.value
  const id = selectedNodeId.value
  if (!id) return null
  const fromGraph = graphNodes.value.find((n) => n.id === id)
  if (fromGraph) return fromGraph
  return {
    id,
    title: nodeContent.value?.title || id.split('/').pop() || id,
    type: inferWikiTypeFromPath(id),
    path: nodeContent.value?.path || (id.endsWith('.md') ? id : `${id}.md`),
  }
})

function onGraphNodeSelect(id: string | null) {
  selectedNodeId.value = id
}

const legend = computed(() => {
  const counts: Record<string, number> = {}
  for (const n of graphNodes.value) {
    const t = n.type || 'unknown'
    counts[t] = (counts[t] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const wikiNodes = computed(() =>
  graphNodes.value.filter((n) => n.id.startsWith('wiki/') && n.type !== 'raw' && n.type !== 'raw_extract'),
)

const orphanWikiNodes = computed(() =>
  wikiNodes.value
    .filter((n) => resolveWikiDisplayType(n) === 'orphan')
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans')),
)

function rawStem(path: string) {
  const name = path.split('/').pop() ?? path
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** 未 ingest 的 raw 会在 wiki/sources 有占位页，侧栏隐藏以免与 Raw 列表重复 */
function shouldHideSourceInSidebar(node: WikiGraphNode) {
  if (resolveWikiDisplayType(node) !== 'source') return false
  const sourceStem = (node.id.split('/').pop() ?? '').toLowerCase()
  for (const raw of rawFiles.value) {
    if (raw.ingested) continue
    const stem = rawStem(raw.path)
    if (!stem) continue
    if (sourceStem === stem || sourceStem.startsWith(stem) || stem.startsWith(sourceStem)) {
      return true
    }
  }
  return false
}

const wikiCategoryGroups = computed(() => {
  const buckets = new Map<string, WikiGraphNode[]>()
  for (const node of wikiNodes.value) {
    const type = resolveWikiDisplayType(node)
    if (type === 'orphan') continue
    if (shouldHideSourceInSidebar(node)) continue
    if (!buckets.has(type)) buckets.set(type, [])
    buckets.get(type)!.push(node)
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
    .map(([type, nodes]) => ({
      type,
      label: TYPE_LABELS[type] || type,
      nodes: nodes.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans')),
    }))
    .filter((g) => g.nodes.length > 0)
})

function matchesSidebarSearch(text: string, query: string) {
  return text.toLowerCase().includes(query)
}

const sidebarSearchActive = computed(() => sidebarSearch.value.trim().length > 0)

const filteredWikiCategoryGroups = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase()
  if (!q) return wikiCategoryGroups.value
  return wikiCategoryGroups.value
    .map((g) => ({
      ...g,
      nodes: g.nodes.filter(
        (n) => matchesSidebarSearch(n.title, q) || matchesSidebarSearch(n.id, q),
      ),
    }))
    .filter((g) => g.nodes.length > 0)
})

const filteredOrphanWikiNodes = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase()
  if (!q) return orphanWikiNodes.value
  return orphanWikiNodes.value.filter(
    (n) => matchesSidebarSearch(n.title, q) || matchesSidebarSearch(n.id, q),
  )
})

const filteredRawFiles = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase()
  if (!q) return rawFiles.value
  return rawFiles.value.filter(
    (f) => matchesSidebarSearch(f.name, q) || matchesSidebarSearch(f.path, q),
  )
})

const sidebarListStats = computed(() => {
  const wikiListed = wikiCategoryGroups.value.reduce((s, g) => s + g.nodes.length, 0)
  return {
    wiki: wikiListed,
    orphan: orphanWikiNodes.value.length,
    raw: rawFiles.value.length,
    total: wikiListed + orphanWikiNodes.value.length + rawFiles.value.length,
  }
})

const showSidebarSearch = computed(() => sidebarListStats.value.total > 8)

function sectionKey(kind: 'wiki' | 'raw' | 'orphan', type?: string) {
  if (kind === 'wiki' && type) return `wiki:${type}`
  return kind
}

function getAllSectionKeys(): string[] {
  const keys: string[] = []
  if (rawFiles.value.length) keys.push(sectionKey('raw'))
  for (const g of wikiCategoryGroups.value) keys.push(sectionKey('wiki', g.type))
  if (orphanWikiNodes.value.length) keys.push(sectionKey('orphan'))
  return keys
}

function isSectionCollapsed(key: string) {
  if (sidebarSearchActive.value) return false
  if (!sidebarCollapseInited.value) return true
  return collapsedSections.value.has(key)
}

function toggleSection(key: string) {
  const next = new Set(collapsedSections.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedSections.value = next
}

function applyDefaultCollapsedSections() {
  collapsedSections.value = new Set(getAllSectionKeys())
}

/** 数据刷新后仅将新出现的分组默认折叠，不重置用户已展开的分组 */
function mergeNewSectionsCollapsed() {
  const next = new Set(collapsedSections.value)
  let changed = false
  for (const key of getAllSectionKeys()) {
    if (!next.has(key)) {
      next.add(key)
      changed = true
    }
  }
  if (changed) collapsedSections.value = next
}

function initSidebarCollapse() {
  applyDefaultCollapsedSections()
  sidebarCollapseInited.value = true
}

function syncSidebarCollapseAfterLoad() {
  if (!sidebarCollapseInited.value) initSidebarCollapse()
  else mergeNewSectionsCollapsed()
  expandSectionForNode(selectedNodeId.value)
}

async function focusSidebarOnRaw(rawPath: string) {
  selectedNodeId.value = rawPath
  expandSectionForNode(rawPath)
  await nextTick()
  const el = document.querySelector('.wiki-page .raw-row.active')
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

function expandSectionForNode(id: string | null) {
  if (!id) return
  const next = new Set(collapsedSections.value)
  if (id.startsWith('raw/')) {
    next.delete(sectionKey('raw'))
  } else {
    const node = wikiNodes.value.find((n) => n.id === id)
    if (!node) return
    const t = resolveWikiDisplayType(node)
    if (t === 'orphan') next.delete(sectionKey('orphan'))
    else next.delete(sectionKey('wiki', t))
  }
  collapsedSections.value = next
}

const flowStats = computed(() => {
  const rawCount = graphNodes.value.filter((n) => n.type === 'raw').length || rawFiles.value.length
  const wikiCount = wikiNodes.value.length
  const outputCount = graphNodes.value.filter((n) => n.type === 'synthesis' || n.type === 'query').length
  return [
    { key: 'raw', label: 'Raw 输入', value: rawCount, desc: '上传/外部资料' },
    { key: 'wiki', label: 'Wiki 结构化', value: wikiCount, desc: '来源、概念、实体' },
    { key: 'output', label: '输出沉淀', value: outputCount, desc: '综合论述/查询' },
  ]
})

async function loadNodeContent(id: string | null) {
  const seq = ++contentRequestSeq
  nodeContent.value = null
  nodeContentError.value = ''
  if (!id) return
  nodeContentLoading.value = true
  try {
    const content = await getWikiNodeContent(id)
    if (seq === contentRequestSeq) nodeContent.value = content
  } catch (e) {
    if (seq === contentRequestSeq) {
      nodeContentError.value = e instanceof Error ? e.message : '节点内容加载失败'
    }
  } finally {
    if (seq === contentRequestSeq) nodeContentLoading.value = false
  }
}

function stopIngestPoll() {
  if (ingestPollTimer) {
    clearInterval(ingestPollTimer)
    ingestPollTimer = null
  }
}

async function handleIngestJobFinished(status: WikiIngestStatus) {
  await refreshAll()
  applyDefaultCollapsedSections()
  expandSectionForNode(selectedNodeId.value)
  canvasRef.value?.fitView()
  await loadIngestConflicts()
  if (status.cancelled) {
    error.value = ''
    ingestNotice.value =
      '构建已停止：已完成项已保留，未完成项已撤回；再次点击「构建知识框架」将只处理待构建文件。'
  } else if (ingestConflictCount.value) {
    ingestConflictsDismissed.value = false
    openIssuesDrawer('conflicts')
  } else if (status.errors?.length) {
    ingestNotice.value = ''
    error.value = `已完成，但有 ${status.errors.length} 项失败`
  } else {
    ingestNotice.value = ''
  }
}

async function pollIngestUntilDone() {
  stopIngestPoll()
  return new Promise<void>((resolve) => {
    finishIngestPollWait = resolve
    const tick = async () => {
      try {
        const status = await getWikiIngestStatus()
        ingestJob.value = status
        if (status.llm) loadIngestModelIdPreference(status.llm)
        if (!status.running) {
          stopIngestPoll()
          await handleIngestJobFinished(status)
          completeIngestPollWait()
        }
      } catch (e) {
        stopIngestPoll()
        error.value = e instanceof Error ? e.message : '获取 ingest 进度失败'
        completeIngestPollWait()
      }
    }
    void tick()
    ingestPollTimer = setInterval(() => void tick(), 2000)
  })
}

async function loadIngestConflicts() {
  try {
    const data = await listWikiIngestConflicts()
    ingestConflicts.value = data.conflicts
  } catch {
    ingestConflicts.value = ingestJob.value?.conflicts ?? []
  }
}

function openIssuesDrawer(tab: 'conflicts' | 'errors') {
  issuesDrawerTab.value = tab
  issuesDrawerOpen.value = true
  if (tab === 'conflicts') ingestConflictsDismissed.value = false
}

function dismissIssuesStrip() {
  if (ingestConflictCount.value) ingestConflictsDismissed.value = true
  if (ingestErrorCount.value && !ingestErrorsDismissed.value) void dismissIngestErrors()
}

function toggleFlowInfo() {
  if (!flowInfoOpen.value && flowInfoAnchorRef.value) {
    const rect = flowInfoAnchorRef.value.getBoundingClientRect()
    flowInfoPos.value = { top: rect.bottom + 6, left: rect.left }
  }
  flowInfoOpen.value = !flowInfoOpen.value
}

function onFlowInfoDocClick(e: MouseEvent) {
  if (!flowInfoOpen.value) return
  const target = e.target as Node
  if (flowInfoWrapRef.value?.contains(target)) return
  if ((e.target as HTMLElement).closest?.('.flow-info-popover--portal')) return
  flowInfoOpen.value = false
}

function onWikiPageDocClick(e: MouseEvent) {
  onFlowInfoDocClick(e)
  if (!showIngestModelMenu.value) return
  const target = e.target as Node
  if (ingestModelPickerRef.value?.contains(target)) return
  showIngestModelMenu.value = false
}

async function resolveIngestConflict(id: string, resolution: WikiConflictResolution) {
  resolvingConflictId.value = id
  error.value = ''
  try {
    await resolveWikiIngestConflict(id, resolution)
    await loadIngestConflicts()
    await refreshAll()
    if (!ingestConflictCount.value) issuesDrawerOpen.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : '冲突处理失败'
  } finally {
    resolvingConflictId.value = null
  }
}

async function refreshAll() {
  loading.value = true
  error.value = ''
  try {
    try {
      const status = await getWikiStatus()
      wikiRoot.value = status.wiki_root
      loadIngestModelIdPreference(status.ingest_llm)
    } catch {
      wikiRoot.value = ''
      loadIngestModelIdPreference()
    }
    rawFiles.value = await listWikiRawFiles()
    const graph = await getWikiGraph()
    graphNodes.value = graph.nodes
    graphEdges.value = graph.edges
    try {
      ingestJob.value = await getWikiIngestStatus()
    } catch {
      ingestJob.value = null
    }
    await loadIngestConflicts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败，请确认 Python 后端 (8000) 已启动'
    rawFiles.value = []
    graphNodes.value = []
    graphEdges.value = []
  } finally {
    syncSidebarCollapseAfterLoad()
    loading.value = false
  }
}

async function onUpload(ev: Event) {
  if (ingestRunning.value) return
  const input = ev.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  if (!files.length) return
  loading.value = true
  error.value = ''
  let lastUploadedPath = ''
  try {
    for (const file of files) {
      const res = await uploadWikiRawFile(file)
      lastUploadedPath = res.path
    }
    await refreshAll()
    if (lastUploadedPath) {
      await focusSidebarOnRaw(lastUploadedPath)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    loading.value = false
    input.value = ''
  }
}

async function runRepairOrphans() {
  const llm = buildIngestLlmPayload()
  if (!llm) {
    error.value = '请先在「模型配置」中启用并配置对话或多模态模型的 API Key'
    return
  }
  loading.value = true
  error.value = ''
  ingestErrorsDismissed.value = false
  try {
    const result = await repairUnknownWikiNodes(llm)
    if (result.started || result.running) {
      ingestJob.value = {
        running: true,
        total: result.total ?? 0,
        done: result.done ?? 0,
        current: null,
        errors: [],
        results: [],
        pending_count: 0,
        mode: 'repair_orphans',
      }
      await pollIngestUntilDone()
    } else {
      await refreshAll()
      canvasRef.value?.fitView()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '补全失败'
  } finally {
    loading.value = false
  }
}

async function onCancelIngest() {
  if (!ingestRunning.value || cancellingIngest.value) return
  cancellingIngest.value = true
  ingestNotice.value = ''
  error.value = ''
  try {
    await cancelWikiIngest()
    const status = await getWikiIngestStatus()
    ingestJob.value = status
    if (!status.running) {
      stopIngestPoll()
      await handleIngestJobFinished(status)
      completeIngestPollWait()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '停止构建失败'
  } finally {
    cancellingIngest.value = false
  }
}

async function runIngestJob(retryFailedOnly = false) {
  const llm = buildIngestLlmPayload()
  if (!llm) {
    error.value = '请先在「模型配置」中启用并配置对话或多模态模型的 API Key'
    return
  }
  loading.value = true
  error.value = ''
  ingestNotice.value = ''
  ingestErrorsDismissed.value = false
  try {
    const result = await rebuildWikiGraph(true, { retryFailedOnly, llm })
    if (result.started || result.running) {
      ingestJob.value = {
        running: true,
        total: result.total ?? 0,
        done: result.done ?? 0,
        current: null,
        errors: [],
        results: [],
        pending_count: result.pending_count ?? 0,
      }
      await pollIngestUntilDone()
    } else {
      ingestNotice.value = result.message || '没有待构建的 raw 文件'
      await refreshAll()
      canvasRef.value?.fitView()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '构建失败'
  } finally {
    loading.value = false
  }
}

async function onRebuild() {
  await runIngestJob(false)
}

async function onRetryFailed() {
  await runIngestJob(true)
}

async function dismissIngestErrors() {
  ingestErrorsDismissed.value = true
  error.value = ''
  try {
    await dismissWikiIngestErrors()
    if (ingestJob.value) {
      ingestJob.value = { ...ingestJob.value, errors: [] }
    }
  } catch {
    /* 本地已隐藏即可 */
  }
}

function requestDeleteRaw(path: string, e?: Event) {
  e?.stopPropagation()
  deleteRawPath.value = path
  void showConfirm({
    title: '删除原始文件',
    message: `确定删除？\n${path}`,
    confirmLabel: '删除',
    cancelLabel: '取消',
    danger: true,
  })
}

async function onConfirmDeleteRaw() {
  const path = deleteRawPath.value
  if (!path) {
    closeConfirm(false)
    return
  }
  setConfirmLoading(true)
  loading.value = true
  error.value = ''
  try {
    await deleteWikiRawFile(path)
    if (selectedNodeId.value === path) selectedNodeId.value = null
    await refreshAll()
    deleteRawPath.value = null
    closeConfirm(true)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    setConfirmLoading(false)
    loading.value = false
  }
}

function onCancelDeleteRaw() {
  deleteRawPath.value = null
  onConfirmCancel()
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toggleGraphFullscreen() {
  graphFullscreen.value = !graphFullscreen.value
}

async function openInObsidian() {
  if (openingObsidian.value) return
  openingObsidian.value = true
  try {
    let root = wikiRoot.value
    if (!root) {
      const status = await getWikiStatus()
      root = status.wiki_root
      wikiRoot.value = root
    }
    if (!root) {
      obsidianDialogOpen.value = true
      return
    }
    const target = resolveObsidianTargetPath(
      root,
      selectedNodeId.value,
      nodeContent.value?.path,
    )
    const opened = await tryOpenObsidianVault(target)
    if (!opened) {
      obsidianDialogOpen.value = true
    }
  } catch {
    obsidianDialogOpen.value = true
  } finally {
    openingObsidian.value = false
  }
}

function onGraphEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && graphFullscreen.value) graphFullscreen.value = false
}

watch(graphFullscreen, async (on) => {
  document.body.style.overflow = on ? 'hidden' : ''
  await nextTick()
  window.dispatchEvent(new Event('resize'))
  if (on) canvasRef.value?.fitView()
})

watch(ingestConflictCount, (n, prev) => {
  if (n > 0 && (prev ?? 0) === 0) {
    ingestConflictsDismissed.value = false
    openIssuesDrawer('conflicts')
  }
})

onMounted(async () => {
  window.addEventListener('keydown', onGraphEscape)
  document.addEventListener('click', onWikiPageDocClick)
  await refreshAll()
  if (ingestJob.value?.running) {
    loading.value = true
    await pollIngestUntilDone()
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGraphEscape)
  document.removeEventListener('click', onWikiPageDocClick)
  stopIngestPoll()
  completeIngestPollWait()
  graphFullscreen.value = false
  document.body.style.overflow = ''
})
watch(selectedNodeId, (id) => loadNodeContent(id), { immediate: false })

watch(selectedNodeId, (id) => expandSectionForNode(id))
</script>

<template>
  <div class="wiki-page">
    <p v-if="error" class="error-banner">{{ error }}</p>
    <p v-if="ingestNotice" class="ingest-notice-banner">{{ ingestNotice }}</p>

    <div v-if="ingestJob?.running" class="ingest-banner">
      <div class="ingest-banner-head">
        <LoadingIndicator
          :label="
            ingestJob?.cancel_requested
              ? '正在停止…'
              : ingestJob?.mode === 'repair_orphans'
                ? '正在补全未知 wiki 页…'
                : '正在 LLM 结构化知识库…'
          "
          variant="inline"
          :size="15"
        />
        <div class="ingest-banner-actions">
          <span class="ingest-count">{{ ingestJob.done }} / {{ ingestJob.total }}</span>
          <span class="ingest-banner-divider" aria-hidden="true" />
          <button
            type="button"
            class="ingest-stop-btn"
            title="停止构建"
            :disabled="cancellingIngest || ingestJob?.cancel_requested"
            @click="onCancelIngest"
          >
            <Loader2 v-if="cancellingIngest" :size="13" class="om-loading-spinner" aria-hidden="true" />
            <CircleStop v-else :size="13" aria-hidden="true" />
            <span>{{ cancellingIngest || ingestJob?.cancel_requested ? '正在停止' : '停止' }}</span>
          </button>
        </div>
      </div>
      <div class="ingest-bar">
        <div class="ingest-bar-fill" :style="{ width: `${ingestProgressPct}%` }" />
      </div>
      <p v-if="ingestJob.current" class="ingest-current">当前：{{ ingestJob.current }}</p>
    </div>

    <div v-if="showIssuesStrip" class="wiki-issues-strip" role="status">
      <div class="wiki-issues-strip-main">
        <button
          v-if="ingestConflictCount && !ingestConflictsDismissed"
          type="button"
          class="issues-chip warn"
          @click="openIssuesDrawer('conflicts')"
        >
          内容冲突
          <span class="issues-count">{{ ingestConflictCount }}</span>
        </button>
        <button
          v-if="ingestErrorCount && !ingestErrorsDismissed"
          type="button"
          class="issues-chip danger"
          @click="openIssuesDrawer('errors')"
        >
          构建失败
          <span class="issues-count">{{ ingestErrorCount }}</span>
        </button>
        <button
          v-if="ingestErrorCount && !ingestErrorsDismissed"
          type="button"
          class="issues-action-btn"
          :disabled="ingestActive"
          @click="onRetryFailed"
        >
          重试失败项
        </button>
      </div>
      <button
        type="button"
        class="issues-strip-dismiss"
        title="关闭提示"
        aria-label="关闭提示"
        @click="dismissIssuesStrip"
      >
        <X :size="14" />
      </button>
    </div>

    <div class="split-layout">
      <aside class="side card">
        <div class="side-toolbar">
          <button
            type="button"
            class="action-btn primary"
            :disabled="loading || ingestRunning"
            @click="fileInput?.click()"
          >
            <FileUp :size="16" />
            上传 raw
          </button>
          <input
            ref="fileInput"
            type="file"
            :accept="WIKI_RAW_ACCEPT"
            multiple
            hidden
            @change="onUpload"
          />

          <button
            type="button"
            class="action-btn primary-outline"
            :disabled="ingestRunning || !selectedIngestModel"
            :title="selectedIngestModel ? undefined : '请先在模型配置中启用对话或多模态模型'"
            @click="onRebuild"
          >
            <Loader2 v-if="ingestRunning" :size="16" class="om-loading-spinner" aria-hidden="true" />
            <Network v-else :size="16" aria-hidden="true" />
            构建知识框架
          </button>
          <button
            v-if="ingestErrorCount && !ingestJob?.running"
            type="button"
            class="action-btn"
            :disabled="ingestActive || !selectedIngestModel"
            @click="onRetryFailed"
          >
            <RefreshCw :size="16" />
            重试失败项 ({{ ingestErrorCount }})
          </button>
          <button
            type="button"
            class="action-btn"
            :class="{ 'is-busy': loading }"
            :disabled="loading"
            @click="refreshAll"
          >
            <RefreshCw :size="16" aria-hidden="true" />
            刷新
          </button>
          <button
            type="button"
            class="action-btn"
            :disabled="loading || openingObsidian"
            title="在本地 Obsidian 中打开 llm-wiki 仓库或当前笔记"
            @click="openInObsidian"
          >
            <LoadingIndicator v-if="openingObsidian" label="正在打开…" variant="button" :size="14" />
            <template v-else>
              <ExternalLink :size="16" />
              Obsidian
            </template>
          </button>
        </div>

        <div class="side-scroll">
        <section class="side-section">
          <div ref="flowInfoWrapRef" class="flow-section-head">
            <p class="group-label">LLM-Wiki 流程</p>
            <button
              ref="flowInfoAnchorRef"
              type="button"
              class="flow-info-btn"
              :aria-expanded="flowInfoOpen"
              aria-haspopup="dialog"
              title="流程说明"
              @click.stop="toggleFlowInfo"
            >
              <Info :size="14" />
            </button>
          </div>
          <Teleport to="body">
            <div
              v-if="flowInfoOpen"
              class="flow-info-popover flow-info-popover--portal"
              role="dialog"
              aria-label="LLM-Wiki 流程说明"
              :style="{ top: `${flowInfoPos.top}px`, left: `${flowInfoPos.left}px` }"
              @click.stop
            >
              <p class="flow-info-lead">
                将上传的原始资料通过 LLM 拆成可双向链接的 wiki 知识页，并在图谱中浏览关系；也可在 Obsidian 中继续编辑同一仓库。
              </p>
              <ol class="flow-info-steps">
                <li><strong>Raw</strong>：上传 md / PDF / Word 等原始文件</li>
                <li>
                  <strong>构建知识框架</strong>：仅处理待构建 raw；可随时停止（已完成保留，未完成撤回）
                </li>
                <li><strong>图谱与阅读</strong>：点击节点预览正文，按需打开 Obsidian</li>
              </ol>
              <p class="flow-info-sub">各类 wiki 页面含义：</p>
              <ul class="flow-info-types">
                <li v-for="t in WIKI_FLOW_FILE_TYPES" :key="t.key">
                  <strong>{{ t.label }}</strong>
                  <span>{{ t.desc }}</span>
                </li>
              </ul>
            </div>
          </Teleport>

          <div class="ingest-arch-block">
            <p class="ingest-arch-label">构建模型选择</p>
            <div ref="ingestModelPickerRef" class="ingest-model-picker">
              <button
                type="button"
                class="ingest-model-btn"
                :disabled="ingestRunning"
                :aria-expanded="showIngestModelMenu"
                @click.stop="toggleIngestModelMenu"
              >
                <ModelLogo v-if="selectedIngestModel" :model="selectedIngestModel" :size="20" />
                <span class="ingest-model-name">
                  {{ selectedIngestModel?.name ?? '未配置可用模型' }}
                </span>
                <ChevronDown
                  :size="14"
                  class="chevron"
                  :class="{ open: showIngestModelMenu }"
                  aria-hidden="true"
                />
              </button>
              <div
                v-if="showIngestModelMenu && ingestModelCandidates.length"
                class="ingest-model-menu"
                role="listbox"
              >
                <button
                  v-for="m in ingestModelCandidates"
                  :key="m.id"
                  type="button"
                  class="ingest-model-option"
                  :class="{ active: selectedIngestModel?.id === m.id }"
                  role="option"
                  @click="selectIngestModel(m)"
                >
                  <ModelLogo :model="m" :size="22" />
                  <span>{{ m.name }}</span>
                </button>
              </div>
            </div>
            <p class="ingest-model-hint">
              用于「构建知识框架」与断链补全；支持对话 / 多模态模型（需已配置 API Key）。
            </p>
          </div>

          <div class="flow-rail" aria-label="raw 到 wiki 到输出流程">
            <div v-for="step in flowStats" :key="step.key" class="flow-step" :data-step="step.key">
              <span class="flow-value">{{ step.value }}</span>
              <span class="flow-label">{{ step.label }}</span>
              <span class="flow-desc">{{ step.desc }}</span>
            </div>
          </div>
        </section>

        <section class="side-section raw-section">
          <button
            type="button"
            class="category-row collapsible raw-category-head"
            :aria-expanded="!isSectionCollapsed(sectionKey('raw'))"
            @click="toggleSection(sectionKey('raw'))"
          >
            <ChevronDown
              v-if="!isSectionCollapsed(sectionKey('raw'))"
              :size="14"
              class="category-chevron"
            />
            <ChevronRight v-else :size="14" class="category-chevron" />
            <span class="group-label raw-head-label">Raw 原始文件</span>
            <span class="category-count">{{ filteredRawFiles.length }}</span>
          </button>
          <template v-if="!isSectionCollapsed(sectionKey('raw'))">
          <p class="list-empty raw-hint">上传的原文、PDF 等；构建前请在此选中文件，再点「构建知识框架」。</p>
          <LoadingIndicator
            v-if="loading && !rawFiles.length"
            label="加载中…"
            variant="block"
            class="list-empty"
          />
          <p v-else-if="!rawFiles.length" class="list-empty">
            暂无。支持 md、txt、pdf、docx、xlsx/xls 等
          </p>
          <p v-else-if="sidebarSearchActive && !filteredRawFiles.length" class="list-empty">无匹配 raw 文件</p>
          <div
            v-for="f in filteredRawFiles"
            :key="f.path"
            class="raw-row"
            :class="{ active: selectedNodeId === f.path }"
          >
            <button
              type="button"
              class="raw-item"
              @click="selectedNodeId = f.path"
            >
              <FileText :size="18" class="item-icon" />
              <div class="item-text">
                <span class="name">{{ f.name }}</span>
                <span class="meta">
                  {{ KIND_LABELS[f.kind] || f.kind }} · {{ formatSize(f.size) }}
                  <template v-if="f.extracted"> · 已提取</template>
                  <template v-if="f.ingested"> · 已构建</template>
                  <template v-else> · 待构建</template>
                </span>
              </div>
            </button>
            <button
              type="button"
              class="raw-delete-btn"
              title="删除原始文件"
              :disabled="loading"
              @click.stop="requestDeleteRaw(f.path, $event)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
          </template>
        </section>

        <section class="side-section wiki-browse-section">
          <div class="section-head">
            <p class="group-label">Wiki 浏览</p>
            <Layers :size="14" class="section-icon" />
          </div>
          <p v-if="sidebarListStats.total > 0 && !sidebarSearchActive" class="sidebar-hint">
            已构建的 wiki 页（概念、实体等）。「来源摘要」是 LLM 根据 raw 写的摘要，未构建前只在上方 Raw 列表显示，避免重复。
          </p>
          <label v-if="showSidebarSearch" class="sidebar-search embedded-field">
            <Search :size="14" class="sidebar-search-icon" aria-hidden="true" />
            <input
              v-model="sidebarSearch"
              type="search"
              class="sidebar-search-input"
              placeholder="筛选标题或路径…"
              autocomplete="off"
            />
            <button
              v-if="sidebarSearch"
              type="button"
              class="sidebar-search-clear"
              aria-label="清除筛选"
              @click="sidebarSearch = ''"
            >
              <X :size="14" />
            </button>
          </label>
          <LoadingIndicator
            v-if="loading && !wikiNodes.length"
            label="加载中…"
            variant="block"
            class="list-empty"
          />
          <p v-else-if="!wikiNodes.length" class="list-empty">
            暂无结构化 wiki。上传 raw 后点击「构建知识框架」，将自动调用 LLM 生成来源/概念/实体页并更新图谱。
          </p>
          <p
            v-else-if="sidebarSearchActive && !filteredWikiCategoryGroups.length && !filteredOrphanWikiNodes.length"
            class="list-empty"
          >
            无匹配项，请修改关键词或在图谱中点选节点。
          </p>
          <div v-for="group in filteredWikiCategoryGroups" :key="group.type" class="wiki-group">
            <button
              type="button"
              class="category-row collapsible"
              :aria-expanded="!isSectionCollapsed(sectionKey('wiki', group.type))"
              @click="toggleSection(sectionKey('wiki', group.type))"
            >
              <ChevronDown
                v-if="!isSectionCollapsed(sectionKey('wiki', group.type))"
                :size="14"
                class="category-chevron"
              />
              <ChevronRight v-else :size="14" class="category-chevron" />
              <span class="dot" :data-type="group.type" />
              <span>{{ group.label }}</span>
              <span class="category-count">{{ group.nodes.length }}</span>
            </button>
            <template v-if="!isSectionCollapsed(sectionKey('wiki', group.type))">
              <p v-if="group.type === 'source'" class="group-type-hint">
                构建完成后出现；一篇 raw 对应一篇摘要，不是原始文件副本。
              </p>
              <button
                v-for="node in group.nodes"
                :key="node.id"
                type="button"
                class="wiki-item"
                :class="{ active: selectedNodeId === node.id }"
                @click="selectedNodeId = node.id"
              >
                <BookOpen :size="16" class="item-icon" />
                <div class="item-text">
                  <span class="name">{{ node.title }}</span>
                  <span class="meta">{{ node.path }}</span>
                </div>
              </button>
            </template>
          </div>

          <div
            v-if="orphanWikiNodes.length && (!sidebarSearchActive || filteredOrphanWikiNodes.length)"
            class="wiki-group orphan-group"
          >
            <button
              type="button"
              class="category-row collapsible orphan-category"
              :aria-expanded="!isSectionCollapsed(sectionKey('orphan'))"
              @click="toggleSection(sectionKey('orphan'))"
            >
              <ChevronDown
                v-if="!isSectionCollapsed(sectionKey('orphan'))"
                :size="14"
                class="category-chevron"
              />
              <ChevronRight v-else :size="14" class="category-chevron" />
              <span class="dot" data-type="unknown" />
              <span>{{ TYPE_LABELS.orphan }}</span>
              <span class="category-count">{{ filteredOrphanWikiNodes.length }}</span>
            </button>
            <template v-if="!isSectionCollapsed(sectionKey('orphan'))">
              <p class="list-empty orphan-hint">
                正文中 [[链接]] 指向的页面尚未生成，可一键用 LLM 补全后重建图谱。
              </p>
              <button
                type="button"
                class="action-btn primary-outline orphan-repair-btn"
                :disabled="ingestActive || !selectedIngestModel"
                @click="runRepairOrphans"
              >
                <RefreshCw :size="16" />
                补全未知页并重建
              </button>
              <button
                v-for="node in filteredOrphanWikiNodes"
                :key="node.id"
                type="button"
                class="wiki-item orphan-item"
                :class="{ active: selectedNodeId === node.id }"
                @click="selectedNodeId = node.id"
              >
                <BookOpen :size="16" class="item-icon" />
                <div class="item-text">
                  <span class="name">{{ node.title }}</span>
                  <span class="meta">断链 · {{ node.id }}</span>
                </div>
              </button>
            </template>
          </div>
        </section>

        <div v-if="legend.length" class="legend">
          <p class="group-label">图例</p>
          <div v-for="[type, count] in legend" :key="type" class="legend-row">
            <span class="dot" :data-type="type" />
            <span>{{ TYPE_LABELS[type] || type }} ({{ count }})</span>
          </div>
        </div>
        </div>
      </aside>

      <section class="main-panel">
        <div class="graph-area">
          <Teleport to="body" :disabled="!graphFullscreen">
            <div
              class="graph-viewport"
              :class="{ 'is-fullscreen': graphFullscreen, 'has-detail': showNodeDetail }"
            >
              <div class="graph-canvas-slot">
                <WikiGraphCanvas
                  ref="canvasRef"
                  :nodes="graphNodes"
                  :edges="graphEdges"
                  :selected-id="selectedNodeId"
                  @select="onGraphNodeSelect"
                />
                <div class="graph-float-tools">
                  <button
                    type="button"
                    class="graph-tool-btn"
                    title="适应画布"
                    @click="canvasRef?.fitView()"
                  >
                    <Focus :size="17" />
                  </button>
                  <button
                    type="button"
                    class="graph-tool-btn"
                    :title="graphFullscreen ? '退出全屏' : '全屏预览'"
                    @click="toggleGraphFullscreen"
                  >
                    <Minimize2 v-if="graphFullscreen" :size="17" />
                    <Maximize2 v-else :size="17" />
                  </button>
                  <button
                    type="button"
                    class="graph-tool-btn"
                    title="在 Obsidian 中打开"
                    :disabled="openingObsidian"
                    @click="openInObsidian"
                  >
                    <ExternalLink :size="17" />
                  </button>
                </div>
              </div>

              <aside v-if="showNodeDetail" class="detail-panel">
                <header class="detail-head">
                  <span class="detail-head-title">{{ detailNode?.title || '节点详情' }}</span>
                  <button
                    type="button"
                    class="detail-close-btn"
                    title="关闭"
                    aria-label="关闭文章预览"
                    @click="selectedNodeId = null"
                  >
                    <X :size="16" />
                  </button>
                </header>
                <div class="detail-scroll">
                  <WikiNodeDetail
                    :node="detailNode"
                    :content="nodeContent"
                    :loading="nodeContentLoading"
                    :error="nodeContentError"
                  />
                </div>
              </aside>
            </div>
          </Teleport>
        </div>
      </section>
    </div>

    <WikiIssuesDrawer
      v-model:open="issuesDrawerOpen"
      v-model:tab="issuesDrawerTab"
      :conflicts="ingestConflictList"
      :errors="ingestJob?.errors ?? []"
      :resolving-conflict-id="resolvingConflictId"
      :ingest-active="ingestActive"
      @resolve="resolveIngestConflict"
      @retry="onRetryFailed"
    />

    <ConfirmDialog
      v-model:open="confirmOpen"
      :loading="confirmLoading"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmConfirmLabel"
      :cancel-label="confirmCancelLabel"
      :danger="confirmDanger"
      @update:open="onConfirmOpenUpdate"
      @confirm="onConfirmDeleteRaw"
      @cancel="onCancelDeleteRaw"
    />

    <ConfirmDialog
      v-model:open="obsidianDialogOpen"
      title="未检测到 Obsidian"
      message="未能唤起本地 Obsidian。请先安装 Obsidian，并将本仓库的 llm-wiki 文件夹作为仓库打开。"
      cancel-label="关闭"
      confirm-label="下载 Obsidian"
      :confirm-href="OBSIDIAN_DOWNLOAD_URL"
      max-width="440px"
      @confirm="obsidianDialogOpen = false"
    >
      <div v-if="wikiRoot" class="dialog-path">
        <span class="dialog-path-label">知识库路径</span>
        <code>{{ wikiRoot }}</code>
      </div>
      <p class="dialog-hint">安装后可在 Obsidian 中使用内置图谱视图浏览 [[wikilink]] 网络。</p>
    </ConfirmDialog>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

@mixin hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
}

.wiki-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 16px;
  gap: 10px;
}

.error-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: $radius-md;
  background: $color-danger-soft;
  color: $color-danger;
  font-size: 13px;
}

.ingest-notice-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: $radius-md;
  background: $accent-light;
  border: 1px solid $border-light;
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.5;
}

.ingest-banner {
  padding: 10px 14px;
  border-radius: $radius-md;
  background: $accent-light;
  border: 1px solid $border-light;
}

.ingest-banner-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 8px;
}

.ingest-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ingest-banner-divider {
  width: 1px;
  height: 14px;
  background: $border-light;
}

.ingest-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  margin: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: $text-muted;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease;

  svg {
    flex-shrink: 0;
    opacity: 0.85;
  }

  &:hover:not(:disabled) {
    color: var(--color-danger);
    background: var(--color-danger-soft);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.ingest-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: $accent;
}

.ingest-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.ingest-bar-fill {
  height: 100%;
  background: $accent;
  border-radius: 999px;
  transition: width 0.35s ease;
}

.ingest-current {
  margin: 8px 0 0;
  font-size: 11px;
  color: $text-muted;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wiki-issues-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-radius: $radius-md;
  background: $bg-card;
  border: 1px solid $glass-border;
}

.wiki-issues-strip-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}

.issues-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: $text-secondary;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: $text-primary;
    background: rgba(0, 0, 0, 0.04);
  }

  &.warn {
    border-color: color-mix(in srgb, $color-warning 35%, transparent);

    .issues-count {
      color: color-mix(in srgb, $color-warning 80%, $text-primary);
      background: color-mix(in srgb, $color-warning 14%, transparent);
    }
  }

  &.danger {
    border-color: color-mix(in srgb, $color-danger 30%, transparent);

    .issues-count {
      color: $color-danger;
      background: $color-danger-soft;
    }
  }
}

.issues-count {
  min-width: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  border-radius: 999px;
  text-align: center;
}

.issues-action-btn {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  color: $accent;
  background: transparent;

  &:hover:not(:disabled) {
    background: $accent-light;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.issues-strip-dismiss {
  flex-shrink: 0;
  display: flex;
  padding: 4px;
  border-radius: 6px;
  color: $text-muted;

  &:hover {
    color: $text-primary;
    background: rgba(0, 0, 0, 0.06);
  }
}

.ingest-arch-block {
  margin: 10px 0 12px;
}

.ingest-arch-label {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ingest-model-picker {
  position: relative;
}

.ingest-model-btn {
  @include cosmic.cosmic-glass-select-trigger(8px);
  gap: 8px;
  width: 100%;
  min-height: 38px;
  padding: 8px 34px 8px 10px;

  &:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .chevron {
    margin-left: auto;
    color: $text-muted;
    transition: transform 0.15s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.ingest-model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ingest-model-menu {
  @include cosmic.cosmic-glass-dropdown-menu(8px);
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
}

.ingest-model-option {
  @include cosmic.cosmic-glass-dropdown-option;
}

.ingest-model-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: $text-muted;
}

.flow-section-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;

  .group-label {
    padding-bottom: 0;
  }
}

.flow-info-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: $text-muted;
  background: transparent;

  &:hover {
    color: $accent;
    background: $accent-light;
  }
}

.flow-info-popover {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  width: min(300px, calc(100vw - 48px));
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.55;
  color: $text-secondary;

  &--portal {
    position: fixed;
    z-index: 2900;
    max-height: min(70vh, 420px);
    overflow-y: auto;
  }
}

.flow-info-lead {
  margin: 0 0 10px;
  color: $text-primary;
}

.flow-info-steps {
  margin: 0 0 10px;
  padding-left: 1.2em;
  color: $text-secondary;

  li {
    margin: 4px 0;
  }
}

.flow-info-sub {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.flow-info-types {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
    border-top: 1px solid $border-light;

    &:first-child {
      border-top: none;
      padding-top: 0;
    }

    strong {
      font-size: 12px;
      color: $text-primary;
    }

    span {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(240px, 300px) 1fr;
  gap: 14px;
  min-height: 0;
}

.card {
  min-height: 0;
}

.side {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  min-height: 0;
}

.side-toolbar {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid $glass-border;
  background: $bg-card;

  .action-btn {
    justify-content: center;
    min-height: 34px;
    padding: 7px 10px;
    font-size: 12px;
  }

  .action-btn.primary {
    grid-column: 1 / -1;
  }

  .action-btn.primary-outline {
    grid-column: 1 / -1;
  }
}

.side-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  @include hide-scrollbar;
}

.side-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-icon {
  color: $text-muted;
}

.flow-rail {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  position: relative;
}

.flow-step {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 9px 8px;
  border-radius: 10px;
  border: 1px solid $glass-border;
  background: $accent-light;

  &[data-step='wiki'] {
    background: color-mix(in srgb, $accent-cyan 12%, transparent);
  }

  &[data-step='output'] {
    background: color-mix(in srgb, $accent-emphasis 12%, transparent);
  }
}

.flow-value {
  font-size: 17px;
  font-weight: 700;
  color: $text-primary;
}

.flow-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  white-space: nowrap;
}

.flow-desc {
  font-size: 10px;
  color: $text-muted;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 4px 2px;
  margin: 0;
}

.list-empty {
  font-size: 12px;
  color: $text-muted;
  padding: 8px 6px;
  margin: 0;
}

.raw-item,
.wiki-item {
  display: flex;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  text-align: left;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
  }
}

.wiki-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.orphan-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed $glass-border;
}

.orphan-category {
  background: rgba(112, 128, 144, 0.08);
}

.sidebar-hint {
  margin: 0 4px 8px;
  font-size: 11px;
  line-height: 1.45;
  color: $text-muted;
}

.sidebar-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 4px 10px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid $glass-border;
  background: $bg-input;
}

.sidebar-search-icon {
  flex-shrink: 0;
  color: $text-muted;
}

.sidebar-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: $text-primary;
  outline: none;

  &:focus,
  &:focus-visible {
    outline: none;
    border: none;
    box-shadow: none;
  }

  &::placeholder {
    color: $text-muted;
  }
}

.sidebar-search-clear {
  display: flex;
  padding: 2px;
  color: $text-muted;
  border-radius: 4px;

  &:hover {
    color: $text-primary;
    background: $accent-light;
  }
}

.orphan-hint {
  padding: 4px 7px 6px;
  margin: 0;
}

.orphan-repair-btn {
  margin: 0 7px 6px;
  width: calc(100% - 14px);
}

.orphan-item .item-icon {
  color: $text-muted;
}

.category-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 7px;
  border-radius: 8px;
  font-size: 12px;
  color: $text-secondary;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid $glass-border;
  pointer-events: none;

  &.collapsible {
    pointer-events: auto;
    cursor: pointer;
    text-align: left;

    &:hover {
      background: $accent-light;
      color: $text-primary;
    }
  }
}

.category-chevron {
  flex-shrink: 0;
  opacity: 0.75;
}

.category-count {
  margin-left: auto;
  font-size: 10px;
  color: $text-muted;
}

.raw-category-head {
  margin-bottom: 4px;

  .raw-head-label {
    padding: 0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 11px;
    font-weight: 600;
    color: $text-muted;
  }
}

.wiki-item {
  padding-left: 18px;
}

.raw-section {
  padding-top: 4px;
}

.wiki-browse-section {
  padding-top: 8px;
  border-top: 1px solid $glass-border;
}

.raw-hint,
.group-type-hint {
  margin: 0 7px 8px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.45;
  color: $text-muted;
}

.item-icon {
  flex-shrink: 0;
  color: $accent;
  opacity: 0.85;
}

.item-text {
  min-width: 0;

  .name {
    display: block;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: block;
    font-size: 10px;
    color: $text-muted;
    margin-top: 2px;
    word-break: break-all;
  }
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  margin-top: 4px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid $glass-border;
  background: transparent;
  color: $text-primary;

  &:hover:not(:disabled) {
    background: $accent-light;
  }

  &:disabled:not(.primary) {
    opacity: 0.55;
  }

  &.is-busy:disabled {
    opacity: 1;
    color: $text-muted;
    cursor: wait;
  }

  &.primary {
    background: $accent;
    color: $btn-primary-text;
    border-color: transparent;
    margin-top: 8px;

    svg {
      color: inherit;
    }

    &:hover:not(:disabled) {
      background: $btn-primary-hover-bg;
      color: $btn-primary-text;
      box-shadow: $shadow-glow;
    }

    &:disabled {
      opacity: 1;
      background: $btn-primary-disabled-bg;
      color: $btn-primary-disabled-text;
      cursor: not-allowed;
    }
  }

  &.primary-outline {
    background: transparent;
    border-color: $accent;
    color: $accent;

    &:hover:not(:disabled) {
      background: $accent-light;
      color: $accent;
      border-color: $accent;
      box-shadow: $shadow-sm;
    }
  }

  &.danger {
    color: $color-danger;
    border-color: rgba(180, 60, 60, 0.35);
    width: auto;
    margin-top: 8px;
  }
}


.legend {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid $glass-border;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: $text-secondary;
  padding: 3px 4px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: $text-muted;

  &[data-type='raw'] {
    background: #6b6b8a;
  }
  &[data-type='entity'] {
    background: #7c5fe8;
  }
  &[data-type='concept'] {
    background: #1e96be;
  }
  &[data-type='source'] {
    background: #ffb830;
  }
  &[data-type='synthesis'] {
    background: #5338c0;
  }
  &[data-type='raw_extract'] {
    background: #a0a0c0;
  }
}

.main-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.graph-area {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 0;
  overflow: hidden;

  &:not(.is-fullscreen) {
    border-radius: $radius-md;
    border: var(--glass-border-width, 0.5px) solid $glass-border;
    background: transparent;
    box-shadow: $shadow-sm;
  }

  &.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 3000;
    width: 100vw;
    height: 100vh;
    flex: none;
    background: #060412;
  }

  &.has-detail .graph-canvas-slot {
    flex: 1;
    min-width: 0;
  }

  :deep(.graph-canvas-wrap) {
    flex: 1;
    min-height: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  &.is-fullscreen :deep(.graph-canvas-wrap) {
    border: none;
  }
}

.graph-canvas-slot {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.graph-float-tools {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: flex;
  gap: 6px;
  pointer-events: none;
}

.graph-viewport.has-detail .graph-float-tools {
  right: auto;
  left: 10px;
}

.graph-tool-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0.5px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  outline: none;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: scale(0.96);
  }

  &:focus-visible {
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.28),
      0 0 0 2px color-mix(in srgb, $accent 35%, transparent);
  }
}

.raw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 0 6px 0 0;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: $bg-elevated;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    border-color: color-mix(in srgb, $accent 45%, transparent);
    background: color-mix(in srgb, $accent-light 80%, $bg-elevated);

    .raw-delete-btn {
      opacity: 1;
    }
  }

  &.active {
    border-color: $accent;
    background: $accent-light;
    box-shadow: inset $active-indicator 0 0 $accent;
  }
}

.raw-row .raw-item {
  flex: 1;
  min-width: 0;
  padding: 8px 4px 8px 8px;
  border: none;
  border-radius: 8px 0 0 8px;
  background: transparent;

  &:hover {
    background: transparent;
  }
}

.raw-delete-btn {
  opacity: 0;
  flex-shrink: 0;
  padding: 4px;
  border: none;
  border-radius: 4px;
  color: $text-muted;
  background: transparent;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;

  &:hover:not(:disabled) {
    color: $color-danger;
    background: $color-danger-soft;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.detail-panel {
  flex: 0 0 min(400px, 42%);
  width: min(400px, 42%);
  min-width: 280px;
  max-width: 480px;
  height: 100%;
  /* 图谱预览侧栏：不透明深色阅读面（避免透出浅色页面底） */
  --text-primary: rgba(255, 255, 255, 0.94);
  --text-secondary: rgba(255, 255, 255, 0.72);
  --text-muted: rgba(255, 255, 255, 0.48);
  --bg-elevated: rgba(255, 255, 255, 0.08);
  --bg-input: rgba(0, 0, 0, 0.35);
  --bg-card: rgba(255, 255, 255, 0.06);
  --border-light: rgba(255, 255, 255, 0.14);
  --link-color: rgba(167, 145, 255, 0.92);
  --accent: #9b82f0;
  --accent-emphasis: #b8a4ff;
  --accent-light: rgba(124, 95, 232, 0.22);
  --accent-cyan: #5ee4d0;
  --color-warning: #ffb830;
  --color-danger: #ff7a94;
  color: var(--text-secondary);
  background: linear-gradient(180deg, #12102a 0%, #0c0a1e 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  z-index: 25;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.28);
}

.graph-viewport.is-fullscreen .detail-panel {
  border-left-color: rgba(255, 255, 255, 0.1);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.4);
}

.detail-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px 0 14px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid var(--border-light);
}

.detail-head-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-close-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 7px;
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  outline: none;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--accent-light);
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  }

  &:focus-visible {
    box-shadow: $shadow-focus;
  }
}

.detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 16px 18px;
  @include hide-scrollbar;
}
</style>
