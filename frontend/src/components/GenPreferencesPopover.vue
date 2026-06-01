<script setup lang="ts">
import { Check, Clock, Gem, Link2, Ratio, SlidersHorizontal, Unlink2, X } from 'lucide-vue-next'
import { computed, inject, onUnmounted, watch, type Ref, type VNodeRef } from 'vue'
import {
  ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
} from '../config/constants'
import { useAnchoredPopover, type PopoverPlacement } from '../composables/useAnchoredPopover'
import {
  composerSubmenuOpenKey,
  createComposerMenuCloseAllKey,
  createMenuCloseSignalKey,
  toggleExclusiveComposerMenu,
} from '../composables/useCreateComposerMenus'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import type { GenerationPrefs } from '../types/agent'
import { applyAspectRatioToPrompt, applyVideoPrefsToPrompt } from '../utils/aspectRatioPrompt'
import { cssAspectRatio } from '../utils/aspectRatioStyle'
import { resolveImageDimensions, syncLockedDimension } from '../utils/imageSize'

const props = withDefaults(
  defineProps<{
    /** 顶部创作区默认向下；底部浮动输入条固定向上 */
    popoverPlacement?: Exclude<PopoverPlacement, 'auto'>
  }>(),
  { popoverPlacement: 'below' },
)

const agent = useAgentStore()
const settings = useSettingsStore()
const closeSignal = inject<Ref<number>>(createMenuCloseSignalKey)
const closeAll = inject(createComposerMenuCloseAllKey, () => {})
const setSubmenuOpen = inject(composerSubmenuOpenKey, () => {})

const imagePopover = useAnchoredPopover({
  minWidth: 560,
  maxPanelHeight: 480,
  placement: props.popoverPlacement,
})
const videoRatioPopover = useAnchoredPopover({
  minWidth: 400,
  fitContent: true,
  placement: props.popoverPlacement,
})
const videoDurationPopover = useAnchoredPopover({
  minWidth: 160,
  fitContent: true,
  placement: props.popoverPlacement,
})

const prefsMenuOpen = imagePopover.open
const videoRatioMenuOpen = videoRatioPopover.open
const videoDurationMenuOpen = videoDurationPopover.open

const bindImageTrigger: VNodeRef = (el) => {
  imagePopover.triggerRef.value = el as HTMLElement | null
}
const bindImagePanel: VNodeRef = (el) => {
  imagePopover.panelRef.value = el as HTMLElement | null
}
const bindVideoRatioTrigger: VNodeRef = (el) => {
  videoRatioPopover.triggerRef.value = el as HTMLElement | null
}
const bindVideoRatioPanel: VNodeRef = (el) => {
  videoRatioPopover.panelRef.value = el as HTMLElement | null
}
const bindVideoDurationTrigger: VNodeRef = (el) => {
  videoDurationPopover.triggerRef.value = el as HTMLElement | null
}
const bindVideoDurationPanel: VNodeRef = (el) => {
  videoDurationPopover.panelRef.value = el as HTMLElement | null
}

const prefs = () => settings.settings.generationPrefs
const isAutoMode = computed(() => settings.settings.generationPrefs.autoMode)
const imagePanelStyle = computed(() => imagePopover.panelStyle.value)
const videoRatioPanelStyle = computed(() => videoRatioPopover.panelStyle.value)
const videoDurationPanelStyle = computed(() => videoDurationPopover.panelStyle.value)
const isVideo = computed(
  () => agent.createMode === 'video' || agent.createMode === 'digitalHuman',
)
const showMediaTypeTabs = computed(
  () => agent.createMode === 'image' || agent.createMode === 'video',
)
const videoSplitControls = computed(() => isVideo.value && !isAutoMode.value)

const imageTriggerLabel = computed(() => {
  const p = prefs()
  const resLabel = IMAGE_RESOLUTIONS.find((r) => r.id === p.imageResolution)?.label ?? '2K'
  const ratioLabel = ASPECT_RATIOS.find((r) => r.id === p.aspectRatio)?.label ?? '1:1'
  return `${ratioLabel} · ${resLabel.replace('高清 ', '').replace('超清 ', '')}`
})

const videoRatioLabel = computed(() => {
  return VIDEO_ASPECT_RATIOS.find((r) => r.id === prefs().videoAspectRatio)?.label ?? '16:9'
})

const videoDurationLabel = computed(() => `${prefs().videoDuration}s`)

function syncImageDimensionsFromPrefs(
  aspectRatio: string,
  imageResolution: string,
): Pick<GenerationPrefs, 'imageWidth' | 'imageHeight'> {
  const { width, height } = resolveImageDimensions(imageResolution, aspectRatio)
  return { imageWidth: width, imageHeight: height }
}

function toggleImageMenu(e: MouseEvent) {
  if (!closeSignal) return
  toggleExclusiveComposerMenu(closeSignal, imagePopover, e)
}

function toggleVideoRatioMenu(e: MouseEvent) {
  if (!closeSignal) return
  toggleExclusiveComposerMenu(closeSignal, videoRatioPopover, e)
}

function toggleVideoDurationMenu(e: MouseEvent) {
  if (!closeSignal) return
  toggleExclusiveComposerMenu(closeSignal, videoDurationPopover, e)
}

function dismiss() {
  imagePopover.close()
  videoRatioPopover.close()
  videoDurationPopover.close()
  closeAll()
}

watch(
  () => closeSignal?.value,
  () => {
    imagePopover.close()
    videoRatioPopover.close()
    videoDurationPopover.close()
  },
)

watch(
  () => imagePopover.open.value,
  (open) => setSubmenuOpen('prefs', open),
  { flush: 'sync' },
)
watch(
  () => videoRatioPopover.open.value,
  (open) => setSubmenuOpen('prefs-video-ratio', open),
  { flush: 'sync' },
)
watch(
  () => videoDurationPopover.open.value,
  (open) => setSubmenuOpen('prefs-video-duration', open),
  { flush: 'sync' },
)

onUnmounted(() => {
  setSubmenuOpen('prefs', false)
  setSubmenuOpen('prefs-video-ratio', false)
  setSubmenuOpen('prefs-video-duration', false)
})

function pickImageRatio(id: string) {
  if (isAutoMode.value) return
  const dims = syncImageDimensionsFromPrefs(id, prefs().imageResolution)
  settings.updateGenerationPrefs({
    aspectRatio: id,
    ...dims,
  })
  agent.inputText = applyAspectRatioToPrompt(agent.inputText, id)
}

function pickImageResolution(id: string) {
  if (isAutoMode.value) return
  const dims = syncImageDimensionsFromPrefs(prefs().aspectRatio, id)
  settings.updateGenerationPrefs({
    imageResolution: id,
    ...dims,
  })
}

function toggleSizeLock() {
  if (isAutoMode.value) return
  settings.updateGenerationPrefs({ imageSizeLocked: !prefs().imageSizeLocked })
}

function onWidthInput(e: Event) {
  if (isAutoMode.value) return
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  if (!raw || raw < 64) return
  if (prefs().imageSizeLocked) {
    const synced = syncLockedDimension('width', raw, prefs().aspectRatio)
    settings.updateGenerationPrefs({
      imageWidth: synced.width,
      imageHeight: synced.height,
    })
  } else {
    settings.updateGenerationPrefs({ imageWidth: raw })
  }
}

function onHeightInput(e: Event) {
  if (isAutoMode.value) return
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  if (!raw || raw < 64) return
  if (prefs().imageSizeLocked) {
    const synced = syncLockedDimension('height', raw, prefs().aspectRatio)
    settings.updateGenerationPrefs({
      imageWidth: synced.width,
      imageHeight: synced.height,
    })
  } else {
    settings.updateGenerationPrefs({ imageHeight: raw })
  }
}

function pickVideoRatio(id: string) {
  if (isAutoMode.value) return
  settings.updateGenerationPrefs({ videoAspectRatio: id })
  agent.inputText = applyVideoPrefsToPrompt(
    agent.inputText,
    id,
    prefs().videoResolution,
    prefs().videoDuration,
  )
}

function pickVideoResolution(id: string) {
  if (isAutoMode.value) return
  settings.updateGenerationPrefs({ videoResolution: id })
  agent.inputText = applyVideoPrefsToPrompt(
    agent.inputText,
    prefs().videoAspectRatio,
    id,
    prefs().videoDuration,
  )
}

function pickVideoDuration(seconds: number) {
  if (isAutoMode.value) return
  settings.updateGenerationPrefs({ videoDuration: seconds })
  agent.inputText = applyVideoPrefsToPrompt(
    agent.inputText,
    prefs().videoAspectRatio,
    prefs().videoResolution,
    seconds,
  )
  videoDurationPopover.close()
}

function ratioPreviewStyle(ratioId: string) {
  return { aspectRatio: cssAspectRatio(ratioId) }
}
</script>

<template>
  <div class="prefs-wrap" :class="{ 'prefs-wrap--video-split': videoSplitControls }">
    <!-- 视频：比例 + 时长 分开 -->
    <template v-if="videoSplitControls">
      <button
        :ref="bindVideoRatioTrigger"
        type="button"
        class="composer-pill create-composer-trigger video-pill"
        :class="{ active: videoRatioMenuOpen }"
        @click="toggleVideoRatioMenu"
      >
        <Ratio :size="14" />
        <span>{{ videoRatioLabel }}</span>
      </button>

      <button
        :ref="bindVideoDurationTrigger"
        type="button"
        class="composer-pill create-composer-trigger video-pill"
        :class="{ active: videoDurationMenuOpen }"
        @click="toggleVideoDurationMenu"
      >
        <Clock :size="14" />
        <span>{{ videoDurationLabel }}</span>
      </button>

      <Teleport to="body">
        <div
          v-if="videoRatioMenuOpen"
          :ref="bindVideoRatioPanel"
          class="composer-popover create-composer-popover prefs-panel video-ratio-panel"
          :style="videoRatioPanelStyle"
          @click.stop
        >
          <p class="label video-panel-label">选择比例</p>
          <div class="video-ratio-row">
            <button
              v-for="r in VIDEO_ASPECT_RATIOS"
              :key="r.id"
              type="button"
              class="video-ratio-option"
              :class="{ active: prefs().videoAspectRatio === r.id }"
              @click="pickVideoRatio(r.id)"
            >
              <span class="ratio-preview-box">
                <span class="ratio-preview-shape" :style="ratioPreviewStyle(r.id)" />
              </span>
              <span class="video-ratio-label">{{ r.label }}</span>
            </button>
          </div>

          <p class="label video-panel-label video-panel-label--res">分辨率</p>
          <div class="video-res-row">
            <button
              v-for="res in VIDEO_RESOLUTIONS"
              :key="res.id"
              type="button"
              class="video-res-btn"
              :class="{ active: prefs().videoResolution === res.id }"
              :title="res.hint"
              @click="pickVideoResolution(res.id)"
            >
              {{ res.label }}
            </button>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="videoDurationMenuOpen"
          :ref="bindVideoDurationPanel"
          class="composer-popover create-composer-popover prefs-panel video-duration-panel"
          :style="videoDurationPanelStyle"
          @click.stop
        >
          <p class="label video-panel-label">选择视频生成时长</p>
          <div class="duration-list">
            <button
              v-for="sec in VIDEO_DURATIONS"
              :key="sec"
              type="button"
              class="duration-item"
              :class="{ active: prefs().videoDuration === sec }"
              @click="pickVideoDuration(sec)"
            >
              <Clock :size="14" class="duration-icon" />
              <span>{{ sec }}s</span>
              <Check v-if="prefs().videoDuration === sec" :size="14" class="duration-check" />
            </button>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- 图片 / 视频自动模式：合并入口 -->
    <template v-else>
      <button
        :ref="bindImageTrigger"
        type="button"
        class="composer-pill create-composer-trigger"
        :class="{ active: prefsMenuOpen }"
        @click="toggleImageMenu"
      >
        <SlidersHorizontal v-if="isAutoMode" :size="14" />
        <Clock v-else-if="isVideo" :size="14" />
        <Ratio v-else :size="14" />
        <span>{{ isAutoMode ? '自定义' : isVideo ? videoDurationLabel : imageTriggerLabel }}</span>
      </button>

      <Teleport to="body">
        <div
          v-if="prefsMenuOpen"
          :ref="bindImagePanel"
          class="composer-popover create-composer-popover prefs-panel"
          :style="imagePanelStyle"
          @click.stop
        >
          <div class="prefs-head">
            <span class="prefs-title">生成偏好</span>
            <div class="prefs-head-actions">
              <label class="auto-toggle">
                自动
                <input
                  type="checkbox"
                  :checked="settings.settings.generationPrefs.autoMode"
                  @change="settings.updateGenerationPrefs({ autoMode: ($event.target as HTMLInputElement).checked })"
                />
                <span class="slider" />
              </label>
              <button type="button" class="close-btn" title="关闭" @click.stop="dismiss">
                <X :size="16" />
              </button>
            </div>
          </div>

          <div
            class="prefs-scroll"
            :class="{ 'prefs-scroll--disabled': isAutoMode }"
            :aria-disabled="isAutoMode || undefined"
          >
            <div v-if="showMediaTypeTabs" class="tabs">
              <button
                type="button"
                class="tab"
                :class="{ active: agent.createMode !== 'video' }"
                :disabled="isAutoMode"
                @click="agent.createMode = 'image'"
              >
                图片
              </button>
              <button
                type="button"
                class="tab"
                :class="{ active: agent.createMode === 'video' }"
                :disabled="isAutoMode"
                @click="agent.createMode = 'video'"
              >
                短片
              </button>
            </div>

            <template v-if="!isVideo">
              <p class="label">选择比例</p>
              <div class="ratio-grid ratio-grid--single-row">
                <button
                  v-for="r in ASPECT_RATIOS"
                  :key="r.id"
                  type="button"
                  class="ratio-btn"
                  :class="{ active: prefs().aspectRatio === r.id }"
                  :disabled="isAutoMode"
                  @click="pickImageRatio(r.id)"
                >
                  {{ r.label }}
                </button>
              </div>

              <p class="label">选择分辨率</p>
              <div class="tier-grid">
                <button
                  v-for="res in IMAGE_RESOLUTIONS"
                  :key="res.id"
                  type="button"
                  class="tier-btn"
                  :class="{ active: prefs().imageResolution === res.id }"
                  :disabled="isAutoMode"
                  @click="pickImageResolution(res.id)"
                >
                  <span>{{ res.label }}</span>
                  <Gem v-if="res.id === '4k'" :size="12" class="tier-star" />
                </button>
              </div>

              <p class="label">尺寸</p>
              <div class="size-row">
                <label class="size-field">
                  <span class="size-tag">W</span>
                  <input
                    type="number"
                    class="size-input"
                    :value="prefs().imageWidth"
                    min="64"
                    step="2"
                    :disabled="isAutoMode"
                    @change="onWidthInput"
                  />
                </label>
                <button
                  type="button"
                  class="size-lock"
                  :class="{ locked: prefs().imageSizeLocked }"
                  :title="prefs().imageSizeLocked ? '解除比例锁定' : '锁定比例'"
                  :disabled="isAutoMode"
                  @click="toggleSizeLock"
                >
                  <Link2 v-if="prefs().imageSizeLocked" :size="14" />
                  <Unlink2 v-else :size="14" />
                </button>
                <label class="size-field">
                  <span class="size-tag">H</span>
                  <input
                    type="number"
                    class="size-input"
                    :value="prefs().imageHeight"
                    min="64"
                    step="2"
                    :disabled="isAutoMode"
                    @change="onHeightInput"
                  />
                </label>
                <span class="size-unit">PX</span>
              </div>
            </template>

            <template v-else>
              <p class="label">画面比例</p>
              <div class="ratio-grid">
                <button
                  v-for="r in VIDEO_ASPECT_RATIOS"
                  :key="r.id"
                  type="button"
                  class="ratio-btn"
                  :class="{ active: prefs().videoAspectRatio === r.id }"
                  :disabled="isAutoMode"
                  @click="pickVideoRatio(r.id)"
                >
                  {{ r.label }}
                </button>
              </div>

              <p class="label">分辨率</p>
              <div class="ratio-grid resolution-grid">
                <button
                  v-for="res in VIDEO_RESOLUTIONS"
                  :key="res.id"
                  type="button"
                  class="ratio-btn"
                  :class="{ active: prefs().videoResolution === res.id }"
                  :title="res.hint"
                  :disabled="isAutoMode"
                  @click="pickVideoResolution(res.id)"
                >
                  {{ res.label }}
                </button>
              </div>

              <p class="label">选择视频生成时长</p>
              <div class="duration-list">
                <button
                  v-for="sec in VIDEO_DURATIONS"
                  :key="sec"
                  type="button"
                  class="duration-item"
                  :class="{ active: prefs().videoDuration === sec }"
                  :disabled="isAutoMode"
                  @click="pickVideoDuration(sec)"
                >
                  <Clock :size="14" class="duration-icon" />
                  <span>{{ sec }}s</span>
                  <Check v-if="prefs().videoDuration === sec" :size="14" class="duration-check" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.prefs-wrap {
  position: relative;
  display: contents;

  &--video-split {
    display: inline-flex;
    align-items: center;
    gap: 6px;
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

.video-pill {
  flex-shrink: 0;
}

.prefs-panel {
  display: flex;
  flex-direction: column;
  width: 560px;
  overflow: hidden;
  padding: 0;
}

.video-ratio-panel {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  padding: 12px 14px 14px;
}

.video-duration-panel {
  width: 160px;
  min-width: 160px;
  max-width: 160px;
  height: 333px;
  padding: 12px 0 0;
  overflow: hidden;

  .video-panel-label {
    padding: 0 14px;
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  .duration-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 6px 12px;
  }

  .duration-item {
    padding: 10px;
  }
}

.video-panel-label {
  margin-bottom: 10px;

  &--res {
    margin-top: 4px;
  }
}

.video-ratio-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
}

.video-ratio-option {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 4px;
  border-radius: 10px;
  color: var(--composer-muted);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }

  &.active {
    background: color-mix(in srgb, var(--composer-menu-text) 12%, transparent);
    color: var(--composer-menu-text);

    .ratio-preview-shape {
      border-color: var(--composer-menu-text);
    }
  }
}

.ratio-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 28px;
}

.ratio-preview-shape {
  display: block;
  width: 100%;
  max-width: 32px;
  max-height: 24px;
  border: 1.5px solid color-mix(in srgb, var(--composer-muted) 70%, transparent);
  border-radius: 3px;
  box-sizing: border-box;
}

.video-ratio-label {
  font-size: 11px;
  line-height: 1;
}

.video-res-row {
  display: flex;
  gap: 6px;
}

.video-res-btn {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid $border-light;
  font-size: 12px;
  color: var(--composer-muted);
  background: transparent;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }

  &.active {
    background: color-mix(in srgb, var(--composer-menu-text) 12%, transparent);
    border-color: color-mix(in srgb, var(--composer-menu-text) 25%, transparent);
    color: var(--composer-menu-text);
    font-weight: 600;
  }
}

.prefs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 14px 14px 10px;
  border-bottom: 1px solid $border-light;
}

.prefs-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--composer-menu-text);
}

.prefs-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--composer-muted);
  flex-shrink: 0;

  &:hover {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }
}

.auto-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: normal;
  color: var(--composer-muted);
  cursor: pointer;

  input {
    display: none;
  }

  .slider {
    width: 36px;
    height: 20px;
    background: color-mix(in srgb, var(--composer-muted) 30%, transparent);
    border-radius: 10px;
    position: relative;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: var(--bg-card, #fff);
      border-radius: 50%;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      transition: transform 0.2s;
    }
  }

  input:checked + .slider {
    background: $accent-cyan;

    &::after {
      transform: translateX(16px);
    }
  }
}

.prefs-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 14px;

  &--disabled {
    opacity: 0.45;
    pointer-events: none;
    user-select: none;
  }
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--composer-option-hover);
  border-radius: 10px;
  margin-bottom: 14px;
}

.tab {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--composer-muted);

  &:disabled {
    cursor: not-allowed;
  }

  &.active {
    background: var(--bg-card, rgba(255, 255, 255, 0.9));
    color: var(--composer-menu-text);
    font-weight: 500;
    box-shadow: $shadow-sm;
  }
}

.label {
  font-size: 12px;
  color: var(--composer-muted);
  margin-bottom: 8px;
}

.ratio-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;

  &--single-row {
    flex-wrap: nowrap;
    gap: 4px;

    .ratio-btn {
      flex: 1;
      min-width: 0;
      padding: 6px 4px;
    }
  }
}

.ratio-btn {
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 8px;
  border: 1px solid $border-light;
  color: var(--composer-muted);
  background: transparent;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:disabled {
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }

  &.active {
    background: rgba($accent, 0.1);
    border-color: rgba($accent, 0.45);
    color: $accent;
    font-weight: 600;
  }
}

.resolution-grid .ratio-btn {
  min-width: 52px;
}

.tier-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.tier-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 10px;
  border-radius: 12px;
  border: 1px solid $border-light;
  background: var(--composer-option-hover);
  font-size: 13px;
  color: var(--composer-menu-text);
  transition: background 0.15s, border-color 0.15s;

  &:disabled {
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--composer-border-focus) 40%, transparent);
  }

  &.active {
    background: color-mix(in srgb, var(--composer-menu-text) 12%, transparent);
    border-color: color-mix(in srgb, var(--composer-menu-text) 25%, transparent);
    font-weight: 600;
  }
}

.tier-star {
  color: $accent-cyan;
}

.size-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.size-field {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--composer-option-hover);
}

.size-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--composer-muted);
  flex-shrink: 0;
}

.size-input {
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--composer-menu-text);
  outline: none;
  box-shadow: none;
  -moz-appearance: textfield;

  &:focus {
    border: none;
    outline: none;
    box-shadow: none;
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
}

.size-lock {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--composer-muted);
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }

  &.locked {
    color: $accent;
  }
}

.size-unit {
  font-size: 11px;
  font-weight: 600;
  color: var(--composer-muted);
  flex-shrink: 0;
}

.duration-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.duration-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--composer-menu-text);
  text-align: left;

  &:disabled {
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    background: var(--composer-option-hover);
  }

  &.active {
    background: color-mix(in srgb, var(--composer-menu-text) 10%, transparent);
    font-weight: 500;
  }
}

.duration-icon {
  color: var(--composer-muted);
  flex-shrink: 0;
}

.duration-check {
  margin-left: auto;
  color: var(--composer-menu-text);
  flex-shrink: 0;
}
</style>

<style lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.create-composer-popover.prefs-panel {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
