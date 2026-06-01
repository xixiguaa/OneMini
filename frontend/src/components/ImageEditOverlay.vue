<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Download,
  Eraser,
  LocateFixed,
  Upload,
  Info,
  Loader2,
  Maximize2,
  Paintbrush,
  Play,
  ScanFace,
  Star,
  Trash2,
  Tv,
  VideoOff,
  Wand2,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useHoverPopper } from '../composables/useHoverPopper'
import {
  ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_RESOLUTIONS,
} from '../config/constants'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { usePublicGallery } from '../composables/usePublicGallery'
import { useWorksGallery, type GalleryItem } from '../composables/useWorksGallery'
import { useAgentStore } from '../stores/agent'
import { useCreateHistoryStore } from '../stores/createHistory'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import { formatUserError } from '../utils/formatUserError'
import ConfirmDialog from './ConfirmDialog.vue'
import CreateComposerCard from './CreateComposerCard.vue'
import CreateGenerationPill from './CreateGenerationPill.vue'
import ImageEditHistoryFeed from './ImageEditHistoryFeed.vue'
import LipSyncComposerCard from './LipSyncComposerCard.vue'
import OutpaintDialog from './OutpaintDialog.vue'
import PageAuroraBackground from './PageAuroraBackground.vue'
import SmartHdDialog from './SmartHdDialog.vue'
import { downloadMediaUrl } from '../utils/downloadMedia'
import { formatGenerationTime } from '../utils/formatGenerationTime'
import { isSystemEditPrompt } from '../utils/imageEditHistory'
import { resolveCreateHistoryImageUrl } from '../utils/createHistoryMedia'

const agent = useAgentStore()
const createHistory = useCreateHistoryStore()
const settings = useSettingsStore()
const { galleryItems } = useWorksGallery()
const toast = useToastStore()
const { isPublished, publish, hydrate: hydratePublicGallery } = usePublicGallery()
const publishing = ref(false)
const editComposerRef = ref<InstanceType<typeof CreateComposerCard> | null>(null)
const editStageBodyRef = ref<HTMLElement | null>(null)
const EDIT_STAGE_BOTTOM_THRESHOLD = 48
const showScrollToBottom = ref(false)
const smartHdOpen = ref(false)
const outpaintOpen = ref(false)
const deleteMode = ref<'session' | 'version' | 'blocked' | null>(null)
const deleteVersionId = ref('')
const deleting = ref(false)
const versionTimePopper = useHoverPopper({ placement: 'below' })

const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  loading: confirmLoading,
  confirm: showConfirm,
  onConfirm: onConfirmOk,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const isVideoEdit = computed(() => agent.imageEditActive?.type === 'video')
const isVideoComposeMode = computed(() => agent.imageEditComposeMode === 'video')
const isLipsyncMode = computed(() => agent.imageEditComposeMode === 'lipsync')

const editMediaType = computed(() => (isVideoEdit.value ? 'video' : 'image') as 'image' | 'video')

/** 编辑页上下切换：仅在同类型作品间导航，图片与短片隔离 */
const navGalleryItems = computed(() =>
  galleryItems.value.filter((item) => item.type === editMediaType.value),
)

function isEditStageAtBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= EDIT_STAGE_BOTTOM_THRESHOLD
}

function updateScrollToBottomVisibility(el?: HTMLElement | null) {
  const target = el ?? editStageBodyRef.value
  if (!target) {
    showScrollToBottom.value = false
    return
  }
  const canScroll = target.scrollHeight - target.clientHeight > EDIT_STAGE_BOTTOM_THRESHOLD
  showScrollToBottom.value = canScroll && !isEditStageAtBottom(target)
}

function scrollEditStageToBottom(behavior: ScrollBehavior = 'instant') {
  const el = editStageBodyRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
  if (behavior === 'instant') {
    updateScrollToBottomVisibility(el)
  }
}

function onScrollToBottomClick() {
  scrollEditStageToBottom('smooth')
  expandEditComposer(true)
}

function expandEditComposer(focus = false) {
  editComposerRef.value?.expandComposer(focus)
}

function onEditStageScroll(e: Event) {
  const el = e.target as HTMLElement

  updateScrollToBottomVisibility(el)

  if (isLipsyncMode.value) return

  const composer = editComposerRef.value
  if (!composer) return

  if (composer.shouldKeepExpandedOnScroll?.()) return

  if (isEditStageAtBottom(el)) {
    expandEditComposer()
  } else {
    composer.collapseComposer?.()
  }
}

watch(
  isLipsyncMode,
  (lipsync, wasLipsync) => {
    if (wasLipsync && !lipsync && agent.imageEditOpen) {
      void nextTick(() => {
        expandEditComposer()
        scrollEditStageToBottom()
      })
    }
  },
)

watch(
  () => agent.imageEditOpen,
  (open) => {
    if (open) {
      void hydratePublicGallery()
      agent.inputText = ''
      void nextTick(() => {
        expandEditComposer()
        scrollEditStageToBottom()
      })
    } else {
      editComposerRef.value?.collapseComposer()
      showScrollToBottom.value = false
    }
  },
)

watch(
  () => agent.imageEditVersions.length,
  () => {
    void nextTick(() => updateScrollToBottomVisibility())
  },
)

/** 用户生成该图/视频时输入的原始提示词 */
const activePrompt = computed(() => agent.imageEditActive?.prompt?.trim() || '')

const metaChips = computed(() => metaLine.value.split('|').map((s) => s.trim()).filter(Boolean))

const promptSectionTitle = computed(() => (isVideoEdit.value ? '视频提示词' : '图片提示词'))

const metaLine = computed(() => {
  const active = agent.imageEditActive
  const parts: string[] = []
  if (active?.modelName) parts.push(active.modelName)
  const ratioId =
    active?.aspectRatio ??
    (isVideoEdit.value
      ? settings.settings.generationPrefs.videoAspectRatio
      : settings.settings.generationPrefs.aspectRatio)
  const ratioOpts = isVideoEdit.value ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS
  const ratioLabel = ratioOpts.find((r) => r.id === ratioId)?.label ?? ratioId
  if (ratioLabel) parts.push(ratioLabel)
  const resId = isVideoEdit.value
    ? settings.settings.generationPrefs.videoResolution
    : settings.settings.generationPrefs.imageResolution
  const resOpts = isVideoEdit.value ? VIDEO_RESOLUTIONS : IMAGE_RESOLUTIONS
  const resLabel = resOpts.find((r) => r.id === resId)?.label
  if (resLabel) parts.push(resLabel.replace(/^高清\s|^超清\s/, ''))
  return parts.join(' | ')
})

const isActivePublished = computed(() => isPublished(agent.imageEditActive?.id))

const canPublish = computed(
  () =>
    !!agent.imageEditActive?.id &&
    agent.imageEditActive.status === 'DONE' &&
    !!displayUrl.value &&
    !isActivePublished.value,
)

async function publishCurrent() {
  const id = agent.imageEditActive?.id
  if (!id || !canPublish.value || publishing.value) return
  publishing.value = true
  try {
    await publish(id)
    toast.showSuccess('已发布到发现页，可在「发现」中查看')
  } catch (err) {
    toast.showError(formatUserError(err, '发布失败'))
  } finally {
    publishing.value = false
  }
}

type SideTool = { id: string; label: string; icon: Component; badge?: string }

const imageEditTools: SideTool[] = [
  { id: 'smart-hd', label: '智能超清', icon: Tv, badge: 'New' },
  { id: 'detail', label: '细节修复', icon: Wand2 },
  { id: 'inpaint', label: '局部重绘', icon: Paintbrush },
  { id: 'outpaint', label: '扩图', icon: Maximize2 },
  { id: 'eraser', label: '消除笔', icon: Eraser },
  { id: 'lipsync', label: '对口型', icon: ScanFace },
]

const galleryIndex = computed(() => {
  const sid = agent.imageEditSessionId
  if (!sid) return -1
  return navGalleryItems.value.findIndex((g) => (g.sessionId || g.id) === sid)
})

const galleryTotal = computed(() => navGalleryItems.value.length)

const canPrevGallery = computed(() => galleryIndex.value > 0)
const canNextGallery = computed(
  () => galleryIndex.value >= 0 && galleryIndex.value < navGalleryItems.value.length - 1,
)

const showGalleryDots = computed(
  () => !isVideoEdit.value && galleryTotal.value > 1 && galleryTotal.value <= 9,
)

function parsePreviewAspectRatio(ratioId: string | undefined, fallback: string): string {
  if (!ratioId || ratioId === 'smart') return fallback
  const parts = ratioId.split(':').map((n) => parseInt(n, 10))
  if (parts.length === 2 && parts.every((n) => n > 0)) {
    return `${parts[0]} / ${parts[1]}`
  }
  return fallback
}

const previewAspectRatio = computed(() => {
  const active = agent.imageEditActive
  if (isVideoEdit.value) {
    return parsePreviewAspectRatio(
      active?.aspectRatio ?? settings.settings.generationPrefs.videoAspectRatio,
      '16 / 9',
    )
  }
  return parsePreviewAspectRatio(
    active?.aspectRatio ?? settings.settings.generationPrefs.aspectRatio,
    '1 / 1',
  )
})

const galleryNavLabel = computed(() => (isVideoEdit.value ? '个' : '张'))

function versionLabel(index: number) {
  return index === 0 ? '原图' : `v${index + 1}`
}

function onVersionThumbEnter(verId: string, e: MouseEvent) {
  versionTimePopper.show(verId, e.currentTarget as HTMLElement)
}

function onVersionThumbLeave() {
  versionTimePopper.hide()
}

const hoveredVersion = computed(() =>
  agent.imageEditVersions.find((v) => v.id === versionTimePopper.activeKey.value),
)

function openGalleryItem(item: GalleryItem) {
  if (item.type !== editMediaType.value) return
  const sessionId = item.sessionId || item.id
  const versions = createHistory.sessionItems(sessionId)
  const target =
    [...versions].reverse().find((v) => v.status === 'DONE' && v.url) ??
    versions[versions.length - 1]
  if (target?.url) agent.openImageEdit(target)
}

function selectPrevGallery() {
  if (!canPrevGallery.value) return
  openGalleryItem(navGalleryItems.value[galleryIndex.value - 1])
}

function selectNextGallery() {
  if (!canNextGallery.value) return
  openGalleryItem(navGalleryItems.value[galleryIndex.value + 1])
}

function goToGalleryIndex(index: number) {
  const item = navGalleryItems.value[index]
  if (item) openGalleryItem(item)
}

function soonFeature(label?: string) {
  toast.show({ message: label ? `${label}即将推出` : '功能即将推出', kind: 'info' })
}

async function startDetailRepair() {
  smartHdOpen.value = false
  outpaintOpen.value = false
  if (isLipsyncMode.value) agent.cancelLipsyncFromImageEdit()
  if (isVideoComposeMode.value) agent.cancelVideoComposeFromImageEdit()
  if (isLoading.value) {
    toast.show({ message: '正在生成中，请稍候', kind: 'info' })
    return
  }
  const started = await agent.submitDetailRepair()
  if (started) {
    toast.show({ message: '细节修复生成中…', kind: 'info' })
  }
}

function onSideToolClick(tool: SideTool) {
  if (isVideoEdit.value && tool.id !== 'lipsync') {
    toast.show({ message: `${tool.label}暂不支持视频`, kind: 'info' })
    return
  }
  if (!displayUrl.value) {
    toast.showError('当前图片不可用')
    return
  }
  if (tool.id === 'smart-hd') {
    outpaintOpen.value = false
    smartHdOpen.value = true
    return
  }
  if (tool.id === 'outpaint') {
    smartHdOpen.value = false
    outpaintOpen.value = true
    return
  }
  if (tool.id === 'detail') {
    void startDetailRepair()
    return
  }
  if (tool.id === 'lipsync') {
    smartHdOpen.value = false
    outpaintOpen.value = false
    if (isLipsyncMode.value) {
      agent.cancelLipsyncFromImageEdit()
      return
    }
    if (isVideoComposeMode.value) agent.cancelVideoComposeFromImageEdit()
    void startLipsync()
    return
  }
  soonFeature(tool.label)
}

async function startLipsync() {
  const url = displayUrl.value
  if (!url) {
    toast.showError('当前素材不可用')
    return
  }
  try {
    await agent.startLipsyncFromImageEdit(url, activePrompt.value)
    toast.showSuccess('已切换为对口型创作')
  } catch (err) {
    toast.showError(formatUserError(err, '素材加载失败'))
  }
}

function sendLipsyncFromOverlay() {
  soonFeature('对口型')
}

function onSmartHdSubmit(_payload: { resolution: string; detailLevel: number }) {
  smartHdOpen.value = false
  soonFeature('智能超清')
}

function onOutpaintSubmit(_payload: { prompt: string; scale: number; ratio: string }) {
  outpaintOpen.value = false
  soonFeature('扩图')
}

function showMetaInfo() {
  if (!metaLine.value) return
  toast.show({ message: metaLine.value, kind: 'info', duration: 6000 })
}

function locateInCreatePage() {
  const sessionId = agent.imageEditSessionId
  if (!sessionId) return
  agent.locateCreateGallerySession(sessionId)
}

function cancelGenerateVideo() {
  agent.cancelVideoComposeFromImageEdit()
}

async function startGenerateVideo() {
  if (isVideoEdit.value) {
    soonFeature('短片转视频')
    return
  }
  const url = displayUrl.value
  if (!url) {
    toast.showError('当前图片不可用')
    return
  }
  try {
    await agent.startVideoComposeFromImageEdit(url, activePrompt.value)
    toast.showSuccess('已切换为短片创作，输入描述后点击发送')
  } catch (err) {
    toast.showError(formatUserError(err, '参考图加载失败'))
  }
}

function sendVideoFromOverlay() {
  void agent.commitVideoComposeFromImageEdit()
}

const editComposerPlaceholder = computed(() => {
  if (isLipsyncMode.value || isVideoComposeMode.value) return undefined
  return isVideoEdit.value
    ? '描述新的短片画面、镜头与运镜…'
    : '描述编辑'
})

const referenceGeneratedAt = computed(() => {
  if (!isVideoComposeMode.value) return undefined
  const createdAt = agent.imageEditActive?.createdAt
  if (!createdAt) return undefined
  const hasRef = agent.pendingAttachments.some((a) => a.kind === 'image' && !a.loading)
  return hasRef ? createdAt : undefined
})

function sendFromEditComposer() {
  if (isLipsyncMode.value) {
    sendLipsyncFromOverlay()
    return
  }
  if (isVideoComposeMode.value) {
    sendVideoFromOverlay()
    return
  }
  if (isLoading.value) return
  agent.imageEditInput = agent.inputText
  void agent.submitImageEdit().then((ok) => {
    if (ok) agent.inputText = ''
  })
}

function onHistoryReEdit(versionId: string) {
  agent.reeditImageEditVersion(versionId)
  editComposerRef.value?.expandComposer?.()
}

async function onHistoryRegenerate(versionId: string) {
  if (isLoading.value) {
    toast.show({ message: '正在生成中，请稍候', kind: 'info' })
    return
  }
  const started = await agent.regenerateImageEditVersion(versionId)
  if (started) {
    toast.show({ message: '正在再次生成…', kind: 'info' })
  }
}

function onUseHistoryPrompt(prompt: string) {
  if (!prompt || isSystemEditPrompt(prompt)) return
  agent.inputText = prompt
  editComposerRef.value?.expandComposer?.()
  toast.showSuccess('已填入提示词')
}

const displayUrl = computed(() => {
  const active = agent.imageEditActive
  if (!active) return ''
  if (active.status === 'DONE') {
    const resolved = resolveCreateHistoryImageUrl(active)
    if (resolved) return resolved
  }
  if (active.status === 'RUNNING') {
    const idx = agent.imageEditVersions.findIndex((v) => v.id === active.id)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = agent.imageEditVersions[i]
      const resolved = resolveCreateHistoryImageUrl(prev)
      if (resolved) return resolved
    }
  }
  return active.previewUrl || active.url || ''
})

const isLoading = computed(() => agent.imageEditLoading)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    agent.closeImageEdit()
  }
}

async function downloadCurrent() {
  const url = displayUrl.value
  if (!url) return
  const ext = isVideoEdit.value ? 'mp4' : 'png'
  await downloadMediaUrl(url, `onemini-edit-${Date.now()}.${ext}`)
}

function requestDeleteSession() {
  const count = agent.imageEditVersions.length
  deleteMode.value = 'session'
  void showConfirm({
    title: '删除作品',
    message:
      count > 1
        ? `删除此作品及全部 ${count} 个编辑版本？此操作会从服务端移除记录且无法恢复。`
        : '确定删除此作品？此操作会从服务端移除记录且无法恢复。',
    confirmLabel: '删除',
    danger: true,
  })
}

function versionDeleteHint(versionId: string) {
  const sessionId = agent.imageEditSessionId
  if (!sessionId) return '删除此版本？此操作会从服务端移除记录且无法恢复。'
  const sessionVersions = createHistory.sessionItems(sessionId)
  const subtreeCount = createHistory.versionSubtreeIds(versionId, sessionVersions).length
  if (subtreeCount <= 1) {
    return sessionVersions.length <= 1
      ? '确定删除此作品？此操作会从服务端移除记录且无法恢复。'
      : '删除此版本？此操作会从服务端移除记录且无法恢复。'
  }
  return `删除此版本及之后 ${subtreeCount - 1} 个编辑版本？此操作会从服务端移除记录且无法恢复。`
}

function requestDeleteVersion(versionId: string) {
  if (!agent.canDeleteImageEditVersion(versionId)) return
  deleteMode.value = 'version'
  deleteVersionId.value = versionId
  const isOnly = agent.imageEditVersions.length === 1
  void showConfirm({
    title: isOnly ? '删除作品' : '删除版本',
    message: versionDeleteHint(versionId),
    confirmLabel: '删除',
    danger: true,
  })
}

async function onDeleteConfirm() {
  if (deleteMode.value === 'blocked') {
    deleteMode.value = null
    onConfirmOk()
    return
  }
  deleting.value = true
  try {
    if (deleteMode.value === 'session') {
      await agent.deleteImageEditSession()
    } else if (deleteMode.value === 'version') {
      await agent.deleteImageEditVersion(deleteVersionId.value)
    }
    deleteMode.value = null
    deleteVersionId.value = ''
    onConfirmOk()
  } catch {
    /* keep open */
  } finally {
    deleting.value = false
  }
}

function onDeleteCancel() {
  if (deleting.value) return
  deleteMode.value = null
  deleteVersionId.value = ''
  onConfirmCancel()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="agent.imageEditOpen"
      class="edit-overlay"
      @keydown="onKeydown"
    >
      <PageAuroraBackground />
      <div class="edit-layout">
        <aside v-if="agent.imageEditVersions.length" class="version-rail">
          <p class="version-rail-title">版本历史</p>
          <div class="version-rail-list">
          <div
            v-for="(ver, vIdx) in agent.imageEditVersions"
            :key="ver.id"
            class="version-thumb-wrap"
          >
            <button
              type="button"
              class="version-thumb"
              :class="{
                active: agent.imageEditActive?.id === ver.id,
                pending: ver.status === 'RUNNING',
              }"
              :title="versionLabel(vIdx)"
              @mouseenter="onVersionThumbEnter(ver.id, $event)"
              @mouseleave="onVersionThumbLeave"
              @click="agent.selectImageEditVersion(ver.id)"
            >
              <video
                v-if="ver.type === 'video' && ver.url"
                :src="ver.url"
                class="thumb-video"
                muted
                playsinline
                preload="metadata"
              />
              <img v-else-if="ver.url" :src="ver.url" alt="" />
              <span v-else class="thumb-loading">
                <Loader2 :size="16" class="om-loading-spinner" />
              </span>
            </button>
            <span class="version-thumb-label">{{ versionLabel(vIdx) }}</span>
            <button
              v-if="agent.canDeleteImageEditVersion(ver.id)"
              type="button"
              class="thumb-delete"
              title="删除此版本"
              @click.stop="requestDeleteVersion(ver.id)"
            >
              <X :size="12" />
            </button>
          </div>
          </div>
        </aside>

        <Teleport to="body">
          <div
            v-if="hoveredVersion"
            class="version-time-popper"
            :style="versionTimePopper.panelStyle.value"
          >
            <span class="version-time-popper__label">生成时间</span>
            <span class="version-time-popper__value">
              {{
                hoveredVersion.status === 'RUNNING'
                  ? '生成中…'
                  : formatGenerationTime(hoveredVersion.createdAt)
              }}
            </span>
          </div>
        </Teleport>

        <div class="edit-stage">
          <div ref="editStageBodyRef" class="edit-stage-body" @scroll="onEditStageScroll">
            <button type="button" class="stage-close" title="关闭" @click="agent.closeImageEdit()">
              <X :size="20" />
            </button>

            <div class="stage-center">
              <nav v-if="galleryTotal > 1" class="gallery-nav" aria-label="作品切换">
                <button
                  type="button"
                  class="gallery-nav-btn"
                  title="上一个作品"
                  :disabled="!canPrevGallery"
                  @click="selectPrevGallery"
                >
                  <ChevronLeft :size="18" stroke-width="2.25" />
                </button>
                <div
                  v-if="showGalleryDots"
                  class="gallery-nav-indicator gallery-nav-dots"
                  role="tablist"
                  aria-label="作品列表"
                >
                  <button
                    v-for="(_, dotIdx) in navGalleryItems"
                    :key="dotIdx"
                    type="button"
                    class="gallery-nav-dot"
                    :class="{ active: dotIdx === galleryIndex }"
                    :title="`第 ${dotIdx + 1} ${galleryNavLabel}`"
                    @click="goToGalleryIndex(dotIdx)"
                  />
                </div>
                <span v-else class="gallery-nav-indicator gallery-nav-count">
                  {{ galleryIndex + 1 }} / {{ galleryTotal }}
                </span>
                <button
                  type="button"
                  class="gallery-nav-btn"
                  title="下一个作品"
                  :disabled="!canNextGallery"
                  @click="selectNextGallery"
                >
                  <ChevronRight :size="18" stroke-width="2.25" />
                </button>
              </nav>
              <div class="stage-main stage-main--history">
                <ImageEditHistoryFeed
                  :versions="agent.imageEditVersions"
                  :active-id="agent.imageEditActive?.id ?? null"
                  :is-video="isVideoEdit"
                  :digital-human-mode="isLipsyncMode"
                  :digital-human-mode-id="agent.lipsyncDigitalMode"
                  :image-resolution="settings.settings.generationPrefs.imageResolution"
                  :video-resolution="settings.settings.generationPrefs.videoResolution"
                  @select="agent.selectImageEditVersion"
                  @re-edit="onHistoryReEdit"
                  @regenerate="onHistoryRegenerate"
                  @delete="requestDeleteVersion"
                  @use-prompt="onUseHistoryPrompt"
                />
              </div>
            </div>
          </div>

          <div class="stage-composer-wrap">
            <div class="stage-composer-bar">
            <div class="stage-center stage-composer-anchor">
              <div class="stage-main-row">
                <div class="stage-composer-main">
                  <footer class="edit-composer" :class="{ 'edit-composer--scrolled-up': showScrollToBottom }">
                    <button
                      v-if="showScrollToBottom"
                      type="button"
                      class="edit-scroll-bottom-btn"
                      @click="onScrollToBottomClick"
                    >
                      回到底部
                      <ChevronsDown :size="14" />
                    </button>
                    <div class="edit-composer-gen-pill">
                      <CreateGenerationPill @view="(id) => agent.locateCreateGallerySession(id)" />
                    </div>
                    <LipSyncComposerCard
                      v-if="isLipsyncMode"
                      :image-url="displayUrl"
                      :busy="isLoading"
                      @send="sendLipsyncFromOverlay"
                    />
                    <CreateComposerCard
                      v-else
                      ref="editComposerRef"
                      collapsible
                      default-expanded
                      :auto-collapse-on-blur="false"
                      popover-placement="above"
                      submenu-placement="above"
                      :placeholder="editComposerPlaceholder"
                      :busy="isLoading"
                      :reference-generated-at="referenceGeneratedAt"
                      @send="sendFromEditComposer"
                    />
                  </footer>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <aside v-if="agent.imageEditActive" class="edit-side" @click.stop>
          <div class="side-toolbar">
            <button
              type="button"
              class="side-download-btn"
              :disabled="!displayUrl"
              @click="downloadCurrent"
            >
              <Download :size="15" />
              <span>下载</span>
            </button>
            <div class="side-toolbar-icons">
              <button
                type="button"
                class="side-icon-btn"
                :class="{ active: isActivePublished }"
                :title="isActivePublished ? '已发布' : '发布到发现'"
                :disabled="publishing || isActivePublished || !canPublish"
                @click="publishCurrent"
              >
                <Loader2 v-if="publishing" :size="16" class="om-loading-spinner" />
                <Upload v-else :size="16" />
              </button>
              <button type="button" class="side-icon-btn" title="收藏" @click="soonFeature('收藏')">
                <Star :size="16" />
              </button>
              <button
                type="button"
                class="side-icon-btn side-icon-btn--danger"
                title="删除作品"
                @click="requestDeleteSession"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </div>

          <div class="side-body">
            <div class="side-scroll">
              <section class="side-section side-section--prompt">
                <h3 class="side-section-title side-section-title--static">{{ promptSectionTitle }}</h3>
                <p v-if="!activePrompt" class="side-prompt-empty">暂无生成提示词</p>
                <p v-else class="side-prompt-text">{{ activePrompt }}</p>
                <div v-if="metaChips.length" class="side-meta-chips">
                  <span v-for="chip in metaChips" :key="chip" class="meta-chip">{{ chip }}</span>
                  <button
                    v-if="metaLine"
                    type="button"
                    class="meta-chip meta-chip--btn"
                    title="详细信息"
                    @click="showMetaInfo"
                  >
                    <Info :size="12" />
                  </button>
                </div>
              </section>

              <section v-if="!isVideoEdit" class="side-section side-section--cta">
                <button
                  type="button"
                  class="side-cta-primary"
                  :class="{ 'side-cta-primary--cancel': isVideoComposeMode }"
                  @click="isVideoComposeMode ? cancelGenerateVideo() : startGenerateVideo()"
                >
                  <VideoOff v-if="isVideoComposeMode" :size="17" />
                  <Play v-else :size="17" />
                  <span>{{ isVideoComposeMode ? '取消生成视频' : '生成视频' }}</span>
                </button>
              </section>

              <p v-if="isActivePublished" class="side-publish-hint">已发布到发现页</p>
            </div>

            <footer class="side-tools-foot">
              <h3 class="side-section-title side-section-title--static">
                {{ isVideoEdit ? '短片工具' : '编辑工具' }}
              </h3>
              <div class="side-card side-card--grid">
                <button
                  v-for="tool in imageEditTools"
                  :key="tool.id"
                  type="button"
                  class="side-tool-btn"
                  :class="{
                    active:
                      (tool.id === 'smart-hd' && smartHdOpen) ||
                      (tool.id === 'outpaint' && outpaintOpen) ||
                      (tool.id === 'lipsync' && isLipsyncMode),
                  }"
                  @click="onSideToolClick(tool)"
                >
                  <component :is="tool.icon" :size="15" />
                  <span>{{ tool.label }}</span>
                  <span v-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
                </button>
              </div>
            </footer>
          </div>

          <footer v-if="agent.imageEditSessionId" class="side-actions-foot">
            <button
              type="button"
              class="side-locate-btn"
              title="在创作页瀑布流中定位此作品"
              @click="locateInCreatePage"
            >
              <LocateFixed :size="15" stroke-width="1.75" />
              <span>在生成页定位</span>
            </button>
          </footer>
        </aside>
      </div>

      <ConfirmDialog
        :open="confirmOpen"
        :title="confirmTitle"
        :message="confirmMessage"
        :confirm-label="confirmConfirmLabel"
        :cancel-label="confirmCancelLabel"
        :danger="confirmDanger"
        :loading="confirmLoading || deleting"
        :show-cancel="deleteMode !== 'blocked'"
        @update:open="onConfirmOpenUpdate"
        @confirm="onDeleteConfirm"
        @cancel="onDeleteCancel"
      />

      <SmartHdDialog
        v-model:open="smartHdOpen"
        :image-url="displayUrl"
        :aspect-ratio="previewAspectRatio"
        @submit="onSmartHdSubmit"
      />

      <OutpaintDialog
        v-model:open="outpaintOpen"
        :image-url="displayUrl"
        :source-ratio-id="agent.imageEditActive?.aspectRatio ?? settings.settings.generationPrefs.aspectRatio"
        @submit="onOutpaintSubmit"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

$rail-width: 108px;
$thumb-size: 68px;
$side-width: 400px;
$preview-max-height: min(82vh, calc(100vh - 200px));
$preview-max-width: min(
  1050px,
  calc(100vw - #{$rail-width} - #{$side-width} - 64px),
  calc(#{$preview-max-height} * 16 / 9)
);

@mixin edit-menu-panel {
  @include cosmic.cosmic-glass-frost(12px);
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
}

@mixin edit-hover-surface {
  background: var(--composer-option-hover, $accent-light);
}

@mixin edit-icon-btn {
  border-radius: 10px;
  color: var(--composer-menu-text, $text-primary);
  transition: background 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    @include edit-hover-surface;
    color: var(--composer-text, $text-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  color: $text-primary;
  background: var(--bg-page-gradient);
  overflow: hidden;

  :deep(.page-aurora) {
    z-index: 0;
  }
}

.edit-layout {
  position: relative;
  z-index: 1;
  display: flex;
  height: 100%;
  min-height: 0;
}

.edit-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.edit-stage-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  padding: 36px 32px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
}

.stage-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex: none;
  min-height: 0;
  width: min(#{$preview-max-width}, 100%);
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.stage-main--history {
  width: 100%;
}

.stage-main-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 0;
}

.stage-main {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.version-rail {
  @include cosmic.cosmic-glass-frost(0);
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: $rail-width;
  padding: 20px 16px 24px;
  box-sizing: border-box;
  border-radius: 0;
  border-right: var(--glass-border-width, 0.5px) solid var(--sidebar-divider, $border-light);
  box-shadow: var(--glass-inset-highlight, inset 1px 0 0 rgba(255, 255, 255, 0.15));
  overflow: hidden;
}

.version-rail-title {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin: 0 0 14px;
  padding: 0 4px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: $text-muted;
  text-align: center;
  border-bottom: 1px solid var(--sidebar-divider, $border-light);
}

.version-rail-list {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 12px 4px 8px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.preview-area {
  position: relative;
  width: 100%;
  flex-shrink: 1;
  min-height: 0;
  max-height: #{$preview-max-height};
}

.stage-composer-wrap {
  position: relative;
  flex-shrink: 0;
  width: 100%;
}

.edit-scroll-bottom-btn {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: $text-muted;
  background: color-mix(in srgb, var(--bg-elevated) 92%, $text-primary 4%);
  border: 1px solid $border-light;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  transform: translateY(calc(-100% - 10px));
  cursor: pointer;
  transition: color 0.15s, background 0.15s, opacity 0.16s ease;
  animation: edit-scroll-bottom-in 0.16s ease;

  &:hover {
    color: $text-secondary;
    background: color-mix(in srgb, var(--bg-elevated) 86%, $text-primary 6%);
  }
}

@keyframes edit-scroll-bottom-in {
  from {
    opacity: 0;
    transform: translateY(calc(-100% - 4px));
  }

  to {
    opacity: 1;
    transform: translateY(calc(-100% - 10px));
  }
}

.stage-composer-bar {
  flex-shrink: 0;
  width: 100%;
  padding: 8px 32px max(20px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  overflow: visible;
}

.stage-composer-anchor {
  flex: none;
  width: min(#{$preview-max-width}, 100%);
  max-width: 100%;
}

.stage-composer-main {
  flex: 1;
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: visible;
}

.gallery-nav {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
}

.gallery-nav-indicator {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-nav-dots {
  gap: 8px;
}

.gallery-nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $border-light;
  transition: background 0.15s, transform 0.15s;

  &.active {
    background: $accent;
    transform: scale(1.25);
  }

  &:hover:not(.active) {
    background: $text-muted;
  }
}

.gallery-nav-count {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
  letter-spacing: 0.02em;
  user-select: none;
}

.gallery-nav-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: $text-primary;
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  border: 1px solid color-mix(in srgb, $border-light 70%, $text-primary 12%);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(10px) saturate(1.2);

  &:hover:not(:disabled) {
    @include edit-hover-surface;
    color: $accent-emphasis;
    border-color: color-mix(in srgb, $accent 40%, $border-light);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
  }

  &:disabled {
    opacity: 0.42;
    color: $text-muted;
    cursor: not-allowed;
  }
}

.stage-close {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 5;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  @include edit-icon-btn;
}

.preview-ai-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 4;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: $text-secondary;
  background: var(--bg-card);
  border: 1px solid $border-light;
  backdrop-filter: blur(var(--glass-blur, 24px));
}

.edit-side {
  width: $side-width;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid $border-light;
  background: var(--bg-card);
  backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
}

.side-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid $border-light;
}

.side-download-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $btn-primary-text;
  background: var(--btn-primary-gradient, $accent);
  box-shadow: var(--btn-primary-shadow, $shadow-sm);
  transition: filter 0.15s;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.side-toolbar-icons {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.side-icon-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  @include edit-icon-btn;

  &.active {
    color: $accent-cyan;
    @include edit-hover-surface;
  }

  &--danger {
    color: $text-muted;

    &:hover:not(:disabled) {
      color: $color-danger;
      background: $color-danger-soft;
    }
  }
}

.side-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.side-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.side-tools-foot {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 18px;
  border-top: 1px solid $border-light;
}

.side-actions-foot {
  flex-shrink: 0;
  padding: 12px 18px max(16px, env(safe-area-inset-bottom, 0px));
  border-top: 1px solid $border-light;
}

.side-locate-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--composer-text, $text-primary);
  background: transparent;
  transition: color 0.15s ease;

  &:hover {
    color: $accent-emphasis;
  }
}

.side-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-section--prompt {
  flex: 1;
  min-height: 0;
  gap: 12px;
}

.side-section--cta {
  gap: 0;
  flex-shrink: 0;
}

.side-section-title {
  font-size: 12px;
  font-weight: 600;
  color: $text-muted;
  letter-spacing: 0.02em;

  &--static {
    margin: 0 0 2px;
  }
}

.side-cta-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 42px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: $btn-primary-text;
  background: var(--btn-primary-gradient, $accent);
  box-shadow: var(--btn-primary-shadow, $shadow-sm);
  transition: filter 0.15s;

  &:hover {
    filter: brightness(1.06);
  }

  &--cancel {
    color: $text-primary;
    background: var(--bg-card);
    border: 1px solid $border-light;
    box-shadow: none;

    &:hover {
      filter: none;
      background: var(--composer-option-hover, $accent-light);
      border-color: color-mix(in srgb, $accent 35%, $border-light);
    }
  }
}

.side-prompt-empty {
  font-size: 13px;
  color: $text-muted;
}

.side-prompt-text {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.65;
  color: $text-primary;
  word-break: break-word;
  white-space: pre-wrap;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
}

.side-meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-chip {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  color: $text-muted;
  background: var(--composer-pill-bg, $accent-light);
  border: 1px solid $border-light;

  &--btn {
    display: inline-flex;
    align-items: center;
    padding: 3px 6px;

    &:hover {
      @include edit-hover-surface;
    }
  }
}

.side-card {
  border-radius: 10px;
  padding: 0;
}

.side-card--grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.side-tool-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 8px 8px;
  border-radius: 8px;
  font-size: 11px;
  color: $text-secondary;
  text-align: left;
  transition: background 0.15s, color 0.15s;

  &:hover {
    @include edit-hover-surface;
    color: $text-primary;
  }

  &.active {
    color: $accent-cyan;
    background: color-mix(in srgb, $accent-cyan 12%, transparent);
    border: 1px solid color-mix(in srgb, $accent-cyan 28%, transparent);
  }

  &--wide {
    grid-column: 1 / -1;
  }

  > svg:first-child {
    flex-shrink: 0;
    opacity: 0.8;
  }
}

.tool-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, $accent-cyan 18%, transparent);
  color: $accent-cyan;
}

.side-publish-hint {
  font-size: 11px;
  color: $text-muted;
  text-align: center;
  padding-bottom: 4px;
}

.version-thumb-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: $thumb-size;
  flex-shrink: 0;
  padding: 2px;

  &:hover .thumb-delete {
    opacity: 1;
  }
}

.version-thumb-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-muted;
  line-height: 1.2;
  user-select: none;
  text-align: center;
  width: 100%;

  .version-thumb-wrap:has(.version-thumb.active) & {
    color: $accent-emphasis;
  }
}

.version-thumb {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid transparent;
  opacity: 0.82;
  transition:
    opacity 0.15s,
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
  background: var(--bg-elevated);
  box-shadow: $shadow-sm;

  img,
  .thumb-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &.active {
    opacity: 1;
    border-color: $accent;
    box-shadow:
      0 0 0 2px color-mix(in srgb, $accent 28%, transparent),
      $shadow-sm;
  }

  &:hover:not(.active) {
    opacity: 1;
    border-color: color-mix(in srgb, $accent 22%, transparent);
    transform: translateY(-1px);
  }

  &.pending {
    opacity: 0.65;
  }
}

.thumb-delete {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 3;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: $color-danger;
  color: $btn-primary-text;
  opacity: 0;
  transition: opacity 0.15s;
  box-shadow: $shadow-sm;

  &:hover {
    filter: brightness(1.08);
  }
}

.thumb-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-muted;
}

.version-time-popper {
  @include edit-menu-panel;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 10px;
  pointer-events: none;
  white-space: nowrap;
  animation: version-time-popper-in 0.16s ease;

  &__label {
    font-size: 10px;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0.04em;
  }

  &__value {
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--composer-menu-text, $text-primary);
  }
}

@keyframes version-time-popper-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.preview-box {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--glass-radius-sm, 14px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
}

.preview-img,
.preview-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;

  &.dimmed {
    opacity: 0.4;
  }
}

.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $accent;
}

.edit-composer {
  position: relative;
  flex-shrink: 0;
  width: min($chat-column-max, 100%);
  max-width: 100%;
  padding: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  overflow: visible;

  :deep(.composer-card),
  :deep(.lipsync-composer) {
    width: 100%;
    max-width: 100%;
    overflow: visible;
  }

  :deep(.lipsync-composer) {
    min-height: $composer-min-height;
    height: $composer-min-height;
  }

  :deep(.composer-card--collapsible:not(.expanded)) {
    overflow: hidden;
  }

  :deep(.composer-footer) {
    flex-wrap: wrap;
  }

  :deep(.footer-right) {
    flex-shrink: 1;
    min-width: 0;
  }
}

.edit-composer-gen-pill {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  transform: translateY(calc(-100% - 10px));
  pointer-events: none;

  :deep(.create-gen-pill) {
    pointer-events: auto;
  }
}

.edit-composer--scrolled-up .edit-composer-gen-pill {
  right: auto;
  left: 0;
}

@media (max-width: 900px) {
  .edit-side {
    display: none;
  }

  .edit-stage-body {
    padding-inline: 20px;
  }

  .stage-center {
    width: min(#{$preview-max-width}, calc(100vw - 48px));
  }

  .stage-composer-bar {
    padding-inline: 20px;
  }
}

@media (max-width: 720px) {
  .stage-center {
    width: min(100%, calc(100vw - 120px));
  }

  .stage-main-row {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .stage-composer-bar {
    padding-inline: 16px;
  }

  .edit-stage-body {
    padding-inline: 16px;
  }

  .version-rail {
    width: 88px;
    padding: 16px 12px 20px;
  }

  .version-rail-list {
    gap: 12px;
    padding-inline: 2px;
  }

  .version-thumb-wrap {
    max-width: 56px;
  }
}
</style>
