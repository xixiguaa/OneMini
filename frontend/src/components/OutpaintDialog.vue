<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const EXPANSION_SCALES = [1.5, 2, 3] as const

const RATIO_PRESETS = [
  { id: 'original', label: '原比例' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
] as const

type ExpansionScale = (typeof EXPANSION_SCALES)[number]
type RatioPreset = (typeof RATIO_PRESETS)[number]['id']

const props = withDefaults(
  defineProps<{
    open: boolean
    imageUrl?: string
    /** 原图宽高比 id，如 16:9 */
    sourceRatioId?: string
  }>(),
  {
    imageUrl: '',
    sourceRatioId: '16:9',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { prompt: string; scale: number; ratio: RatioPreset }]
}>()

type FrameInsets = { top: number; right: number; bottom: number; left: number }
type HandleId = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r'

const prompt = ref('')
const expansionScale = ref<ExpansionScale>(1.5)
const ratioPreset = ref<RatioPreset>('original')
const submitting = ref(false)
const isManualFrame = ref(false)
const frameInsets = ref<FrameInsets>({ top: 0, right: 0, bottom: 0, left: 0 })

const dragging = ref<{
  handle: HandleId
  startX: number
  startY: number
  startInsets: FrameInsets
  fitScale: number
} | null>(null)

function parseRatio(id: string): [number, number] {
  const parts = id.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 2 || parts.some((n) => !n)) return [16, 9]
  return [parts[0], parts[1]]
}

function getBaseImageSize() {
  const [srcW, srcH] = parseRatio(props.sourceRatioId || '16:9')
  const base = 280
  const imgW = srcW >= srcH ? base : Math.round((base * srcW) / srcH)
  const imgH = srcW >= srcH ? Math.round((base * srcH) / srcW) : base
  return { imgW, imgH }
}

function computeInsetsFromPreset(scale: ExpansionScale, ratio: RatioPreset): FrameInsets {
  const { imgW, imgH } = getBaseImageSize()
  let frameW = imgW * scale
  let frameH = imgH * scale

  if (ratio !== 'original') {
    const [tw, th] = parseRatio(ratio)
    const targetAspect = tw / th
    const frameAspect = frameW / frameH
    if (targetAspect > frameAspect) {
      frameW = frameH * targetAspect
    } else {
      frameH = frameW / targetAspect
    }
    frameW = Math.max(frameW, imgW * 1.08)
    frameH = Math.max(frameH, imgH * 1.08)
  }

  return {
    top: (frameH - imgH) / 2,
    right: (frameW - imgW) / 2,
    bottom: (frameH - imgH) / 2,
    left: (frameW - imgW) / 2,
  }
}

function applyPresetInsets() {
  frameInsets.value = computeInsetsFromPreset(expansionScale.value, ratioPreset.value)
  isManualFrame.value = false
}

function minInset() {
  const { imgW, imgH } = getBaseImageSize()
  return Math.round(Math.min(imgW, imgH) * 0.04)
}

const layout = computed(() => {
  const { imgW, imgH } = getBaseImageSize()
  const frameW = imgW + frameInsets.value.left + frameInsets.value.right
  const frameH = imgH + frameInsets.value.top + frameInsets.value.bottom
  const displayScale = Math.max(frameW / imgW, frameH / imgH)

  // 高倍数时缩小预览框，避免与角标、倍数切换等控件重叠
  const maxFrameW = 720
  const maxFrameH = 300
  const fitScale = Math.min(1, maxFrameW / frameW, maxFrameH / frameH)

  return {
    imgW: Math.round(imgW * fitScale),
    imgH: Math.round(imgH * fitScale),
    frameW: Math.round(frameW * fitScale),
    frameH: Math.round(frameH * fitScale),
    insetTop: Math.round(frameInsets.value.top * fitScale),
    insetLeft: Math.round(frameInsets.value.left * fitScale),
    displayScale: displayScale.toFixed(1),
    fitScale,
  }
})

function setExpansionScale(scale: ExpansionScale) {
  expansionScale.value = scale
  applyPresetInsets()
}

function setRatioPreset(ratio: RatioPreset) {
  ratioPreset.value = ratio
  applyPresetInsets()
}

function onHandlePointerDown(e: PointerEvent, handle: HandleId) {
  e.preventDefault()
  e.stopPropagation()
  dragging.value = {
    handle,
    startX: e.clientX,
    startY: e.clientY,
    startInsets: { ...frameInsets.value },
    fitScale: layout.value.fitScale,
  }
  isManualFrame.value = true
  window.addEventListener('pointermove', onHandlePointerMove)
  window.addEventListener('pointerup', onHandlePointerUp)
  window.addEventListener('pointercancel', onHandlePointerUp)
}

function onHandlePointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const { handle, startX, startY, startInsets, fitScale } = dragging.value
  const dx = (e.clientX - startX) / fitScale
  const dy = (e.clientY - startY) / fitScale
  const min = minInset()

  const next = { ...startInsets }
  switch (handle) {
    case 'tl':
      next.left = Math.max(min, startInsets.left - dx)
      next.top = Math.max(min, startInsets.top - dy)
      break
    case 'tr':
      next.right = Math.max(min, startInsets.right + dx)
      next.top = Math.max(min, startInsets.top - dy)
      break
    case 'bl':
      next.left = Math.max(min, startInsets.left - dx)
      next.bottom = Math.max(min, startInsets.bottom + dy)
      break
    case 'br':
      next.right = Math.max(min, startInsets.right + dx)
      next.bottom = Math.max(min, startInsets.bottom + dy)
      break
    case 't':
      next.top = Math.max(min, startInsets.top - dy)
      break
    case 'b':
      next.bottom = Math.max(min, startInsets.bottom + dy)
      break
    case 'l':
      next.left = Math.max(min, startInsets.left - dx)
      break
    case 'r':
      next.right = Math.max(min, startInsets.right + dx)
      break
  }
  frameInsets.value = next
}

function onHandlePointerUp() {
  dragging.value = null
  window.removeEventListener('pointermove', onHandlePointerMove)
  window.removeEventListener('pointerup', onHandlePointerUp)
  window.removeEventListener('pointercancel', onHandlePointerUp)
}

function handleCursor(handle: HandleId) {
  const map: Record<HandleId, string> = {
    tl: 'nwse-resize',
    tr: 'nesw-resize',
    bl: 'nesw-resize',
    br: 'nwse-resize',
    t: 'ns-resize',
    b: 'ns-resize',
    l: 'ew-resize',
    r: 'ew-resize',
  }
  return map[handle]
}

function close() {
  if (submitting.value) return
  emit('update:open', false)
}

function onSubmit() {
  if (!props.imageUrl || submitting.value) return
  submitting.value = true
  const { imgW, imgH } = getBaseImageSize()
  const frameW = imgW + frameInsets.value.left + frameInsets.value.right
  const frameH = imgH + frameInsets.value.top + frameInsets.value.bottom
  emit('submit', {
    prompt: prompt.value.trim(),
    scale: Math.max(frameW / imgW, frameH / imgH),
    ratio: ratioPreset.value,
  })
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
}

watch(
  () => props.open,
  (visible) => {
    if (visible) {
      prompt.value = ''
      expansionScale.value = 1.5
      ratioPreset.value = 'original'
      submitting.value = false
      applyPresetInsets()
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  onHandlePointerUp()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="outpaint-fade">
      <div v-if="open" class="outpaint-overlay" role="presentation" @click.self="close">
        <div class="outpaint-dialog" role="dialog" aria-modal="true" aria-labelledby="outpaint-title">
          <header class="outpaint-head">
            <h2 id="outpaint-title" class="outpaint-title">扩图</h2>
            <button type="button" class="outpaint-close" title="关闭" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="outpaint-canvas-wrap">
            <div
              class="outpaint-canvas"
              :class="{ 'outpaint-canvas--large-scale': Number(layout.displayScale) >= 2 }"
            >
              <div class="outpaint-canvas-top">
                <span class="outpaint-scale-badge">{{ layout.displayScale }}x</span>
              </div>

              <div class="outpaint-canvas-stage">
                <div
                  class="outpaint-frame"
                  :class="{ 'outpaint-frame--dragging': dragging }"
                  :style="{ width: `${layout.frameW}px`, height: `${layout.frameH}px` }"
                >
                  <div class="outpaint-checker" aria-hidden="true" />
                  <div
                    class="outpaint-image-box"
                    :style="{
                      width: `${layout.imgW}px`,
                      height: `${layout.imgH}px`,
                      left: `${layout.insetLeft}px`,
                      top: `${layout.insetTop}px`,
                    }"
                  >
                    <img v-if="imageUrl" :src="imageUrl" alt="" class="outpaint-image" />
                  </div>
                  <span
                    v-for="handle in (['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'] as HandleId[])"
                    :key="handle"
                    class="outpaint-handle"
                    :class="`outpaint-handle--${handle}`"
                    :style="{ cursor: handleCursor(handle) }"
                    @pointerdown="onHandlePointerDown($event, handle)"
                  />
                </div>
              </div>

              <div class="outpaint-canvas-foot">
                <div class="outpaint-scale-pills" role="tablist" aria-label="扩图倍数">
                  <button
                    v-for="scale in EXPANSION_SCALES"
                    :key="scale"
                    type="button"
                    class="outpaint-scale-pill"
                    :class="{ active: !isManualFrame && expansionScale === scale }"
                    @click="setExpansionScale(scale)"
                  >
                    {{ scale }}x
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="outpaint-ratio-row" role="tablist" aria-label="宽高比">
            <button
              v-for="preset in RATIO_PRESETS"
              :key="preset.id"
              type="button"
              class="outpaint-ratio-btn"
              :class="{ active: !isManualFrame && ratioPreset === preset.id }"
              @click="setRatioPreset(preset.id)"
            >
              <span
                class="outpaint-ratio-icon"
                :class="{
                  'outpaint-ratio-icon--original': preset.id === 'original',
                  'outpaint-ratio-icon--1-1': preset.id === '1:1',
                  'outpaint-ratio-icon--3-4': preset.id === '3:4',
                  'outpaint-ratio-icon--9-16': preset.id === '9:16',
                  'outpaint-ratio-icon--4-3': preset.id === '4:3',
                }"
                aria-hidden="true"
              />
              <span>{{ preset.label }}</span>
            </button>
          </div>

          <textarea
            v-model="prompt"
            class="outpaint-prompt"
            rows="2"
            placeholder="描述想要扩图的内容，不填将基于原图生成"
          />

          <footer class="outpaint-foot">
            <button
              type="button"
              class="outpaint-submit"
              :disabled="submitting || !imageUrl"
              @click="onSubmit"
            >
              生成
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.outpaint-overlay {
  @include cosmic.cosmic-modal-overlay(260);
}

.outpaint-dialog {
  @include cosmic.cosmic-modal-panel-wide(920px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 18px 16px;
  width: min(920px, calc(100vw - 48px));
}

.outpaint-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.outpaint-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

.outpaint-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: $text-muted;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--composer-option-hover, $accent-light);
    color: $text-primary;
  }
}

.outpaint-canvas-wrap {
  min-width: 0;
}

.outpaint-canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: min(52vh, 420px);
  padding: 16px 20px 18px;
  border-radius: var(--glass-radius-sm, 14px);
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid $border-light;
  box-sizing: border-box;

  &--large-scale {
    gap: 14px;
    padding: 18px 24px 20px;
  }
}

.outpaint-canvas-top {
  flex-shrink: 0;
  min-height: 28px;
  display: flex;
  align-items: center;
}

.outpaint-canvas-stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 8px 4px;
  overflow: hidden;
}

.outpaint-canvas-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding-top: 2px;
}

.outpaint-scale-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: $text-primary;
  background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
  border: 1px solid color-mix(in srgb, $border-light 85%, transparent);
  backdrop-filter: blur(var(--glass-blur, 24px));
}

.outpaint-frame {
  position: relative;
  border: 1.5px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  user-select: none;

  &--dragging {
    .outpaint-handle {
      opacity: 1;
    }
  }
}

.outpaint-checker {
  position: absolute;
  inset: 0;
  background-color: #2a2a30;
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.06) 75%);
  background-size: 16px 16px;
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
}

.outpaint-image-box {
  position: absolute;
  z-index: 1;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.outpaint-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.outpaint-handle {
  position: absolute;
  z-index: 2;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  touch-action: none;

  &::after {
    content: '';
    position: absolute;
    inset: -8px;
  }

  &--tl,
  &--tr,
  &--bl,
  &--br {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  &--tl {
    top: -5px;
    left: -5px;
  }

  &--tr {
    top: -5px;
    right: -5px;
  }

  &--bl {
    bottom: -5px;
    left: -5px;
  }

  &--br {
    bottom: -5px;
    right: -5px;
  }

  &--t,
  &--b {
    left: 50%;
    width: 18px;
    height: 6px;
    margin-left: -9px;
    border-radius: 3px;
  }

  &--t {
    top: -3px;
  }

  &--b {
    bottom: -3px;
  }

  &--l,
  &--r {
    top: 50%;
    width: 6px;
    height: 18px;
    margin-top: -9px;
    border-radius: 3px;
  }

  &--l {
    left: -3px;
  }

  &--r {
    right: -3px;
  }

  &:hover {
    background: #fff;
    box-shadow: 0 0 0 2px rgba(124, 95, 232, 0.45);
  }
}

.outpaint-scale-pills {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-elevated) 92%, transparent);
  border: 1px solid color-mix(in srgb, $border-light 85%, transparent);
  backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  box-shadow: var(--glass-inset-highlight, inset 1px 1px 0 rgba(255, 255, 255, 0.15));
}

.outpaint-scale-pill {
  min-width: 48px;
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  outline: none;

  &:hover {
    color: $text-secondary;
  }

  &.active {
    color: $accent-emphasis;
    background: var(--composer-option-hover, $accent-light);
    border-color: color-mix(in srgb, $accent 35%, $border-light);
    box-shadow: none;
  }

  &:focus-visible {
    box-shadow: var(--shadow-focus, 0 0 0 1px rgba(124, 95, 232, 0.28));
  }
}

.outpaint-ratio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

.outpaint-ratio-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 56px;
  padding: 8px 10px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: $text-muted;
  background: var(--bg-elevated);
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover {
    color: $text-secondary;
    background: var(--composer-option-hover, $accent-light);
  }

  &.active {
    color: $accent-emphasis;
    background: var(--composer-option-hover, $accent-light);
    border-color: color-mix(in srgb, $accent 35%, $border-light);
  }
}

.outpaint-ratio-icon {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  opacity: 0.85;

  &--original {
    width: 22px;
    height: 14px;
  }

  &--1-1 {
    width: 16px;
    height: 16px;
  }

  &--3-4 {
    width: 14px;
    height: 18px;
  }

  &--9-16 {
    width: 11px;
    height: 18px;
  }

  &--4-3 {
    width: 18px;
    height: 14px;
  }
}

.outpaint-prompt {
  width: 100%;
  min-height: 72px;
  padding: 12px 14px;
  border-radius: 12px;
  resize: none;
  font-size: 14px;
  line-height: 1.55;
  color: $text-primary;
  @include cosmic.cosmic-glass-frost(12px);
  background: var(--composer-bg, var(--glass-fill-gradient));
  border: 1px solid $border-light;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: color-mix(in srgb, $accent 40%, $border-light);
    box-shadow: var(--shadow-focus, 0 0 0 1px rgba(124, 95, 232, 0.28));
  }

  &::placeholder {
    color: $text-muted;
  }
}

.outpaint-foot {
  display: flex;
  justify-content: flex-end;
}

.outpaint-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: $btn-primary-text;
  background: var(--btn-primary-gradient, $accent);
  box-shadow: var(--btn-primary-shadow, $shadow-sm);
  transition: filter 0.15s, transform 0.15s;

  &:hover:not(:disabled) {
    filter: brightness(1.04);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.outpaint-fade-enter-active,
.outpaint-fade-leave-active {
  transition: opacity 0.2s ease;

  .outpaint-dialog {
    transition: transform 0.22s ease, opacity 0.22s ease;
  }
}

.outpaint-fade-enter-from,
.outpaint-fade-leave-to {
  opacity: 0;

  .outpaint-dialog {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}
</style>
