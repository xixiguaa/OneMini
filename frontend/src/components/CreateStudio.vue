<script setup lang="ts">
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsUp,
  Compass,
  Image,
  LayoutGrid,
  Loader2,
  Plus,
  Search,
  ScanFace,
  Sparkles,
  Video,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch, type VNodeRef } from 'vue'
import {
  createStudioOpenFloatingComposerKey,
  createStudioScrollToComposerKey,
} from '../composables/createStudioScroll'
import { acceptFilesForCreateMode } from '../utils/files'
import { useAnchoredPopover } from '../composables/useAnchoredPopover'
import { usePublicGallery } from '../composables/usePublicGallery'
import { useTypewriter } from '../composables/useTypewriter'
import {
  composerSubmenuOpenKey,
  createComposerMenuCloseAllKey,
  createMenuCloseSignalKey,
  toggleExclusiveComposerMenu,
} from '../composables/useCreateComposerMenus'
import ChatAttachmentCard from './ChatAttachmentCard.vue'
import CreateGenerationPill from './CreateGenerationPill.vue'
import ReferenceImageStack from './ReferenceImageStack.vue'
import CreativeSkillsMenu from './CreativeSkillsMenu.vue'
import GenPreferencesPopover from './GenPreferencesPopover.vue'
import ModelLogo from './ModelLogo.vue'
import ImageEditOverlay from './ImageEditOverlay.vue'
import LipSyncComposerCard from './LipSyncComposerCard.vue'
import WorksWaterfall from './WorksWaterfall.vue'
import { isModelReady } from '../utils/resolveModel'
import { useAgentStore } from '../stores/agent'
import { useToastStore } from '../stores/toast'
import { formatUserError } from '../utils/formatUserError'
import { useCreateHistoryStore } from '../stores/createHistory'
import { useSettingsStore } from '../stores/settings'
import type { CreateMode, SkillId } from '../types/agent'
import { applyAspectRatioToPrompt, applyVideoPrefsToPrompt } from '../utils/aspectRatioPrompt'

const agent = useAgentStore()
const settings = useSettingsStore()
const toast = useToastStore()
const studioRoot = ref<HTMLElement | null>(null)
const composerAnchor = ref<HTMLElement | null>(null)
const gallerySection = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const menuCloseSignal = ref(0)
const galleryMainTab = ref<'mine' | 'discover' | 'video'>('mine')
const galleryMediaTab = ref<'image' | 'video'>('image')
const gallerySearch = ref('')
const showFloatingComposer = ref(false)
const floatingExpanded = ref(false)
const floatingBarRef = ref<HTMLElement | null>(null)
const floatingLipsyncRef = ref<InstanceType<typeof LipSyncComposerCard> | null>(null)
const floatingInputRef = ref<HTMLTextAreaElement | null>(null)
const suspendFloatingCollapse = ref(false)
const showScrollTop = ref(false)
let floatingCollapseTimer: ReturnType<typeof setTimeout> | null = null

/** 浮动输入框折叠动画时长（与 CSS 保持一致） */
const FLOATING_ANIM_MS = 520

const modePopover = useAnchoredPopover({ minWidth: 220, fitContent: true, placement: 'below' })
const modelPopover = useAnchoredPopover({
  align: 'right',
  minWidth: 240,
  maxPanelHeight: 280,
  placement: 'below',
})
const floatingModePopover = useAnchoredPopover({ minWidth: 220, fitContent: true, placement: 'above' })
const floatingModelPopover = useAnchoredPopover({
  align: 'right',
  minWidth: 240,
  maxPanelHeight: 280,
  placement: 'above',
})
const modeMenuOpen = modePopover.open
const modelMenuOpen = modelPopover.open
const floatingModeMenuOpen = floatingModePopover.open
const floatingModelMenuOpen = floatingModelPopover.open

const openSubmenus = reactive(new Set<string>())
provide(composerSubmenuOpenKey, (id: string, open: boolean) => {
  if (open) openSubmenus.add(id)
  else openSubmenus.delete(id)
})

const composerMenuActive = computed(
  () =>
    modePopover.open.value ||
    modelPopover.open.value ||
    floatingModePopover.open.value ||
    floatingModelPopover.open.value ||
    openSubmenus.size > 0,
)

const bindModeTrigger: VNodeRef = (el) => {
  modePopover.triggerRef.value = el as HTMLElement | null
}

const bindModePanel: VNodeRef = (el) => {
  modePopover.panelRef.value = el as HTMLElement | null
}

const bindModelTrigger: VNodeRef = (el) => {
  modelPopover.triggerRef.value = el as HTMLElement | null
}

const bindModelPanel: VNodeRef = (el) => {
  modelPopover.panelRef.value = el as HTMLElement | null
}

const bindFloatingModeTrigger: VNodeRef = (el) => {
  floatingModePopover.triggerRef.value = el as HTMLElement | null
}

const bindFloatingModePanel: VNodeRef = (el) => {
  floatingModePopover.panelRef.value = el as HTMLElement | null
}

const bindFloatingModelTrigger: VNodeRef = (el) => {
  floatingModelPopover.triggerRef.value = el as HTMLElement | null
}

const bindFloatingModelPanel: VNodeRef = (el) => {
  floatingModelPopover.panelRef.value = el as HTMLElement | null
}

const modePanelStyle = computed(() => modePopover.panelStyle.value)
const modelPanelStyle = computed(() => modelPopover.panelStyle.value)
const floatingModePanelStyle = computed(() => floatingModePopover.panelStyle.value)
const floatingModelPanelStyle = computed(() => floatingModelPopover.panelStyle.value)

provide(createMenuCloseSignalKey, menuCloseSignal)

function closeAllComposerMenus() {
  modePopover.close()
  modelPopover.close()
  floatingModePopover.close()
  floatingModelPopover.close()
  menuCloseSignal.value += 1
}

provide(createComposerMenuCloseAllKey, closeAllComposerMenus)

const modes = [
  { id: 'agent' as const, label: 'Agent 创作', desc: '与 Agent 一起创作', icon: Sparkles },
  { id: 'image' as const, label: '图片生成', desc: '智能美学提升', icon: Image },
  { id: 'video' as const, label: '视频生成', desc: '一镜到底', icon: Video },
  { id: 'digitalHuman' as const, label: '数字人', desc: '角色对口型说话', icon: ScanFace },
]

const galleryMainTabs = [
  { id: 'mine' as const, label: '我的创作', icon: LayoutGrid },
  { id: 'discover' as const, label: '发现', icon: Compass },
  { id: 'video' as const, label: '创意视频', icon: Video },
]

const galleryMineSubTabs = [
  { id: 'image' as const, label: '图片', icon: Image },
  { id: 'video' as const, label: '短片', icon: Video },
]

const gallerySource = computed(() => (galleryMainTab.value === 'mine' ? 'mine' : 'public'))

const galleryEffectiveMediaType = computed(() => {
  if (galleryMainTab.value === 'discover') return 'image' as const
  if (galleryMainTab.value === 'video') return 'video' as const
  return galleryMediaTab.value
})

const gallerySearchPlaceholder = computed(() => {
  if (galleryMainTab.value === 'mine') {
    return galleryMediaTab.value === 'video' ? '搜索我的短片…' : '搜索我的图片…'
  }
  if (galleryMainTab.value === 'discover') return '搜索发现图片…'
  return '搜索创意视频…'
})

const { hydrate: hydratePublicGallery } = usePublicGallery()

const currentMode = computed(() => modes.find((m) => m.id === agent.createMode))

const heroModeLabel = computed(() => currentMode.value?.label ?? 'Agent 创作')
const { displayText: heroModeText } = useTypewriter(heroModeLabel, {
  speed: 88,
  startDelay: 200,
  loop: true,
  pauseAfterType: 2200,
  deleteSpeed: 52,
  pauseAfterDelete: 500,
})

const skillForMode = computed((): SkillId => {
  if (agent.createMode === 'video' || agent.createMode === 'digitalHuman') return 'video'
  if (agent.createMode === 'image') return 'image'
  return 'chat'
})

const availableModels = computed(() => {
  let list = settings.chatModels
  if (agent.createMode === 'video' || agent.createMode === 'digitalHuman') list = settings.videoModels
  else if (agent.createMode === 'image') list = settings.imageModels
  else if (agent.createMode === 'agent') list = settings.chatModels
  return list.filter(isModelReady)
})

const selectedModel = computed(() => {
  const models = availableModels.value
  const skill = settings.getSkill(skillForMode.value)
  const id = skill?.defaultModelId
  if (id) {
    const m = models.find((x) => x.id === id)
    if (m) return m
  }
  return models[0] ?? null
})

const inputPlaceholder = computed(() => {
  if (agent.createMode === 'agent') {
    return '输入想法、脚本或上传参考，支持「/」使用技能，和 Agent 一起创作'
  }
  if (agent.createMode === 'video') {
    return '描述你想生成的视频画面、镜头与时长，例如：小猫咪玩球，5 秒'
  }
  if (agent.createMode === 'digitalHuman') {
    return '上传角色参考图，输入台词与动作描述，生成对口型视频…'
  }
  return '描述你想生成的图片内容、风格与构图…'
})

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await agent.addAttachments(files)
  if (fileInput.value) fileInput.value.value = ''
  suspendFloatingCollapse.value = false
}

function triggerFileInput() {
  if (agent.galleryReferenceLock) {
    toast.show({ message: '仅支持一张参考图，请先移除后再上传', kind: 'warning' })
    return
  }
  if (showFloatingComposer.value) {
    suspendFloatingCollapse.value = true
    if (agent.createMode === 'digitalHuman') {
      floatingLipsyncRef.value?.expandComposer?.(false)
    } else {
      floatingExpanded.value = true
    }
  }
  fileInput.value?.click()
}

function scrollToTop() {
  studioRoot.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

provide(createStudioScrollToComposerKey, () => {
  studioRoot.value?.scrollTo({ top: 0, behavior: 'smooth' })
})

/** 发现页「做同款 / 用作参考图」：展开底部浮动输入框 */
async function openFloatingComposerFromGallery(opts: {
  prompt: string
  mode: 'image' | 'video'
  referenceImageUrl?: string
  referenceImageName?: string
}) {
  agent.setCurrentView('create')
  ensureDefaultModel()
  closeComposerMenus()

  try {
    await agent.beginGalleryRemix({
      mode: opts.mode,
      prompt: opts.prompt,
      imageUrl: opts.referenceImageUrl,
      imageName: opts.referenceImageName,
    })
  } catch (err: unknown) {
    toast.showError(formatUserError(err, '参考图加载失败'))
    return
  }

  showFloatingComposer.value = true
  suspendFloatingCollapse.value = true
  floatingExpanded.value = true

  await nextTick()
  requestAnimationFrame(() => {
    floatingInputRef.value?.focus()
    const el = floatingInputRef.value
    if (el) {
      el.selectionStart = el.value.length
      el.selectionEnd = el.value.length
    }
  })
  window.setTimeout(() => {
    suspendFloatingCollapse.value = false
  }, 280)
}

provide(createStudioOpenFloatingComposerKey, openFloatingComposerFromGallery)

function onStudioScroll() {
  const el = studioRoot.value
  if (!el) return
  showScrollTop.value = el.scrollTop > 240
  collapseFloatingComposer()
}

function shouldKeepFloatingExpanded() {
  if (composerMenuActive.value || suspendFloatingCollapse.value) return true
  const active = document.activeElement
  if (floatingBarRef.value && active && floatingBarRef.value.contains(active)) return true
  if (active instanceof Element && active.closest('.create-composer-popover')) return true
  return false
}

function scheduleFloatingCollapseIfUnfocused() {
  if (!floatingExpanded.value) return
  if (floatingCollapseTimer) clearTimeout(floatingCollapseTimer)
  floatingCollapseTimer = window.setTimeout(() => {
    floatingCollapseTimer = null
    if (shouldKeepFloatingExpanded()) return
    collapseFloatingComposer()
  }, 120)
}

function onFloatingInputBlur() {
  scheduleFloatingCollapseIfUnfocused()
}

function onFloatingWindowRefocus() {
  if (suspendFloatingCollapse.value) {
    suspendFloatingCollapse.value = false
    if (floatingExpanded.value) {
      void nextTick(() => floatingInputRef.value?.focus())
    }
    return
  }
  scheduleFloatingCollapseIfUnfocused()
}

function expandFloatingComposer() {
  if (!showFloatingComposer.value || floatingExpanded.value) return
  floatingExpanded.value = true
  void nextTick(() => {
    requestAnimationFrame(() => floatingInputRef.value?.focus())
  })
}

function collapseFloatingComposer() {
  if (suspendFloatingCollapse.value) return
  if (agent.createMode === 'digitalHuman') {
    if (floatingLipsyncRef.value?.shouldKeepExpandedOnScroll?.()) return
    floatingLipsyncRef.value?.collapseComposer?.()
    return
  }
  if (!floatingExpanded.value) return
  floatingExpanded.value = false
  closeComposerMenus()
  window.setTimeout(() => floatingInputRef.value?.blur(), FLOATING_ANIM_MS)
}

function onFloatingBarClick(e: MouseEvent) {
  if (floatingExpanded.value) return
  const el = e.target as HTMLElement
  if (el.closest('.floating-send')) return
  expandFloatingComposer()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendFromStudio()
  }
}

function highlightGallerySession(sessionId: string) {
  const card = gallerySection.value?.querySelector(
    `[data-gallery-session="${CSS.escape(sessionId)}"]`,
  ) as HTMLElement | null
  if (!card) return false
  card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  card.classList.add('work-card--located')
  window.setTimeout(() => card.classList.remove('work-card--located'), 2400)
  return true
}

async function locateSessionInGallery(sessionId: string) {
  const createHistory = useCreateHistoryStore()
  const items = createHistory.sessionItems(sessionId)
  const pick =
    [...items].reverse().find((item) => item.status === 'DONE') ??
    items[items.length - 1]
  const tab = pick?.type === 'video' ? 'video' : 'image'
  galleryMainTab.value = 'mine'
  galleryMediaTab.value = tab
  await nextTick()
  gallerySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  await nextTick()
  requestAnimationFrame(() => {
    highlightGallerySession(sessionId)
    agent.createGalleryLocateSessionId = null
  })
}

async function locatePublicItemInGallery(itemId: string) {
  const { galleryItems, hydrate } = usePublicGallery()
  await hydrate(true)
  const item = galleryItems.value.find((i) => i.id === itemId)
  galleryMainTab.value = item?.type === 'video' ? 'video' : 'discover'
  galleryMediaTab.value = item?.type === 'video' ? 'video' : 'image'
  await nextTick()
  gallerySection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  await nextTick()
  requestAnimationFrame(() => {
    highlightGallerySession(itemId)
    agent.createGalleryLocatePublicItemId = null
  })
}

function selectGalleryMainTab(tab: 'mine' | 'discover' | 'video') {
  galleryMainTab.value = tab
  if (tab === 'discover') galleryMediaTab.value = 'image'
  else if (tab === 'video') galleryMediaTab.value = 'video'
}

function sendFromStudio() {
  if (!canSend()) return
  void agent.generateFromStudio()
}

function pickMode(id: CreateMode) {
  const keepFloatingOpen =
    showFloatingComposer.value &&
    (agent.createMode === 'digitalHuman'
      ? (floatingLipsyncRef.value?.isExpanded?.() ?? false)
      : floatingExpanded.value)

  agent.createMode = id
  closeComposerMenus()
  ensureDefaultModel()

  if (!keepFloatingOpen || !showFloatingComposer.value) return

  suspendFloatingCollapse.value = true
  if (agent.createMode !== 'digitalHuman') {
    floatingExpanded.value = true
  }
  void nextTick(() => {
    if (agent.createMode === 'digitalHuman') {
      floatingLipsyncRef.value?.expandComposer?.(false)
    } else {
      floatingInputRef.value?.focus()
    }
    window.setTimeout(() => {
      suspendFloatingCollapse.value = false
    }, 180)
  })
}

function selectModel(id: string) {
  settings.updateSkill(skillForMode.value, { defaultModelId: id })
  closeComposerMenus()
}

function ensureDefaultModel() {
  const models = availableModels.value
  if (!models.length) return
  const skill = settings.getSkill(skillForMode.value)
  const current = skill?.defaultModelId
  const valid = current && models.some((m) => m.id === current)
  if (!valid) {
    settings.updateSkill(skillForMode.value, { defaultModelId: models[0].id })
  }
}

function closeComposerMenus() {
  closeAllComposerMenus()
}

function toggleModelMenu(e: MouseEvent) {
  if (!availableModels.value.length) {
    e.stopPropagation()
    agent.setCurrentView('models')
    return
  }
  toggleExclusiveComposerMenu(menuCloseSignal, modelPopover, e)
}

function toggleModeMenu(e: MouseEvent) {
  toggleExclusiveComposerMenu(menuCloseSignal, modePopover, e)
}

function toggleFloatingModeMenu(e: MouseEvent) {
  toggleExclusiveComposerMenu(menuCloseSignal, floatingModePopover, e)
}

function toggleFloatingModelMenu(e: MouseEvent) {
  if (!availableModels.value.length) {
    e.stopPropagation()
    agent.setCurrentView('models')
    return
  }
  toggleExclusiveComposerMenu(menuCloseSignal, floatingModelPopover, e)
}

function shouldIgnoreComposerMenuClose(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el?.closest) return false
  return !!el.closest('.create-composer-trigger, .create-composer-popover')
}

function onDocClick(e: MouseEvent) {
  if (shouldIgnoreComposerMenuClose(e.target)) return
  closeComposerMenus()
}

function onEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  closeComposerMenus()
}

watch(
  () => menuCloseSignal.value,
  () => {
    modePopover.close()
    modelPopover.close()
    floatingModePopover.close()
    floatingModelPopover.close()
  },
)

watch(() => agent.createMode, (mode, prev) => {
  ensureDefaultModel()
  const prefs = settings.settings.generationPrefs
  if (mode === 'image' && prev === 'video') {
    agent.inputText = applyAspectRatioToPrompt(agent.inputText, prefs.aspectRatio)
  } else if (mode === 'video' && prev === 'image') {
    agent.inputText = applyVideoPrefsToPrompt(
      agent.inputText,
      prefs.videoAspectRatio,
      prefs.videoResolution,
      prefs.videoDuration,
    )
  }

  if (!showFloatingComposer.value || !prev) return

  if (prev === 'digitalHuman' && mode !== 'digitalHuman') {
    const wasExpanded = floatingLipsyncRef.value?.isExpanded?.() ?? false
    if (wasExpanded) {
      void nextTick(() => {
        floatingExpanded.value = true
      })
    }
    return
  }

  if (mode === 'digitalHuman' && prev !== 'digitalHuman' && floatingExpanded.value) {
    void nextTick(() => {
      floatingLipsyncRef.value?.expandComposer?.(false)
    })
  }
}, { flush: 'sync' })
watch(availableModels, ensureDefaultModel, { deep: true })
watch(
  () => agent.currentView,
  (view) => {
    if (view === 'create') ensureDefaultModel()
  },
)

watch(
  [() => agent.createGalleryLocateSessionId, () => agent.currentView],
  ([sessionId, view]) => {
    if (!sessionId || view !== 'create') return
    void locateSessionInGallery(sessionId)
  },
)

watch(
  [() => agent.createGalleryLocatePublicItemId, () => agent.currentView],
  ([itemId, view]) => {
    if (!itemId || view !== 'create') return
    void locatePublicItemInGallery(itemId)
  },
)


watch(showFloatingComposer, (visible) => {
  if (!visible) collapseFloatingComposer()
})

watch(composerMenuActive, (active) => {
  if (active && showFloatingComposer.value) {
    floatingExpanded.value = true
  }
})

let composerObserver: IntersectionObserver | undefined

function setupComposerObserver() {
  composerObserver?.disconnect()
  if (!composerAnchor.value || !studioRoot.value) return
  composerObserver = new IntersectionObserver(
    ([entry]) => {
      showFloatingComposer.value = !entry.isIntersecting
    },
    { root: studioRoot.value, threshold: 0, rootMargin: '-8px 0px 0px 0px' },
  )
  composerObserver.observe(composerAnchor.value)
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onEscape)
  window.addEventListener('focus', onFloatingWindowRefocus)
  ensureDefaultModel()

  studioRoot.value?.addEventListener('scroll', onStudioScroll, { passive: true })
  await nextTick()
  setupComposerObserver()
  void hydratePublicGallery()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onEscape)
  window.removeEventListener('focus', onFloatingWindowRefocus)
  composerObserver?.disconnect()
  studioRoot.value?.removeEventListener('scroll', onStudioScroll)
  if (floatingCollapseTimer) clearTimeout(floatingCollapseTimer)
})

const canSend = () => {
  if (agent.isProcessing) return false
  if (agent.pendingAttachments.some((a) => a.loading)) return false
  if (agent.createMode === 'digitalHuman') {
    return agent.lipsyncDialogue.trim().length > 0
  }
  return agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0
}

const isCreateBusy = computed(() => agent.isCreateProcessing)

const imageAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind === 'image'),
)

const digitalHumanImageUrl = computed(
  () =>
    agent.pendingAttachments.find(
      (a) => (a.kind === 'image' || a.kind === 'video') && a.previewUrl,
    )?.previewUrl ?? '',
)

const docAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind !== 'image'),
)

const fileAccept = computed(() => acceptFilesForCreateMode(agent.createMode))
</script>

<template>
  <div ref="studioRoot" class="create-studio">
    <div class="create-hero-zone">
      <!-- ① 标题区 -->
      <header class="hero">
        <h1 class="hero-title">
          开启你的
          <span class="hero-mode-slot">
            <span class="hero-mode-ghost" aria-hidden="true">{{ heroModeLabel }}</span>
            <span class="hero-mode-live">
              <span class="hero-mode-text">{{ heroModeText }}</span>
              <span class="hero-mode-cursor" aria-hidden="true"></span>
            </span>
          </span>
          之旅
        </h1>
      </header>

      <!-- ② 输入区（与对话页 ChatInput 一致） -->
      <section
        ref="composerAnchor"
        class="composer-wrap"
        :class="{ 'composer-menu-active': composerMenuActive }"
      >
        <div v-if="!showFloatingComposer" class="composer-gen-pill-slot">
          <CreateGenerationPill @view="locateSessionInGallery" />
        </div>
        <div class="composer-inner">
          <LipSyncComposerCard
            v-if="agent.createMode === 'digitalHuman'"
            embedded
            :image-url="digitalHumanImageUrl"
            :busy="isCreateBusy"
            :pick-ref-file="triggerFileInput"
            @send="sendFromStudio"
          />
          <div v-else class="composer-card">
            <div v-if="docAttachments.length" class="attachments">
              <ChatAttachmentCard
                v-for="a in docAttachments"
                :key="a.id"
                :attachment="a"
                @remove="agent.removeAttachment(a.id)"
              />
            </div>

            <div class="composer-body">
              <div class="ref-upload-wrap ref-upload-wrap--inline">
                <ReferenceImageStack
                  v-if="imageAttachments.length"
                  :attachments="imageAttachments"
                  :single="agent.galleryReferenceLock"
                  :smart-reference="agent.galleryReferenceLock"
                  :replaceable="false"
                  @add="triggerFileInput"
                  @remove="agent.removeAttachment"
                />
                <button
                  v-else
                  type="button"
                  class="ref-upload-card"
                  @click="triggerFileInput"
                >
                  <Plus :size="16" stroke-width="1.75" />
                  <span>参考内容</span>
                </button>
              </div>
              <textarea
                v-model="agent.inputText"
                class="composer-input"
                :placeholder="inputPlaceholder"
                rows="3"
                @keydown="onKeydown"
              />
            </div>

            <div class="composer-footer">
                <div class="footer-left">
                  <button
                    :ref="bindModeTrigger"
                    type="button"
                    class="composer-pill create-composer-trigger mode-pill"
                    :class="{ active: modeMenuOpen }"
                    @click="toggleModeMenu"
                  >
                    <component :is="currentMode?.icon ?? Sparkles" :size="14" />
                    {{ currentMode?.label ?? 'Agent 创作' }}
                    <ChevronDown :size="12" class="chevron" :class="{ open: modeMenuOpen }" />
                  </button>
                  <Teleport to="body">
                    <div
                      v-if="modeMenuOpen"
                      :ref="bindModePanel"
                      class="composer-popover create-composer-popover mode-menu"
                      :style="modePanelStyle"
                      @click.stop
                    >
                      <p class="menu-kicker">创作类型</p>
                      <button
                        v-for="m in modes"
                        :key="m.id"
                        type="button"
                        class="mode-item"
                        :class="{ active: agent.createMode === m.id }"
                        @click="pickMode(m.id)"
                      >
                        <component :is="m.icon" :size="16" />
                        <span class="mode-text">
                          <span class="mode-label">{{ m.label }}</span>
                          <span class="mode-desc">{{ m.desc }}</span>
                        </span>
                        <Check v-if="agent.createMode === m.id" :size="16" class="mode-check" />
                      </button>
                    </div>
                  </Teleport>
                  <GenPreferencesPopover v-if="agent.createMode !== 'agent'" />
                  <CreativeSkillsMenu v-if="agent.createMode !== 'agent'" />
                </div>

                <div class="footer-right">
                  <button
                    v-if="agent.createMode !== 'agent'"
                    :ref="bindModelTrigger"
                    type="button"
                    class="model-picker create-composer-trigger"
                    :class="{ active: modelMenuOpen }"
                    @click="toggleModelMenu"
                  >
                    <ModelLogo v-if="selectedModel" :model="selectedModel" :size="18" />
                    <span class="model-name">{{ selectedModel?.name ?? '选择模型' }}</span>
                    <ChevronDown :size="14" class="chevron" :class="{ open: modelMenuOpen }" />
                  </button>
                  <Teleport to="body">
                    <div
                      v-if="modelMenuOpen && availableModels.length"
                      :ref="bindModelPanel"
                      class="composer-popover create-composer-popover mode-menu model-menu"
                      :style="modelPanelStyle"
                      @click.stop
                    >
                      <div class="popover-head">
                        <span>选择模型</span>
                        <button type="button" class="popover-close" title="关闭" @click.stop="closeComposerMenus">
                          <X :size="16" />
                        </button>
                      </div>
                      <button
                        v-for="m in availableModels"
                        :key="m.id"
                        type="button"
                        class="model-option"
                        :class="{ active: selectedModel?.id === m.id }"
                        @click="selectModel(m.id)"
                      >
                        <ModelLogo :model="m" :size="20" />
                        <span>{{ m.name }}</span>
                        <Check v-if="selectedModel?.id === m.id" :size="16" class="mode-check" />
                      </button>
                    </div>
                  </Teleport>

                  <button
                    type="button"
                    class="send-btn"
                    :class="{ ready: canSend(), waiting: isCreateBusy }"
                    :disabled="!canSend() && !isCreateBusy"
                    title="生成"
                    @click="sendFromStudio()"
                  >
                    <Loader2 v-if="isCreateBusy" :size="18" class="om-loading-spinner" />
                    <ArrowUp v-else :size="18" stroke-width="2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
      </section>
    </div>

    <!-- ③ 作品区：全宽拉通 -->
    <section ref="gallerySection" class="gallery-section">
        <div class="gallery-nav">
          <div class="gallery-nav-top">
            <div class="gallery-tabs">
              <button
                v-for="tab in galleryMainTabs"
                :key="tab.id"
                type="button"
                class="gallery-tab"
                :class="{ active: galleryMainTab === tab.id }"
                @click="selectGalleryMainTab(tab.id)"
              >
                <component :is="tab.icon" :size="14" />
                {{ tab.label }}
              </button>
            </div>
            <label class="gallery-search embedded-field">
              <Search :size="14" />
              <input
                v-model="gallerySearch"
                type="search"
                :placeholder="gallerySearchPlaceholder"
              />
            </label>
          </div>
          <div v-if="galleryMainTab === 'mine'" class="gallery-nav-sub">
            <div class="gallery-subtabs">
              <button
                v-for="tab in galleryMineSubTabs"
                :key="tab.id"
                type="button"
                class="gallery-subtab"
                :class="{ active: galleryMediaTab === tab.id }"
                @click="galleryMediaTab = tab.id"
              >
                <component :is="tab.icon" :size="12" />
                {{ tab.label }}
              </button>
            </div>
          </div>
        </div>

        <WorksWaterfall
          :search-query="gallerySearch"
          :media-type="galleryEffectiveMediaType"
          :source="gallerySource"
        />
    </section>

    <ImageEditOverlay />

    <!-- 下滑后底部浮动输入条 -->
    <div
      class="floating-composer"
      :class="{
        visible: showFloatingComposer,
        expanded: floatingExpanded && agent.createMode !== 'digitalHuman',
        'composer-menu-active': floatingExpanded && composerMenuActive,
      }"
      aria-hidden="false"
    >
      <div v-if="showFloatingComposer" class="composer-gen-pill-slot composer-gen-pill-slot--float">
        <CreateGenerationPill @view="locateSessionInGallery" />
      </div>
      <LipSyncComposerCard
        v-if="agent.createMode === 'digitalHuman'"
        ref="floatingLipsyncRef"
        collapsible
        embedded
        popover-placement="above"
        :image-url="digitalHumanImageUrl"
        :busy="isCreateBusy"
        :pick-ref-file="triggerFileInput"
        @send="sendFromStudio"
      />
      <div
        v-else
        ref="floatingBarRef"
        class="floating-bar"
        :class="{
          expanded: floatingExpanded,
          'floating-bar--has-docs': floatingExpanded && docAttachments.length > 0,
        }"
        @click="onFloatingBarClick"
      >
        <div
          class="floating-expand-slot floating-attachments-slot"
          :class="{ open: floatingExpanded && docAttachments.length > 0 }"
        >
          <div class="floating-expand-inner">
            <div v-if="docAttachments.length" class="attachments floating-attachments">
              <ChatAttachmentCard
                v-for="a in docAttachments"
                :key="a.id"
                :attachment="a"
                @remove="agent.removeAttachment(a.id)"
              />
            </div>
          </div>
        </div>

        <div class="floating-main-row">
          <div class="floating-body">
            <div
              v-if="floatingExpanded"
              class="ref-upload-wrap ref-upload-wrap--inline"
            >
              <ReferenceImageStack
                v-if="imageAttachments.length"
                :attachments="imageAttachments"
                compact
                :single="agent.galleryReferenceLock"
                :smart-reference="agent.galleryReferenceLock"
                :replaceable="false"
                @add="triggerFileInput"
                @remove="agent.removeAttachment"
              />
              <button
                v-else
                type="button"
                class="ref-upload-card"
                @click="triggerFileInput"
              >
                <Plus :size="16" stroke-width="1.75" />
                <span>参考内容</span>
              </button>
            </div>
            <textarea
              ref="floatingInputRef"
              v-model="agent.inputText"
              class="floating-input"
              :class="{ expanded: floatingExpanded }"
              :placeholder="inputPlaceholder"
              rows="1"
              @focus="expandFloatingComposer"
              @blur="onFloatingInputBlur"
              @keydown="onKeydown"
            />
          </div>

          <button
            type="button"
            class="send-btn floating-send"
            :class="{ 'floating-send--hidden': floatingExpanded, ready: canSend(), waiting: isCreateBusy }"
            :disabled="!canSend() && !isCreateBusy"
            title="生成"
            tabindex="-1"
            @click="sendFromStudio()"
          >
            <Loader2 v-if="isCreateBusy" :size="18" class="om-loading-spinner" />
            <ArrowUp v-else :size="18" stroke-width="2.5" />
          </button>
        </div>

        <div class="floating-expand-slot floating-footer-slot" :class="{ open: floatingExpanded }">
          <div class="floating-expand-inner">
            <div class="composer-footer floating-footer">
          <div class="footer-left">
            <button
              :ref="bindFloatingModeTrigger"
              type="button"
              class="composer-pill create-composer-trigger mode-pill"
              :class="{ active: floatingModeMenuOpen }"
              @click="toggleFloatingModeMenu"
            >
              <component :is="currentMode?.icon ?? Sparkles" :size="14" />
              {{ currentMode?.label ?? 'Agent 创作' }}
              <ChevronDown :size="12" class="chevron" :class="{ open: floatingModeMenuOpen }" />
            </button>
            <Teleport to="body">
              <div
                v-if="floatingModeMenuOpen"
                :ref="bindFloatingModePanel"
                class="composer-popover create-composer-popover mode-menu"
                :style="floatingModePanelStyle"
                @click.stop
              >
                <p class="menu-kicker">创作类型</p>
                <button
                  v-for="m in modes"
                  :key="m.id"
                  type="button"
                  class="mode-item"
                  :class="{ active: agent.createMode === m.id }"
                  @click="pickMode(m.id)"
                >
                  <component :is="m.icon" :size="16" />
                  <span class="mode-text">
                    <span class="mode-label">{{ m.label }}</span>
                    <span class="mode-desc">{{ m.desc }}</span>
                  </span>
                  <Check v-if="agent.createMode === m.id" :size="16" class="mode-check" />
                </button>
              </div>
            </Teleport>
            <GenPreferencesPopover v-if="agent.createMode !== 'agent'" popover-placement="above" />
            <CreativeSkillsMenu v-if="agent.createMode !== 'agent'" popover-placement="above" />
          </div>

          <div class="footer-right">
            <button
              v-if="agent.createMode !== 'agent'"
              :ref="bindFloatingModelTrigger"
              type="button"
              class="model-picker create-composer-trigger"
              :class="{ active: floatingModelMenuOpen }"
              @click="toggleFloatingModelMenu"
            >
              <ModelLogo v-if="selectedModel" :model="selectedModel" :size="18" />
              <span class="model-name">{{ selectedModel?.name ?? '选择模型' }}</span>
              <ChevronDown :size="14" class="chevron" :class="{ open: floatingModelMenuOpen }" />
            </button>
            <Teleport to="body">
              <div
                v-if="floatingModelMenuOpen && availableModels.length"
                :ref="bindFloatingModelPanel"
                class="composer-popover create-composer-popover mode-menu model-menu"
                :style="floatingModelPanelStyle"
                @click.stop
              >
                <div class="popover-head">
                  <span>选择模型</span>
                  <button type="button" class="popover-close" title="关闭" @click.stop="closeComposerMenus">
                    <X :size="16" />
                  </button>
                </div>
                <button
                  v-for="m in availableModels"
                  :key="m.id"
                  type="button"
                  class="model-option"
                  :class="{ active: selectedModel?.id === m.id }"
                  @click="selectModel(m.id)"
                >
                  <ModelLogo :model="m" :size="20" />
                  <span>{{ m.name }}</span>
                  <Check v-if="selectedModel?.id === m.id" :size="16" class="mode-check" />
                </button>
              </div>
            </Teleport>

            <button
              type="button"
              class="send-btn"
              :class="{ ready: canSend(), waiting: isCreateBusy }"
              :disabled="!canSend() && !isCreateBusy"
              title="生成"
              @click="sendFromStudio()"
            >
              <Loader2 v-if="isCreateBusy" :size="18" class="om-loading-spinner" />
              <ArrowUp v-else :size="18" stroke-width="2.5" />
            </button>
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="scroll-top-btn"
      :class="{ visible: showScrollTop }"
      title="回到顶部"
      aria-label="回到顶部"
      @click="scrollToTop"
    >
      <ChevronsUp :size="18" />
    </button>

    <input
      ref="fileInput"
      type="file"
      :accept="fileAccept"
      multiple
      hidden
      @change="onFiles"
    />

    <Teleport to="body">
      <div
        v-if="composerMenuActive"
        class="anchored-popover-backdrop create-composer-backdrop"
        aria-hidden="true"
        @click="closeComposerMenus"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

$floating-ease-expand: cubic-bezier(0.22, 1, 0.36, 1);
$floating-ease-collapse: cubic-bezier(0.36, 0, 0.12, 1);
$floating-duration-expand: 0.44s;
$floating-duration-collapse: 0.52s;

.create-studio {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 32px 0 120px;
}

.create-hero-zone {
  width: 100%;
  max-width: $chat-column-max;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: visible;
}

.hero {
  text-align: center;
  padding-top: min(4vh, 32px);
}

.hero-title {
  font-size: clamp(22px, 3.2vw, 30px);
  font-weight: 600;
  color: $text-primary;
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.hero-mode-slot {
  display: inline-grid;
  margin: 0 4px;
  vertical-align: baseline;
  letter-spacing: normal;
}

.hero-mode-ghost,
.hero-mode-live {
  grid-area: 1 / 1;
}

.hero-mode-ghost {
  visibility: hidden;
  user-select: none;
  pointer-events: none;
  font-weight: 700;
}

.hero-mode-live {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  white-space: nowrap;
}

.hero-mode-text {
  display: inline-block;
  background: var(--brand-text-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-mode-cursor {
  flex: none;
  display: block;
  width: 2px;
  height: 0.88em;
  margin-left: 10px;
  background: $accent;
  border-radius: 1px;
  animation: hero-cursor-blink 1s step-end infinite;
}

@keyframes hero-cursor-blink {
  0%,
  49% {
    opacity: 1;
  }

  50%,
  100% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-mode-cursor {
    animation: none;
    opacity: 1;
  }
}

.composer-wrap {
  position: relative;
  overflow: visible;

  &.composer-menu-active {
    z-index: 10002;
  }
}

.composer-gen-pill-slot {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 6;
  transform: translateY(calc(-100% - 10px));
  pointer-events: none;

  :deep(.create-gen-pill) {
    pointer-events: auto;
  }

  &--float {
    position: absolute;
    top: auto;
    bottom: calc(100% + 10px);
    right: 0;
    transform: none;
  }
}

.composer-inner {
  width: 100%;
  overflow: visible;
}

.composer-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  padding: 8px 0 0 12px;
  overflow: visible;
}

.ref-upload-wrap {
  position: relative;
  flex-shrink: 0;
  z-index: 4;
  overflow: visible;

  &--inline {
    align-self: flex-start;
    margin-top: 0;
  }

  &--float {
    flex-shrink: 0;
    z-index: 5;
    align-self: center;
    display: flex;
    align-items: center;

    :deep(.ref-image-stack) {
      transform-origin: center center;
    }

    &:hover :deep(.ref-image-stack:not(.expanded)) {
      transform: rotate(-8deg) scale(1.10);
    }
  }

  &:hover {
    z-index: 20;
  }

  :deep(.ref-image-stack) {
    transform: rotate(-8deg);
    transform-origin: center bottom;
    transition:
      transform 0.72s cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 0.3s ease,
      filter 0.48s ease;

    &.expanded {
      transform: rotate(0deg) scale(1);
    }
  }

  &:hover :deep(.ref-image-stack) {
    z-index: 30;
    filter: drop-shadow(0 8px 16px rgba(15, 23, 42, 0.12));
  }

  &:hover :deep(.ref-image-stack:not(.expanded)) {
    transform: rotate(-8deg) scale(1.10);
  }

  &:hover :deep(.ref-image-stack.expanded) {
    transform: rotate(0deg) scale(1);
  }
}

.ref-upload-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 52px;
  height: 68px;
  border-radius: 10px;
  border: 1.5px dashed color-mix(in srgb, var(--composer-muted) 55%, transparent);
  background: var(--composer-pill-bg);
  color: var(--composer-muted);
  font-size: 9px;
  line-height: 1.2;
  transform: rotate(-8deg);
  transform-origin: center bottom;
  transition:
    transform 0.28s cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 0.25s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    z-index 0s;

  span {
    max-width: 40px;
    text-align: center;
  }

  &:hover {
    z-index: 30;
    transform: rotate(-8deg) scale(1.18);
    box-shadow: var(--glass-float-shadow, $shadow-md);
    border-color: rgba($accent, 0.45);
    color: var(--composer-text);
  }
}

.ref-upload-wrap--float .ref-upload-card {
  width: 38px;
  height: 50px;
  gap: 3px;
  font-size: 7px;
  border-radius: 8px;
  transform: rotate(-8deg);
  transform-origin: center center;
  transition:
    width $floating-duration-expand $floating-ease-expand,
    height $floating-duration-expand $floating-ease-expand,
    font-size $floating-duration-expand $floating-ease-expand,
    border-radius $floating-duration-expand $floating-ease-expand,
    transform 0.28s cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 0.25s ease,
    border-color 0.2s ease,
    color 0.2s ease;

  span {
    max-width: 34px;
  }

  &:hover {
    transform: rotate(-8deg) scale(1.14);
  }
}

.composer-card {
  @include cosmic.cosmic-glass-frost(22px);
  display: flex;
  flex-direction: column;
  min-height: $composer-min-height;
  box-sizing: border-box;
  padding: 12px 14px 10px;
  background: var(--composer-bg, var(--glass-fill-gradient));
  transition: box-shadow 0.2s;
  overflow: visible;
  border: none;
  box-shadow: var(--glass-float-shadow, $shadow-md);

  &:focus-within {
    box-shadow: var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md));
  }

  :deep(.model-logo) {
    background: var(--composer-logo-bg);
  }
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.composer-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 68px;
  resize: none;
  overflow-y: auto;
  padding: 2px 4px 6px 0;
  font-size: 15px;
  line-height: 1.55;
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
  color: var(--composer-text);
  scrollbar-width: none;

  &:focus,
  &:focus-visible {
    outline: none;
    border: none;
    box-shadow: none;
  }

  &::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  &::placeholder {
    color: var(--composer-placeholder);
  }
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  min-height: 32px;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.footer-left {
  flex: 1;
  flex-wrap: wrap;
}

.floating-composer {
  position: fixed;
  bottom: 20px;
  --sidebar-offset: #{$sidebar-expanded-width};
  left: calc(var(--sidebar-offset) + (100vw - var(--sidebar-offset)) * 0.5);
  z-index: 10001;
  width: min($chat-column-max, calc(100vw - var(--sidebar-offset) - 48px));
  transform: translateX(-50%) translateY(calc(100% + 32px));
  opacity: 0;
  pointer-events: none;
  overflow: visible;
  transition:
    transform 0.52s $floating-ease-expand,
    opacity 0.44s $floating-ease-expand;

  &.visible {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
    pointer-events: auto;
  }

  &.composer-menu-active {
    z-index: 10002;
  }

  .composer-gen-pill-slot--float {
    pointer-events: none;

    :deep(.create-gen-pill) {
      pointer-events: auto;
    }
  }
}

html[data-sidebar-collapsed='true'] .floating-composer {
  --sidebar-offset: #{$sidebar-collapsed-width};
}

.floating-bar {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-height: $floating-composer-collapsed-height;
  padding: 0 12px 0 16px;
  border-radius: 24px;
  @include cosmic.cosmic-glass-frost(24px);
  background: var(--composer-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
  overflow: hidden;
  border: none;
  transition:
    max-height $floating-duration-collapse $floating-ease-collapse,
    min-height $floating-duration-collapse $floating-ease-collapse,
    padding $floating-duration-collapse $floating-ease-collapse,
    border-radius $floating-duration-collapse $floating-ease-collapse,
    box-shadow 0.35s ease;

  &:focus-within {
    box-shadow: var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md));
  }

  &.expanded {
    max-height: $composer-min-height;
    min-height: $composer-min-height;
    padding: 12px 14px 12px;
    border-radius: 22px;
    overflow: visible;
    transition:
      max-height $floating-duration-expand $floating-ease-expand,
      min-height $floating-duration-expand $floating-ease-expand,
      padding $floating-duration-expand $floating-ease-expand,
      border-radius $floating-duration-expand $floating-ease-expand,
      box-shadow 0.35s ease;
  }

  &.expanded.floating-bar--has-docs {
    max-height: calc(#{$composer-min-height} + 128px);
  }
}

.floating-footer-slot {
  flex-shrink: 0;
  order: 2;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows $floating-duration-collapse $floating-ease-collapse;

  &.open {
    grid-template-rows: 1fr;
    transition: grid-template-rows $floating-duration-expand $floating-ease-expand;

    .floating-expand-inner {
      padding-top: 12px;
    }
  }
}

.floating-expand-slot {
  flex-shrink: 0;
  overflow: hidden;
}

.floating-attachments-slot {
  order: 0;

  &:not(.open) {
    max-height: 0;
    overflow: hidden;
    margin: 0;
  }
}

.floating-expand-inner {
  min-height: 0;
  overflow: hidden;
}

.floating-attachments {
  margin-bottom: 10px;
}

.floating-main-row {
  order: 1;
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: $floating-composer-collapsed-height;
  flex-shrink: 0;
  transition:
    min-height $floating-duration-collapse $floating-ease-collapse,
    gap $floating-duration-collapse $floating-ease-collapse;

  .floating-bar.expanded & {
    align-items: flex-start;
    min-height: 102px;
    gap: 0;
    overflow: visible;
    transition:
      min-height $floating-duration-expand $floating-ease-expand,
      gap $floating-duration-expand $floating-ease-expand;
  }
}

.floating-body {
  display: flex;
  flex: 1;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
  padding: 0;
  transition:
    gap $floating-duration-collapse $floating-ease-collapse,
    padding $floating-duration-collapse $floating-ease-collapse;

  .floating-bar.expanded & {
    align-items: flex-start;
    gap: 14px;
    padding: 8px 0 0 12px;
    overflow: visible;
    transition:
      gap $floating-duration-expand $floating-ease-expand,
      padding $floating-duration-expand $floating-ease-expand;
  }
}

.ref-upload-icon {
  display: inline-flex;
  transform: scale(0.72);
  transform-origin: center center;

  &.expanded {
    transform: scale(1);
  }
}

.floating-input {
  flex: 1;
  min-width: 0;
  height: $floating-composer-collapsed-height;
  min-height: $floating-composer-collapsed-height;
  max-height: $floating-composer-collapsed-height;
  resize: none;
  border: none;
  outline: none;
  box-shadow: none;
  background: transparent;
  font-size: 14px;
  line-height: $floating-composer-collapsed-height;
  color: var(--composer-text);
  padding: 0 4px 0 0;
  overflow: hidden;
  box-sizing: border-box;
  scrollbar-width: none;
  transition:
    height $floating-duration-collapse $floating-ease-collapse,
    min-height $floating-duration-collapse $floating-ease-collapse,
    max-height $floating-duration-collapse $floating-ease-collapse,
    font-size $floating-duration-collapse $floating-ease-collapse,
    line-height $floating-duration-collapse $floating-ease-collapse,
    padding $floating-duration-collapse $floating-ease-collapse;

  &:focus,
  &:focus-visible {
    outline: none;
    border: none;
    box-shadow: none;
  }

  &::-webkit-scrollbar {
    display: none;
  }

  &::placeholder {
    color: var(--composer-placeholder);
  }

  &.expanded {
    height: auto;
    min-height: 68px;
    max-height: none;
    font-size: 15px;
    line-height: 1.55;
    padding: 2px 4px 6px 0;
    overflow-y: auto;
    transition:
      height $floating-duration-expand $floating-ease-expand,
      min-height $floating-duration-expand $floating-ease-expand,
      max-height $floating-duration-expand $floating-ease-expand,
      font-size $floating-duration-expand $floating-ease-expand,
      line-height $floating-duration-expand $floating-ease-expand,
      padding $floating-duration-expand $floating-ease-expand;
  }
}

.floating-footer {
  pointer-events: none;

  .floating-bar.expanded & {
    pointer-events: auto;
  }
}

.floating-send {
  flex-shrink: 0;
  transition:
    opacity $floating-duration-collapse $floating-ease-collapse,
    transform $floating-duration-collapse $floating-ease-collapse,
    visibility 0s linear $floating-duration-collapse;

  &--hidden {
    position: absolute;
    right: 0;
    top: 50%;
    opacity: 0;
    transform: translateY(-50%) scale(0.82);
    pointer-events: none;
    visibility: hidden;
    transition:
      opacity $floating-duration-expand $floating-ease-expand,
      transform $floating-duration-expand $floating-ease-expand,
      visibility 0s linear $floating-duration-expand;
  }

  .floating-bar.expanded & {
    transition:
      opacity $floating-duration-expand $floating-ease-expand,
      transform $floating-duration-expand $floating-ease-expand,
      visibility 0s linear $floating-duration-expand;
  }
}

@media (prefers-reduced-motion: reduce) {
  .floating-bar,
  .floating-main-row,
  .floating-body,
  .floating-input,
  .floating-footer-slot,
  .floating-send {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}

.scroll-top-btn {
  position: fixed;
  right: 24px;
  bottom: 96px;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: var(--composer-menu-text);
  background: var(--composer-menu-bg);
  border: var(--glass-border-width, 0.5px) solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-sm);
  opacity: 0;
  pointer-events: none;
  transform: translateY(12px);
  transition:
    opacity 0.25s ease,
    transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1),
    background 0.15s ease;

  &.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  &:hover {
    background: var(--composer-option-hover);
  }
}

.composer-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border);
  background: var(--composer-pill-bg);
  font-size: 12px;
  color: var(--composer-pill-text);
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover,
  &.active {
    background: var(--composer-pill-hover-bg);
    color: var(--composer-text);
    border-color: color-mix(in srgb, var(--composer-border-focus) 45%, transparent);
  }
}

.model-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--composer-muted);
  background: var(--composer-pill-bg);
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border);
  transition: background 0.15s, border-color 0.15s;

  &:hover,
  &.active {
    background: var(--composer-picker-hover);
    color: var(--composer-text);
  }

  .model-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    opacity: 0.55;
    transition: transform 0.2s;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $accent-light;
  color: $text-muted;
  transition: background 0.15s, color 0.15s;

  &.ready {
    background: var(--btn-primary-gradient, $accent);
    color: $btn-primary-text;

    &:hover {
      filter: brightness(1.08);
    }
  }

  &.waiting {
    background: var(--btn-primary-gradient, $accent);
    color: $btn-primary-text;
    cursor: wait;
  }

  &:disabled {
    cursor: not-allowed;
  }
}

.quick-card {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 168px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid $border-light;
  background: var(--bg-card);
  text-align: left;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: $shadow-sm;
  }

  &.active {
    border-color: rgba($accent-cyan, 0.45);
    box-shadow: 0 0 0 1px rgba($accent-cyan, 0.2);
  }
}

.quick-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba($accent, 0.1);
  color: $accent;
  flex-shrink: 0;
}

.quick-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quick-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.quick-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba($accent-cyan, 0.15);
  color: $accent-cyan;
}

.quick-desc {
  font-size: 11px;
  color: $text-muted;
}

.gallery-section {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 24px;
  box-sizing: border-box;
}

.gallery-nav {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gallery-nav-top {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.gallery-nav-sub {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 2px;
}

.gallery-tabs {
  display: flex;
  gap: 4px;
}

.gallery-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 13px;
  color: $text-secondary;
  transition:
    background 0.22s ease,
    color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  :deep(svg) {
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  &:hover:not(.active) {
    color: $text-primary;
    background: color-mix(in srgb, $accent 8%, transparent);
    transform: translateY(-1px);

    :deep(svg) {
      transform: scale(1.1);
    }
  }

  &.active {
    background: var(--bg-card);
    color: $text-primary;
    font-weight: 600;
    box-shadow: $shadow-sm;
  }

  &.active:hover {
    box-shadow: $shadow-sm, 0 4px 14px rgba($accent, 0.14);
    transform: translateY(-1px);
  }
}

.gallery-subtabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba($text-muted, 0.06);
  border: 1px solid $border-light;
}

.gallery-subtab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12px;
  color: $text-muted;
  transition:
    background 0.22s ease,
    color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  :deep(svg) {
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  &:hover:not(.active) {
    color: $text-primary;
    background: color-mix(in srgb, $accent 10%, transparent);
    transform: scale(1.03);

    :deep(svg) {
      transform: scale(1.12);
    }
  }

  &.active {
    background: var(--bg-card);
    color: $text-primary;
    font-weight: 600;
    box-shadow: $shadow-sm;
  }

  &.active:hover {
    box-shadow: $shadow-sm, 0 3px 10px rgba($accent, 0.12);
    transform: scale(1.02);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-tab,
  .gallery-subtab {
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      transform: none;
    }

    :deep(svg) {
      transition: none;
      transform: none !important;
    }
  }
}

.gallery-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 310px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid $border-light;
  background: var(--bg-card);
  color: $text-muted;

  input {
    flex: 1;
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
}

.menu-kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--composer-muted);
  letter-spacing: 0.04em;
  padding: 6px 10px 4px;
}

.mode-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  min-width: 220px;
}

.mode-item,
.model-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  text-align: left;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    background: var(--composer-option-hover);
    font-weight: 600;
  }

  > svg:first-child {
    color: $accent;
    flex-shrink: 0;
  }
}

.mode-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mode-label {
  font-weight: 600;
}

.mode-desc {
  font-size: 11px;
  color: var(--composer-muted);
}

.mode-check {
  flex-shrink: 0;
  color: $accent;
}

.model-menu {
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  min-width: 240px;
}

.popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--composer-muted);
  letter-spacing: 0.04em;
}

.popover-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: var(--composer-muted);

  &:hover {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }
}
</style>

<style lang="scss">
@use '../styles/cosmic-glass.scss' as cosmic;
@use '../styles/variables.scss' as *;

.create-composer-backdrop {
  z-index: 10001;
}

.create-composer-popover.mode-menu,
.create-composer-popover.model-menu {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
