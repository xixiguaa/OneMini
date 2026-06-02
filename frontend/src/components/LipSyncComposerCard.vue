<script setup lang="ts">
import {
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Plus,
  ScanFace,
  Sparkles,
  Upload,
  Video,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type VNodeRef } from 'vue'
import {
  DIGITAL_HUMAN_ENGINE,
  DIGITAL_HUMAN_MODES,
  digitalHumanModeLabel,
  type DigitalHumanMode,
} from '../config/digitalHumanModes'
import type { VoiceItem } from '../config/voicePicker'
import { acceptFilesForCreateMode } from '../utils/files'
import { useAnchoredPopover, type PopoverPlacement } from '../composables/useAnchoredPopover'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import type { CreateMode, SkillId } from '../types/agent'
import { isModelReady } from '../utils/resolveModel'
import ReferenceImageStack from './ReferenceImageStack.vue'
import VoicePickerPopover from './VoicePickerPopover.vue'

const props = withDefaults(
  defineProps<{
    imageUrl?: string
    busy?: boolean
    /** 创作页：参考图栈 + 创作类型菜单 */
    embedded?: boolean
    /** 编辑页等场景：沿用 embedded 布局，但不展示创作类型切换 */
    hideCreateModeMenu?: boolean
    /** 浮动输入条：点击/聚焦后展开完整输入区 */
    collapsible?: boolean
    autoCollapseOnBlur?: boolean
    /** 顶部输入区默认向下；底部浮动/编辑页输入条固定向上 */
    popoverPlacement?: Exclude<PopoverPlacement, 'auto'>
  }>(),
  {
    imageUrl: '',
    busy: false,
    embedded: false,
    hideCreateModeMenu: false,
    collapsible: false,
    autoCollapseOnBlur: true,
    popoverPlacement: 'below',
  },
)

const emit = defineEmits<{
  send: []
  cancel: []
}>()

const agent = useAgentStore()
const settings = useSettingsStore()
const toast = useToastStore()
const audioInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const composerAnchor = ref<HTMLElement | null>(null)
const voicePickerOpen = ref(false)
const digitalMenuOpen = ref(false)
const expanded = ref(false)
const collapsedInputRef = ref<HTMLInputElement | null>(null)
const suspendAutoCollapse = ref(false)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

const createModePopover = useAnchoredPopover({
  minWidth: 220,
  fitContent: true,
  placement: props.popoverPlacement,
})
const createModeMenuOpen = createModePopover.open
const createModePanelStyle = computed(() => createModePopover.panelStyle.value)

const digitalModePopover = useAnchoredPopover({
  minWidth: 320,
  fitContent: true,
  placement: props.popoverPlacement,
})
const modeMenuOpen = digitalModePopover.open
const digitalModePanelStyle = computed(() => digitalModePopover.panelStyle.value)

const composerMenuActive = computed(
  () =>
    createModeMenuOpen.value ||
    digitalMenuOpen.value ||
    modeMenuOpen.value ||
    voicePickerOpen.value,
)

const bindCreateModeTrigger: VNodeRef = (el) => {
  createModePopover.triggerRef.value = el as HTMLElement | null
}

const bindCreateModePanel: VNodeRef = (el) => {
  createModePopover.panelRef.value = el as HTMLElement | null
}

const bindDigitalModeTrigger: VNodeRef = (el) => {
  digitalModePopover.triggerRef.value = el as HTMLElement | null
}

const bindDigitalModePanel: VNodeRef = (el) => {
  digitalModePopover.panelRef.value = el as HTMLElement | null
}

const modes = [
  { id: 'agent' as const, label: 'Agent 创作', desc: '与 Agent 一起创作', icon: Sparkles },
  { id: 'image' as const, label: '图片生成', desc: '智能美学提升', icon: ImageIcon },
  { id: 'video' as const, label: '视频生成', desc: '一镜到底', icon: Video },
  { id: 'digitalHuman' as const, label: '数字人', desc: '角色对口型说话', icon: ScanFace },
]

const currentCreateMode = computed(() => modes.find((m) => m.id === agent.createMode))

const canSend = computed(
  () => !props.busy && agent.lipsyncDialogue.trim().length > 0,
)

const imageAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind === 'image'),
)

const videoAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind === 'video'),
)

const mediaAttachments = computed(() =>
  agent.pendingAttachments.filter((a) => a.kind === 'image' || a.kind === 'video'),
)

const fileAccept = computed(() => acceptFilesForCreateMode('digitalHuman'))

const displayImageUrl = computed(
  () =>
    props.imageUrl ||
    imageAttachments.value.find((a) => a.previewUrl)?.previewUrl ||
    '',
)

const displayVideoUrl = computed(
  () => videoAttachments.value.find((a) => a.previewUrl)?.previewUrl || '',
)

const selectedDigitalMode = computed(() =>
  DIGITAL_HUMAN_MODES.find((m) => m.id === agent.lipsyncDigitalMode) ?? DIGITAL_HUMAN_MODES[1],
)

const modeMenuTitle = computed(
  () => `选择模型：${selectedDigitalMode.value.label} by ${DIGITAL_HUMAN_ENGINE}`,
)

function skillForMode(mode: CreateMode): SkillId {
  if (mode === 'video' || mode === 'digitalHuman') return 'video'
  if (mode === 'image') return 'image'
  return 'chat'
}

function availableModelsForMode(mode: CreateMode) {
  let list = settings.chatModels
  if (mode === 'video' || mode === 'digitalHuman') list = settings.videoModels
  else if (mode === 'image') list = settings.imageModels
  return list.filter(isModelReady)
}

function ensureDefaultModel(mode: CreateMode = agent.createMode) {
  const models = availableModelsForMode(mode)
  if (!models.length) return
  const skill = settings.getSkill(skillForMode(mode))
  const current = skill?.defaultModelId
  const valid = current && models.some((m) => m.id === current)
  if (!valid) {
    settings.updateSkill(skillForMode(mode), { defaultModelId: models[0]!.id })
  }
}

function pickCreateMode(id: CreateMode) {
  agent.createMode = id
  digitalMenuOpen.value = false
  createModePopover.close()
  ensureDefaultModel(id)
}

function toggleCreateModeMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!createModePopover.open.value) {
    closeSubmenus('digital')
  }
  createModePopover.toggle(e)
}

function closeSubmenus(except?: 'digital' | 'mode' | 'voice') {
  if (except !== 'digital') {
    digitalMenuOpen.value = false
    createModePopover.close()
  }
  if (except !== 'mode') digitalModePopover.close()
  if (except !== 'voice') voicePickerOpen.value = false
}

function toggleDigitalMenu() {
  const next = !digitalMenuOpen.value
  closeSubmenus(next ? 'digital' : undefined)
  digitalMenuOpen.value = next
}

function pickDigitalHuman(label: string) {
  digitalMenuOpen.value = false
  toast.show({ message: `${label} 即将推出`, kind: 'info' })
}

function toggleModeMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!digitalModePopover.open.value) {
    closeSubmenus('mode')
  }
  digitalModePopover.toggle(e)
}

function pickDigitalMode(id: DigitalHumanMode) {
  agent.lipsyncDigitalMode = id
  digitalModePopover.close()
}

function triggerAudioUpload() {
  audioInput.value?.click()
}

function triggerImageUpload() {
  if (mediaAttachments.value.length >= 1) return
  imageInput.value?.click()
}

async function onImageChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  input.value = ''
  if (!files?.length) return
  await agent.addAttachments(files)
}

function onRemoveImage(id: string) {
  agent.removeAttachment(id)
}

function onAudioChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  agent.lipsyncVoiceLabel = file.name.replace(/\.[^.]+$/, '').slice(0, 8) || '音色'
}

function onVoiceCardClick(e: MouseEvent) {
  e.stopPropagation()
  const next = !voicePickerOpen.value
  closeSubmenus(next ? 'voice' : undefined)
  voicePickerOpen.value = next
}

function onVoiceSelect(voice: VoiceItem) {
  agent.lipsyncVoiceLabel = voice.name
}

function send() {
  if (!canSend.value) return
  emit('send')
}

function shouldKeepExpanded() {
  if (composerMenuActive.value || suspendAutoCollapse.value) return true
  const active = document.activeElement
  if (composerAnchor.value && active && composerAnchor.value.contains(active)) return true
  if (active instanceof Element && active.closest('.create-composer-popover')) return true
  return false
}

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
      void nextTick(() => collapsedInputRef.value?.focus())
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
    requestAnimationFrame(() => {
      const dialogueInput = composerAnchor.value?.querySelector(
        '.lipsync-field-input',
      ) as HTMLInputElement | null
      dialogueInput?.focus()
    })
  })
}

function isExpanded() {
  return expanded.value
}

function collapseComposer() {
  if (!props.collapsible || !expanded.value) return
  expanded.value = false
  closeSubmenus()
  window.setTimeout(() => collapsedInputRef.value?.blur(), 320)
}

function onCollapsibleBarClick(e: MouseEvent) {
  if (!props.collapsible || expanded.value) return
  const el = e.target as HTMLElement
  if (el.closest('.lipsync-send-collapsed')) return
  expandComposer()
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node
  if (target instanceof Element) {
    if (target.closest('.lipsync-mode-menu, .lipsync-mode-trigger, .lipsync-digital-menu, .lipsync-digital-trigger')) {
      return
    }
    if (target.closest('.create-composer-trigger, .create-composer-popover')) {
      return
    }
  }
  closeSubmenus()
}

watch(composerMenuActive, (active) => {
  if (props.collapsible && active) {
    expanded.value = true
  } else if (props.collapsible && props.autoCollapseOnBlur) {
    scheduleCollapseIfUnfocused()
  }
})

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  window.addEventListener('focus', onWindowRefocus)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
  window.removeEventListener('focus', onWindowRefocus)
  if (collapseTimer) clearTimeout(collapseTimer)
})

defineExpose({
  collapseComposer,
  expandComposer,
  isExpanded,
  shouldKeepExpandedOnScroll,
})
</script>

<template>
  <div
    ref="composerAnchor"
    class="lipsync-composer"
    :class="{
      'lipsync-composer--embedded': embedded,
      'lipsync-composer--collapsible': collapsible,
      expanded: collapsible && expanded,
    }"
    @click="collapsible ? onCollapsibleBarClick($event) : undefined"
  >
    <div class="lipsync-main-row">
      <div
        class="lipsync-body"
        :class="{ 'lipsync-body--collapsible': collapsible, expanded: collapsible && expanded }"
      >
        <div v-if="!collapsible || expanded" class="lipsync-input-area">
          <div class="lipsync-media-col">
            <div class="lipsync-ref-upload-wrap">
              <template v-if="embedded">
                <ReferenceImageStack
                  v-if="imageAttachments.length"
                  single
                  :attachments="agent.pendingAttachments"
                  @add="triggerImageUpload"
                  @remove="onRemoveImage"
                />
                <div
                  v-else-if="videoAttachments.length"
                  class="ref-upload-card ref-upload-card--filled ref-upload-card--video"
                >
                  <video
                    v-if="displayVideoUrl"
                    :src="displayVideoUrl"
                    class="ref-upload-card__video"
                    muted
                    playsinline
                  />
                  <button
                    type="button"
                    class="ref-upload-card__remove"
                    title="移除"
                    @click.stop="onRemoveImage(videoAttachments[0]!.id)"
                  >
                    <X :size="10" stroke-width="2.5" />
                  </button>
                </div>
                <button
                  v-else
                  type="button"
                  class="ref-upload-card"
                  title="上传参考内容"
                  @click="triggerImageUpload"
                >
                  <Plus :size="16" stroke-width="1.75" />
                  <span>参考内容</span>
                </button>
              </template>
              <template v-else>
                <div class="ref-upload-card ref-upload-card--filled">
                  <img v-if="imageUrl" :src="imageUrl" alt="" class="ref-upload-card__img" />
                  <span v-else class="ref-upload-card__placeholder" aria-hidden="true">
                    <Plus :size="16" stroke-width="1.75" />
                  </span>
                </div>
              </template>
            </div>
            <button
              type="button"
              class="lipsync-voice-card"
              :class="{ active: voicePickerOpen }"
              @click="onVoiceCardClick"
            >
              <span class="lipsync-wave" aria-hidden="true">
                <span v-for="i in 5" :key="i" class="lipsync-wave-bar" />
              </span>
              <span class="lipsync-voice-label">{{ agent.lipsyncVoiceLabel }}</span>
            </button>
          </div>

      <VoicePickerPopover
        v-model:open="voicePickerOpen"
        :anchor="composerAnchor"
        :placement="popoverPlacement"
        @select="onVoiceSelect"
      />

      <div class="lipsync-fields">
        <label class="lipsync-field">
          <span v-if="displayImageUrl && !embedded" class="lipsync-field-thumb" aria-hidden="true">
            <img :src="displayImageUrl" alt="" />
          </span>
          <span class="lipsync-field-tag">角色说</span>
          <input
            v-model="agent.lipsyncDialogue"
            type="text"
            class="lipsync-field-input"
            placeholder="输入角色台词"
          />
        </label>
        <label class="lipsync-field">
          <span v-if="displayImageUrl && !embedded" class="lipsync-field-thumb" aria-hidden="true">
            <img :src="displayImageUrl" alt="" />
          </span>
          <span class="lipsync-field-tag">动作描述</span>
          <input
            v-model="agent.lipsyncAction"
            type="text"
            class="lipsync-field-input lipsync-field-input--muted"
            placeholder="(可选) 添加动作描述和镜头语言，如：镜头推进，他摘下眼镜，对着镜头笑着说"
          />
          </label>
        </div>
        </div>
        <input
          v-else
          ref="collapsedInputRef"
          v-model="agent.lipsyncDialogue"
          type="text"
          class="lipsync-collapsed-input"
          placeholder="输入角色台词"
          @focus="expandComposer()"
          @blur="onInputBlur()"
        />
      </div>

      <button
        v-if="collapsible"
        type="button"
        class="lipsync-send lipsync-send-collapsed"
        :class="{
          ready: canSend,
          waiting: busy,
          'lipsync-send-collapsed--hidden': expanded,
        }"
        :disabled="!canSend && !busy"
        title="生成"
        tabindex="-1"
        @click.stop="send"
      >
        <Loader2 v-if="busy" :size="18" class="om-loading-spinner" />
        <ArrowUp v-else :size="18" stroke-width="2.5" />
      </button>
    </div>

    <div
      class="lipsync-footer-slot"
      :class="{
        open: !collapsible || expanded,
        'lipsync-footer-slot--static': !collapsible,
      }"
    >
      <div class="lipsync-expand-inner">
        <div class="lipsync-footer">
      <div class="lipsync-footer-left">
        <div class="lipsync-pill-wrap">
          <template v-if="embedded">
            <span
              v-if="hideCreateModeMenu"
              class="composer-pill mode-pill mode-pill--static"
            >
              <ScanFace :size="14" />
              数字人
            </span>
            <template v-else>
              <button
                :ref="bindCreateModeTrigger"
                type="button"
                class="composer-pill create-composer-trigger mode-pill"
                :class="{ active: createModeMenuOpen }"
                @click="toggleCreateModeMenu"
              >
                <component :is="currentCreateMode?.icon ?? ScanFace" :size="14" />
                {{ currentCreateMode?.label ?? '数字人' }}
                <ChevronDown :size="12" class="chevron" :class="{ open: createModeMenuOpen }" />
              </button>
              <Teleport to="body">
                <div
                  v-if="createModeMenuOpen"
                  :ref="bindCreateModePanel"
                  class="composer-popover create-composer-popover mode-menu lipsync-create-mode-popover"
                  :style="createModePanelStyle"
                  @click.stop
                >
                  <p class="menu-kicker">创作类型</p>
                  <button
                    v-for="m in modes"
                    :key="m.id"
                    type="button"
                    class="mode-item"
                    :class="{ active: agent.createMode === m.id }"
                    @click="pickCreateMode(m.id)"
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
            </template>
          </template>
          <template v-else>
            <button
              type="button"
              class="lipsync-pill lipsync-pill--accent lipsync-digital-trigger"
              :class="{ active: digitalMenuOpen }"
              @click.stop="toggleDigitalMenu"
            >
              <ScanFace :size="14" />
              <span>数字人</span>
              <ChevronDown :size="12" class="lipsync-chevron" :class="{ open: digitalMenuOpen }" />
            </button>
            <div
              v-if="digitalMenuOpen"
              class="lipsync-digital-menu"
              :class="`lipsync-digital-menu--${popoverPlacement}`"
              @click.stop
            >
              <button type="button" @click="pickDigitalHuman('默认数字人')">默认数字人</button>
              <button type="button" @click="pickDigitalHuman('写实数字人')">写实数字人</button>
            </div>
          </template>
        </div>
        <div class="lipsync-pill-wrap">
          <button
            :ref="bindDigitalModeTrigger"
            type="button"
            class="lipsync-pill lipsync-mode-trigger"
            :class="{ active: modeMenuOpen }"
            @click.stop="toggleModeMenu"
          >
            <Box :size="14" />
            <span>{{ digitalHumanModeLabel(agent.lipsyncDigitalMode) }}</span>
            <ChevronDown :size="12" class="lipsync-chevron" :class="{ open: modeMenuOpen }" />
          </button>
          <Teleport to="body">
            <div
              v-if="modeMenuOpen"
              :ref="bindDigitalModePanel"
              class="lipsync-mode-menu create-composer-popover"
              :style="digitalModePanelStyle"
              @click.stop
            >
              <p class="lipsync-mode-menu__title">{{ modeMenuTitle }}</p>
              <button
                v-for="mode in DIGITAL_HUMAN_MODES"
                :key="mode.id"
                type="button"
                class="lipsync-mode-option"
                :class="{ active: agent.lipsyncDigitalMode === mode.id }"
                @click="pickDigitalMode(mode.id)"
              >
                <span class="lipsync-mode-option__thumb">
                  <img v-if="displayImageUrl" :src="displayImageUrl" alt="" />
                  <span v-else class="lipsync-mode-option__thumb-fallback" />
                </span>
                <span class="lipsync-mode-option__text">
                  <span class="lipsync-mode-option__label">
                    {{ mode.label }}
                    <Sparkles v-if="mode.premium" :size="12" class="lipsync-mode-option__sparkle" />
                  </span>
                  <span class="lipsync-mode-option__desc">{{ mode.desc }}</span>
                </span>
                <Check
                  v-if="agent.lipsyncDigitalMode === mode.id"
                  :size="16"
                  class="lipsync-mode-option__check"
                />
              </button>
            </div>
          </Teleport>
        </div>
        <button type="button" class="lipsync-pill" @click="triggerAudioUpload">
          <Upload :size="14" />
          <span>上传音频</span>
        </button>
      </div>

      <div v-if="!collapsible || expanded" class="lipsync-footer-right">
        <button
          type="button"
          class="lipsync-send"
          :class="{ ready: canSend, waiting: busy }"
          :disabled="!canSend && !busy"
          title="生成"
          @click="send"
        >
          <Loader2 v-if="busy" :size="18" class="om-loading-spinner" />
          <ArrowUp v-else :size="18" stroke-width="2.5" />
        </button>
      </div>
        </div>
      </div>
    </div>

    <input
      ref="audioInput"
      type="file"
      accept="audio/*"
      hidden
      @change="onAudioChange"
    />
    <input
      v-if="embedded"
      ref="imageInput"
      type="file"
      :accept="fileAccept"
      hidden
      @change="onImageChange"
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

.lipsync-composer {
  @include cosmic.cosmic-glass-frost(22px);
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 10px;
  background: var(--composer-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
  border-radius: 22px;

  &:not(.lipsync-composer--collapsible) {
    height: $composer-min-height;
    min-height: $composer-min-height;
    max-height: $composer-min-height;
    overflow: visible;
  }

  &--collapsible {
    max-height: $floating-composer-collapsed-height;
    min-height: 0;
    height: auto;
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
      overflow: visible;
      cursor: default;
      transition:
        max-height $floating-duration-expand $floating-ease-expand,
        min-height $floating-duration-expand $floating-ease-expand,
        padding $floating-duration-expand $floating-ease-expand,
        border-radius $floating-duration-expand $floating-ease-expand,
        box-shadow 0.35s ease;
    }
  }
}

.lipsync-composer--embedded {
  .lipsync-media-col {
    overflow: visible;
    padding-top: 6px;
    margin-top: -6px;
  }

  .lipsync-pill {
    height: 32px;
    padding: 0 10px;
    border-radius: 10px;
    border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border, $border-light);
    background: var(--composer-pill-bg, rgba(255, 255, 255, 0.08));
    color: var(--composer-pill-text, $text-secondary);

    &:hover,
    &.active {
      background: var(--composer-pill-hover-bg, $accent-light);
      color: var(--composer-text, $text-primary);
      border-color: color-mix(in srgb, var(--composer-border-focus, $accent) 45%, transparent);
    }

    &--accent {
      color: $accent-cyan;
      background: color-mix(in srgb, $accent-cyan 10%, var(--composer-pill-bg, transparent));
      border-color: color-mix(in srgb, $accent-cyan 24%, var(--composer-pill-border, transparent));

      &:hover,
      &.active {
        background: color-mix(in srgb, $accent-cyan 16%, var(--composer-pill-bg, transparent));
        color: $accent-cyan;
      }
    }
  }

  .lipsync-send {
    background: var(--composer-send-bg, $accent);
    color: var(--composer-send-icon, #fff);
  }

  .composer-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    border-radius: 10px;
    border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border, $border-light);
    background: var(--composer-pill-bg, rgba(255, 255, 255, 0.08));
    font-size: 12px;
    font-weight: 500;
    color: var(--composer-pill-text, $text-secondary);
    transition: background 0.15s, border-color 0.15s, color 0.15s;

    &:hover,
    &.active {
      background: var(--composer-pill-hover-bg, $accent-light);
      color: var(--composer-text, $text-primary);
      border-color: color-mix(in srgb, var(--composer-border-focus, $accent) 45%, transparent);
    }

    &.mode-pill--static {
      cursor: default;
      pointer-events: none;
    }
  }

  .chevron {
    opacity: 0.7;
    transition: transform 0.2s;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.lipsync-main-row {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex: 1;
  min-height: 0;

  .lipsync-composer:not(.lipsync-composer--collapsible) & {
    overflow: visible;
  }

  .lipsync-composer--collapsible & {
    align-items: center;
    min-height: $floating-composer-collapsed-height;
    flex-shrink: 0;
    transition:
      min-height $floating-duration-collapse $floating-ease-collapse,
      gap $floating-duration-collapse $floating-ease-collapse;
  }

  .lipsync-composer--collapsible.expanded & {
    align-items: flex-start;
    min-height: 102px;
    gap: 0;
    overflow: visible;
    transition:
      min-height $floating-duration-expand $floating-ease-expand,
      gap $floating-duration-expand $floating-ease-expand;
  }
}

.lipsync-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;

  .lipsync-composer:not(.lipsync-composer--collapsible) &,
  .lipsync-composer--collapsible.expanded & {
    overflow: visible;
  }
}

.lipsync-body--collapsible {
  justify-content: center;
  padding: 0;

  &.expanded {
    justify-content: flex-start;
  }
}

.lipsync-input-area {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 8px 0 0 12px;
  box-sizing: border-box;
  overflow: visible;
}

.lipsync-collapsed-input {
  flex: 1;
  min-width: 0;
  height: $floating-composer-collapsed-height;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  line-height: $floating-composer-collapsed-height;
  color: var(--composer-text, $text-primary);
  padding: 0 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &::placeholder {
    color: var(--composer-placeholder, $text-muted);
  }
}

.lipsync-footer-slot {
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

    .lipsync-expand-inner {
      padding-top: 12px;
    }
  }
}

.lipsync-expand-inner {
  min-height: 0;
  overflow: hidden;
}

.lipsync-send-collapsed {
  flex-shrink: 0;
  align-self: center;
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

  .lipsync-composer--collapsible.expanded & {
    transition:
      opacity $floating-duration-expand $floating-ease-expand,
      transform $floating-duration-expand $floating-ease-expand,
      visibility 0s linear $floating-duration-expand;
  }
}

.lipsync-media-col {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  overflow: visible;

  &:hover {
    z-index: 20;
  }
}

.lipsync-ref-upload-wrap {
  position: relative;
  flex-shrink: 0;
  z-index: 4;
  overflow: visible;

  :deep(.ref-image-stack),
  :deep(.ref-image-stack__track:not(.ref-image-stack__track--empty)),
  :deep(.ref-image-stack__hover-zone),
  :deep(.ref-image-stack__pile) {
    width: 52px;
    height: 68px;
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

  &:hover {
    z-index: 20;
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

  &:hover .ref-upload-card:not(.ref-upload-card--filled) {
    z-index: 30;
    transform: rotate(-8deg) scale(1.12) translateY(-12px);
    box-shadow: var(--glass-float-shadow, $shadow-md);
    border-color: rgba($accent, 0.45);
    color: var(--composer-text);
  }

  &:hover .ref-upload-card--filled {
    z-index: 30;
    transform: rotate(-8deg) scale(1.12) translateY(-12px);
    box-shadow: var(--glass-float-shadow, $shadow-md);
    border-color: rgba($accent, 0.45);
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
  overflow: visible;

  span {
    max-width: 40px;
    text-align: center;
  }

  &--filled {
    padding: 3px;
    border-style: solid;
    border-color: color-mix(in srgb, var(--composer-pill-border, $border-light) 80%, transparent);
    background: #fff;
    box-shadow:
      0 2px 8px rgba(15, 23, 42, 0.14),
      0 0 0 0.5px rgba(15, 23, 42, 0.06);
  }

  &__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--composer-muted, $text-muted);
  }

  &--video {
    overflow: visible;
  }

  &__video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    background: #000;
  }

  &__remove {
    position: absolute;
    top: -5px;
    right: -5px;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: #fff;
    background: rgba(0, 0, 0, 0.52);
    transition: background 0.15s ease;

    &:hover {
      background: rgba(220, 53, 69, 0.88);
    }
  }
}

.lipsync-voice-card {
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
  background: var(--composer-pill-bg, rgba(255, 255, 255, 0.06));
  color: var(--composer-muted, $text-muted);
  font-size: 9px;
  line-height: 1.2;
  transform: rotate(4deg);
  transform-origin: center bottom;
  overflow: visible;
  transition:
    transform 0.28s cubic-bezier(0.34, 1.45, 0.64, 1),
    box-shadow 0.25s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.15s,
    z-index 0s;

  &:hover,
  &.active {
    z-index: 30;
    transform: rotate(4deg) scale(1.12) translateY(-12px);
    box-shadow: var(--glass-float-shadow, $shadow-md);
    border-color: rgba($accent, 0.45);
    background: var(--composer-pill-bg, rgba(255, 255, 255, 0.08));
    color: var(--composer-text, $text-primary);
  }
}

.lipsync-wave {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  height: 22px;
}

.lipsync-wave-bar {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
  animation: lipsync-wave 1.1s ease-in-out infinite;

  &:nth-child(1) {
    height: 8px;
    animation-delay: 0s;
  }

  &:nth-child(2) {
    height: 14px;
    animation-delay: 0.12s;
  }

  &:nth-child(3) {
    height: 18px;
    animation-delay: 0.24s;
  }

  &:nth-child(4) {
    height: 12px;
    animation-delay: 0.36s;
  }

  &:nth-child(5) {
    height: 9px;
    animation-delay: 0.48s;
  }
}

@keyframes lipsync-wave {
  0%,
  100% {
    transform: scaleY(0.55);
    opacity: 0.55;
  }

  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

.lipsync-voice-label {
  font-size: 9px;
  line-height: 1.2;
  max-width: 40px;
  text-align: center;
}

.lipsync-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.lipsync-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 28px;
}

.lipsync-field-thumb {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  overflow: hidden;
  opacity: 0.85;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.lipsync-field-tag {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--composer-text, $text-primary);
  white-space: nowrap;
}

.lipsync-field-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  line-height: 1.5;
  color: var(--composer-text, $text-primary);

  &::placeholder {
    color: var(--composer-placeholder, $text-muted);
  }

  &--muted::placeholder {
    font-size: 13px;
  }
}

.lipsync-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  min-height: 32px;
  flex-wrap: nowrap;
}

.lipsync-footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
  flex: 1;
}

.lipsync-pill-wrap {
  position: relative;
}

.lipsync-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--composer-pill-text, $text-secondary);
  background: var(--composer-pill-bg, rgba(255, 255, 255, 0.08));
  border: 1px solid var(--composer-pill-border, $border-light);
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover,
  &.active {
    background: var(--composer-pill-hover-bg, $accent-light);
    color: var(--composer-text, $text-primary);
  }

  &--accent {
    color: $accent-cyan;
    background: color-mix(in srgb, $accent-cyan 12%, transparent);
    border-color: color-mix(in srgb, $accent-cyan 28%, transparent);

    &:hover,
    &.active {
      background: color-mix(in srgb, $accent-cyan 18%, transparent);
      color: $accent-cyan;
    }
  }
}

.lipsync-chevron {
  opacity: 0.7;
  transition: transform 0.2s;

  &.open {
    transform: rotate(180deg);
  }
}

.lipsync-digital-menu {
  position: absolute;
  left: 0;
  z-index: 5;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: var(--composer-menu-bg, var(--bg-card));
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);

  &--above {
    bottom: calc(100% + 6px);
  }

  &--below {
    top: calc(100% + 6px);
  }

  button {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    text-align: left;
    color: var(--composer-menu-text, $text-primary);

    &:hover {
      background: var(--composer-option-hover, $accent-light);
    }
  }

  &__option {
    display: flex !important;
    align-items: center;
    gap: 8px;
    font-size: 13px;

    &.active {
      color: $accent-cyan;
    }

    span {
      flex: 1;
      min-width: 0;
    }

    svg:last-child {
      margin-left: auto;
      flex-shrink: 0;
      color: $accent-cyan;
    }
  }
}

.lipsync-mode-menu {
  z-index: 10005;
  width: min(320px, calc(100vw - 32px));
  padding: 12px;
  border-radius: 14px;
  background: var(--composer-menu-bg, var(--bg-card));
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
  backdrop-filter: blur(20px);
}

.lipsync-mode-menu__title {
  margin: 0 0 10px;
  padding: 0 4px;
  font-size: 12px;
  color: $text-muted;
}

.lipsync-mode-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: 10px;
  text-align: left;
  transition: background 0.12s;

  &:hover,
  &.active {
    background: var(--composer-option-hover, $accent-light);
  }
}

.lipsync-mode-option__thumb {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--composer-pill-bg, rgba(255, 255, 255, 0.08));

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.lipsync-mode-option__thumb-fallback {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
}

.lipsync-mode-option__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lipsync-mode-option__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--composer-text, $text-primary);
}

.lipsync-mode-option__sparkle {
  color: $accent-cyan;
  flex-shrink: 0;
}

.lipsync-mode-option__desc {
  font-size: 12px;
  line-height: 1.4;
  color: $text-muted;
}

.lipsync-mode-option__check {
  flex-shrink: 0;
  color: $accent-cyan;
}

.lipsync-footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.lipsync-send {
  display: flex;
  align-items: center;
  justify-content: center;
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
  }

  &:disabled {
    cursor: not-allowed;
  }
}

html[data-theme='light'] {
  .lipsync-voice-card {
    background: var(--composer-pill-bg);
    border-color: color-mix(in srgb, var(--composer-muted) 55%, transparent);
    color: var(--composer-muted);

    &:hover,
    &.active {
      background: var(--composer-pill-bg);
      border-color: rgba($accent, 0.45);
      color: var(--composer-text);
    }
  }

  .lipsync-mode-menu {
    background: var(--bg-card);
    border-color: $border-light;
    box-shadow: $shadow-md;
  }

  .lipsync-mode-menu__title {
    color: $text-muted;
  }

  .lipsync-mode-option {
    &:hover,
    &.active {
      background: $accent-light;
    }
  }

  .lipsync-mode-option__label {
    color: $text-primary;
  }

  .lipsync-mode-option__desc {
    color: $text-muted;
  }

  .lipsync-mode-option__check {
    color: $accent-emphasis;
  }
}
</style>

<style lang="scss">
@use '../styles/cosmic-glass.scss' as cosmic;
@use '../styles/variables.scss' as *;

.lipsync-create-mode-popover.create-composer-popover.mode-menu {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  min-width: 220px;

  .menu-kicker {
    font-size: 11px;
    font-weight: 600;
    color: var(--composer-muted);
    letter-spacing: 0.04em;
    padding: 6px 10px 4px;
  }

  .mode-item {
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
}
</style>
