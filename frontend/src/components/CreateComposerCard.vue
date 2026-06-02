<script setup lang="ts">
import {
  ArrowUp,
  Check,
  ChevronDown,
  Image,
  Loader2,
  Plus,
  ScanFace,
  Sparkles,
  Video,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch, type VNodeRef } from 'vue'
import { ACCEPT_CHAT_FILES } from '../config/constants'
import { useAnchoredPopover } from '../composables/useAnchoredPopover'
import {
  composerSubmenuOpenKey,
  createComposerMenuCloseAllKey,
  createMenuCloseSignalKey,
  toggleExclusiveComposerMenu,
} from '../composables/useCreateComposerMenus'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import type { CreateMode, SkillId } from '../types/agent'
import { applyAspectRatioToPrompt, applyVideoPrefsToPrompt } from '../utils/aspectRatioPrompt'
import { isModelReady } from '../utils/resolveModel'
import ChatAttachmentCard from './ChatAttachmentCard.vue'
import CreativeSkillsMenu from './CreativeSkillsMenu.vue'
import GenPreferencesPopover from './GenPreferencesPopover.vue'
import ModelLogo from './ModelLogo.vue'
import ReferenceImageStack from './ReferenceImageStack.vue'

const props = withDefaults(
  defineProps<{
    popoverPlacement?: 'below' | 'above'
    submenuPlacement?: 'below' | 'above'
    /** 点击/聚焦后展开完整输入区（与创作页浮动输入条一致） */
    collapsible?: boolean
    /** collapsible 时初始是否展开（编辑页默认展开） */
    defaultExpanded?: boolean
    /** 失焦后是否自动折叠（编辑页由滚动控制，设为 false） */
    autoCollapseOnBlur?: boolean
    placeholder?: string
    /** 外部处理中（如编辑页生成中） */
    busy?: boolean
    /** 参考图对应作品的生成时间，有值时 hover 展示 */
    referenceGeneratedAt?: number
  }>(),
  {
    popoverPlacement: 'below',
    submenuPlacement: 'below',
    collapsible: false,
    defaultExpanded: false,
    autoCollapseOnBlur: true,
    placeholder: undefined,
    busy: false,
    referenceGeneratedAt: undefined,
  },
)

const emit = defineEmits<{
  send: []
}>()

const agent = useAgentStore()
const settings = useSettingsStore()
const cardRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const expanded = ref(props.collapsible && props.defaultExpanded)
const suspendAutoCollapse = ref(false)
const menuCloseSignal = ref(0)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

const modePopover = useAnchoredPopover({ minWidth: 220, fitContent: true, placement: props.popoverPlacement })
const modelPopover = useAnchoredPopover({
  align: 'right',
  minWidth: 240,
  maxPanelHeight: 280,
  placement: props.popoverPlacement,
})

const modeMenuOpen = modePopover.open
const modelMenuOpen = modelPopover.open

const openSubmenus = reactive(new Set<string>())
provide(composerSubmenuOpenKey, (id: string, open: boolean) => {
  if (open) openSubmenus.add(id)
  else openSubmenus.delete(id)
})

const composerMenuActive = computed(
  () => modePopover.open.value || modelPopover.open.value || openSubmenus.size > 0,
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

const modePanelStyle = computed(() => modePopover.panelStyle.value)
const modelPanelStyle = computed(() => modelPopover.panelStyle.value)

provide(createMenuCloseSignalKey, menuCloseSignal)

function closeAllComposerMenus() {
  modePopover.close()
  modelPopover.close()
  menuCloseSignal.value += 1
}

provide(createComposerMenuCloseAllKey, closeAllComposerMenus)

const modes = [
  { id: 'agent' as const, label: 'Agent 创作', desc: '与 Agent 一起创作', icon: Sparkles },
  { id: 'image' as const, label: '图片生成', desc: '智能美学提升', icon: Image },
  { id: 'video' as const, label: '视频生成', desc: '一镜到底', icon: Video },
  { id: 'digitalHuman' as const, label: '数字人', desc: '角色对口型说话', icon: ScanFace },
]

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

const currentMode = computed(() => modes.find((m) => m.id === agent.createMode))

const inputPlaceholder = computed(() => {
  if (props.placeholder?.trim()) return props.placeholder
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

const imageAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind === 'image'),
)

const docAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind !== 'image'),
)

const canSend = computed(
  () =>
    !agent.isCreateProcessing &&
    !props.busy &&
    !agent.pendingAttachments.some((a) => a.loading) &&
    (agent.inputText.trim().length > 0 || agent.pendingAttachments.length > 0),
)

const isBusy = computed(() => agent.isCreateProcessing || props.busy)

function shouldKeepExpanded() {
  if (composerMenuActive.value || suspendAutoCollapse.value) return true
  const active = document.activeElement
  if (cardRef.value && active && cardRef.value.contains(active)) return true
  if (active instanceof Element && active.closest('.create-composer-popover')) return true
  return false
}

/** 滚动折叠时：不因输入框聚焦而阻止，仅菜单/文件选择等交互中保持展开 */
function shouldKeepExpandedOnScroll() {
  if (composerMenuActive.value || suspendAutoCollapse.value) return true
  const active = document.activeElement
  if (active instanceof Element && active.closest('.create-composer-popover')) return true
  return false
}

function scheduleCollapseIfUnfocused() {
  if (!props.collapsible || !expanded.value) return
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = window.setTimeout(() => {
    collapseTimer = null
    if (shouldKeepExpanded()) return
    collapseComposer()
  }, 120)
}

function onInputBlur() {
  if (!props.collapsible || !props.autoCollapseOnBlur) return
  scheduleCollapseIfUnfocused()
}

function onWindowRefocus() {
  if (suspendAutoCollapse.value) {
    suspendAutoCollapse.value = false
    if (expanded.value) {
      void nextTick(() => inputRef.value?.focus())
    }
    return
  }
  if (!props.autoCollapseOnBlur) return
  scheduleCollapseIfUnfocused()
}

function expandComposer(focus = true) {
  if (!props.collapsible) return
  const wasExpanded = expanded.value
  expanded.value = true
  if (!focus || wasExpanded) return
  void nextTick(() => {
    requestAnimationFrame(() => inputRef.value?.focus())
  })
}

function isExpanded() {
  return expanded.value
}

function collapseComposer() {
  if (!props.collapsible || !expanded.value) return
  expanded.value = false
  closeComposerMenus()
  window.setTimeout(() => inputRef.value?.blur(), 320)
}

function onCollapsibleBarClick(e: MouseEvent) {
  if (!props.collapsible || expanded.value) return
  const el = e.target as HTMLElement
  if (el.closest('.composer-send-collapsed')) return
  expandComposer()
}

async function onFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) await agent.addAttachments(files)
  if (fileInput.value) fileInput.value.value = ''
  suspendAutoCollapse.value = false
}

function triggerFileInput() {
  if (props.collapsible) {
    expanded.value = true
    suspendAutoCollapse.value = true
  }
  fileInput.value?.click()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send() {
  if (!canSend.value) return
  emit('send')
}

function pickMode(id: CreateMode) {
  agent.createMode = id
  closeComposerMenus()
  ensureDefaultModel()
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

watch(
  () => menuCloseSignal.value,
  () => {
    modePopover.close()
    modelPopover.close()
  },
)

watch(
  () => agent.createMode,
  (mode, prev) => {
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
  },
)

watch(composerMenuActive, (active) => {
  if (props.collapsible && active) {
    expanded.value = true
  } else if (props.collapsible && props.autoCollapseOnBlur) {
    scheduleCollapseIfUnfocused()
  }
})

watch(availableModels, ensureDefaultModel, { deep: true })

onMounted(() => {
  window.addEventListener('focus', onWindowRefocus)
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowRefocus)
  if (collapseTimer) clearTimeout(collapseTimer)
})

defineExpose({
  collapseComposer,
  expandComposer,
  isExpanded,
  shouldKeepExpanded,
  shouldKeepExpandedOnScroll,
})
</script>

<template>
  <div
    ref="cardRef"
    class="composer-card"
    :class="{
      'composer-menu-active': composerMenuActive,
      'composer-card--collapsible': collapsible,
      expanded: collapsible && expanded,
      'composer-card--has-docs': collapsible && expanded && docAttachments.length,
    }"
    @click="collapsible ? onCollapsibleBarClick($event) : undefined"
  >
    <div
      v-if="collapsible"
      class="composer-expand-slot composer-attachments-slot"
      :class="{ open: expanded && docAttachments.length > 0 }"
    >
      <div class="composer-expand-inner">
        <div v-if="docAttachments.length" class="attachments">
          <ChatAttachmentCard
            v-for="a in docAttachments"
            :key="a.id"
            :attachment="a"
            @remove="agent.removeAttachment(a.id)"
          />
        </div>
      </div>
    </div>
    <div v-else-if="docAttachments.length" class="attachments">
      <ChatAttachmentCard
        v-for="a in docAttachments"
        :key="a.id"
        :attachment="a"
        @remove="agent.removeAttachment(a.id)"
      />
    </div>

    <div class="composer-main-row" :class="{ 'composer-main-row--static': !collapsible }">
      <div
        class="composer-body"
        :class="{ 'composer-body--collapsible': collapsible, expanded: collapsible && expanded }"
      >
        <div
          v-if="!collapsible || expanded"
          class="ref-upload-wrap ref-upload-wrap--inline"
        >
          <ReferenceImageStack
            v-if="imageAttachments.length"
            :attachments="imageAttachments"
            :generated-at="referenceGeneratedAt"
            @add="triggerFileInput"
            @remove="agent.removeAttachment"
          />
          <button
            v-else
            type="button"
            class="ref-upload-card"
            title="上传参考内容"
            @click.stop="triggerFileInput"
          >
            <Plus :size="16" stroke-width="1.75" />
            <span>参考内容</span>
          </button>
        </div>
        <textarea
          ref="inputRef"
          v-model="agent.inputText"
          class="composer-input"
          :class="{ 'composer-input--collapsible': collapsible, expanded: collapsible && expanded }"
          :placeholder="inputPlaceholder"
          :rows="collapsible ? 1 : 3"
          @focus="collapsible ? expandComposer() : undefined"
          @blur="collapsible ? onInputBlur() : undefined"
          @keydown="onKeydown"
        />
      </div>

      <button
        v-if="collapsible"
        type="button"
        class="send-btn composer-send-collapsed"
        :class="{
          ready: canSend,
          waiting: isBusy,
          'composer-send-collapsed--hidden': expanded,
        }"
        :disabled="!canSend && !isBusy"
        title="生成"
        tabindex="-1"
        @click.stop="send"
      >
        <Loader2 v-if="isBusy" :size="18" class="om-loading-spinner" />
        <ArrowUp v-else :size="18" stroke-width="2.5" />
      </button>
    </div>

    <div
      class="composer-footer-slot"
      :class="{
        open: !collapsible || expanded,
        'composer-footer-slot--static': !collapsible,
      }"
    >
      <div class="composer-expand-inner">
        <div class="composer-footer" :class="{ 'composer-footer--collapsible': collapsible }">
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
        <GenPreferencesPopover
          v-if="agent.createMode !== 'agent'"
          :popover-placement="submenuPlacement"
        />
        <CreativeSkillsMenu
          v-if="agent.createMode !== 'agent'"
          :popover-placement="submenuPlacement"
        />
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
          :class="{ ready: canSend, waiting: isBusy }"
          :disabled="!canSend && !isBusy"
          title="生成"
          @click="send"
        >
          <Loader2 v-if="isBusy" :size="18" class="om-loading-spinner" />
          <ArrowUp v-else :size="18" stroke-width="2.5" />
        </button>
      </div>
        </div>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      :accept="ACCEPT_CHAT_FILES"
      multiple
      hidden
      @change="onFiles"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

$floating-ease-expand: cubic-bezier(0.22, 1, 0.36, 1);
$floating-ease-collapse: cubic-bezier(0.36, 0, 0.12, 1);
$floating-duration-expand: 0.44s;
$floating-duration-collapse: 0.52s;

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

  &.composer-menu-active {
    position: relative;
    z-index: 10002;
  }

  :deep(.model-logo) {
    background: var(--composer-logo-bg);
  }

  &.composer-card--collapsible {
    max-height: $floating-composer-collapsed-height;
    min-height: 0;
    padding: 0 12px 0 16px;
    border-radius: 24px;
    overflow: hidden;
    cursor: text;
    transition:
      max-height $floating-duration-collapse $floating-ease-collapse,
      min-height $floating-duration-collapse $floating-ease-collapse,
      padding $floating-duration-collapse $floating-ease-collapse,
      border-radius $floating-duration-collapse $floating-ease-collapse,
      box-shadow 0.35s ease;

    &.expanded {
      max-height: $composer-min-height;
      min-height: $composer-min-height;
      padding: 12px 14px 10px;
      border-radius: 22px;
      cursor: default;
      overflow: visible;
      transition:
        max-height $floating-duration-expand $floating-ease-expand,
        min-height $floating-duration-expand $floating-ease-expand,
        padding $floating-duration-expand $floating-ease-expand,
        border-radius $floating-duration-expand $floating-ease-expand,
        box-shadow 0.35s ease;
    }

    &.composer-card--has-docs {
      max-height: calc(#{$composer-min-height} + 128px);
    }
  }
}

.composer-expand-slot {
  flex-shrink: 0;
  overflow: hidden;

  &.composer-attachments-slot:not(.open) {
    max-height: 0;
    margin: 0;
  }
}

.composer-expand-inner {
  min-height: 0;
  overflow: hidden;
}

.composer-main-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: $floating-composer-collapsed-height;
  flex-shrink: 0;
  transition:
    min-height $floating-duration-collapse $floating-ease-collapse,
    gap $floating-duration-collapse $floating-ease-collapse;

  &--static {
    display: contents;
  }

  .composer-card--collapsible.expanded & {
    align-items: flex-start;
    min-height: 102px;
    gap: 0;
    overflow: visible;
    transition:
      min-height $floating-duration-expand $floating-ease-expand,
      gap $floating-duration-expand $floating-ease-expand;
  }
}

.composer-footer-slot {
  flex-shrink: 0;
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows $floating-duration-collapse $floating-ease-collapse;

  &--static {
    display: block;
    grid-template-rows: 1fr;
  }

  &.open {
    grid-template-rows: 1fr;
    transition: grid-template-rows $floating-duration-expand $floating-ease-expand;

    .composer-expand-inner {
      padding-top: 12px;
    }
  }
}

.composer-body--collapsible {
  display: flex;
  flex: 1;
  align-items: stretch;
  gap: 10px;
  min-width: 0;
  padding: 0;
  transition:
    gap $floating-duration-collapse $floating-ease-collapse,
    padding $floating-duration-collapse $floating-ease-collapse;

  &.expanded {
    align-items: flex-start;
    gap: 14px;
    padding: 8px 0 0 12px;
    overflow: visible;
    transition:
      gap $floating-duration-expand $floating-ease-expand,
      padding $floating-duration-expand $floating-ease-expand;
  }
}

.composer-input--collapsible {
  height: $floating-composer-collapsed-height;
  min-height: $floating-composer-collapsed-height;
  max-height: $floating-composer-collapsed-height;
  font-size: 14px;
  line-height: $floating-composer-collapsed-height;
  padding: 0 4px 0 0;
  overflow: hidden;
  box-sizing: border-box;
  transition:
    height $floating-duration-collapse $floating-ease-collapse,
    min-height $floating-duration-collapse $floating-ease-collapse,
    max-height $floating-duration-collapse $floating-ease-collapse,
    font-size $floating-duration-collapse $floating-ease-collapse,
    line-height $floating-duration-collapse $floating-ease-collapse,
    padding $floating-duration-collapse $floating-ease-collapse;

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

.composer-footer--collapsible {
  pointer-events: none;

  .composer-card--collapsible.expanded & {
    pointer-events: auto;
  }
}

.composer-send-collapsed {
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

  .composer-card--collapsible.expanded & {
    transition:
      opacity $floating-duration-expand $floating-ease-expand,
      transform $floating-duration-expand $floating-ease-expand,
      visibility 0s linear $floating-duration-expand;
  }
}

@media (prefers-reduced-motion: reduce) {
  .composer-card--collapsible,
  .composer-main-row,
  .composer-body--collapsible,
  .composer-input--collapsible,
  .composer-footer-slot,
  .composer-send-collapsed {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
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
    transform: rotate(-8deg) scale(1.06);
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
    transform: rotate(-8deg) scale(1.12) translateY(-12px);
    box-shadow: var(--glass-float-shadow, $shadow-md);
    border-color: rgba($accent, 0.45);
    color: var(--composer-text);
  }
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

  .chevron {
    flex-shrink: 0;
    opacity: 0.55;
    transition: transform 0.2s;

    &.open {
      transform: rotate(180deg);
    }
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: $accent-light;
  color: $text-muted;
  transition: background 0.15s, color 0.15s;

  &.ready {
    background: var(--btn-primary-gradient, $accent);
    color: $btn-primary-text;
    box-shadow: var(--btn-primary-shadow, $shadow-sm);

    &:hover {
      filter: brightness(1.06);
    }
  }

  &:disabled {
    cursor: not-allowed;
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

.create-composer-popover.mode-menu,
.create-composer-popover.model-menu {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
