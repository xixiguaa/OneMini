<script setup lang="ts">
import { Sparkles, X } from 'lucide-vue-next'
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
    cost?: number
  }>(),
  {
    imageUrl: '',
    sourceRatioId: '16:9',
    cost: 1,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { prompt: string; scale: ExpansionScale; ratio: RatioPreset }]
}>()

const prompt = ref('')
const expansionScale = ref<ExpansionScale>(1.5)
const ratioPreset = ref<RatioPreset>('original')
const submitting = ref(false)

function parseRatio(id: string): [number, number] {
  const parts = id.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 2 || parts.some((n) => !n)) return [16, 9]
  return [parts[0], parts[1]]
}

const layout = computed(() => {
  const [srcW, srcH] = parseRatio(props.sourceRatioId || '16:9')
  const base = 280
  const imgW = srcW >= srcH ? base : Math.round((base * srcW) / srcH)
  const imgH = srcW >= srcH ? Math.round((base * srcH) / srcW) : base

  let frameW = imgW * expansionScale.value
  let frameH = imgH * expansionScale.value

  if (ratioPreset.value !== 'original') {
    const [tw, th] = parseRatio(ratioPreset.value)
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

  const displayScale = Math.max(frameW / imgW, frameH / imgH)

  return {
    imgW,
    imgH,
    frameW: Math.round(frameW),
    frameH: Math.round(frameH),
    displayScale: displayScale.toFixed(1),
  }
})

function close() {
  if (submitting.value) return
  emit('update:open', false)
}

function onSubmit() {
  if (!props.imageUrl || submitting.value) return
  submitting.value = true
  emit('submit', {
    prompt: prompt.value.trim(),
    scale: expansionScale.value,
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
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
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
            <div class="outpaint-canvas">
              <span class="outpaint-scale-badge">{{ layout.displayScale }}x</span>

              <div
                class="outpaint-frame"
                :style="{ width: `${layout.frameW}px`, height: `${layout.frameH}px` }"
              >
                <div class="outpaint-checker" aria-hidden="true" />
                <div
                  class="outpaint-image-box"
                  :style="{ width: `${layout.imgW}px`, height: `${layout.imgH}px` }"
                >
                  <img v-if="imageUrl" :src="imageUrl" alt="" class="outpaint-image" />
                </div>
                <span class="outpaint-handle outpaint-handle--tl" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--tr" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--bl" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--br" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--t" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--b" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--l" aria-hidden="true" />
                <span class="outpaint-handle outpaint-handle--r" aria-hidden="true" />
              </div>

              <div class="outpaint-scale-pills" role="tablist" aria-label="扩图倍数">
                <button
                  v-for="scale in EXPANSION_SCALES"
                  :key="scale"
                  type="button"
                  class="outpaint-scale-pill"
                  :class="{ active: expansionScale === scale }"
                  @click="expansionScale = scale"
                >
                  {{ scale }}x
                </button>
              </div>
            </div>
          </div>

          <div class="outpaint-ratio-row" role="tablist" aria-label="宽高比">
            <button
              v-for="preset in RATIO_PRESETS"
              :key="preset.id"
              type="button"
              class="outpaint-ratio-btn"
              :class="{ active: ratioPreset === preset.id }"
              @click="ratioPreset = preset.id"
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
              <Sparkles :size="14" />
              <span>{{ cost }}</span>
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
  gap: 14px;
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
  align-items: center;
  justify-content: center;
  min-height: min(52vh, 420px);
  padding: 28px 20px 52px;
  border-radius: var(--glass-radius-sm, 14px);
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid $border-light;
}

.outpaint-scale-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

.outpaint-frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
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
  position: relative;
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
  pointer-events: none;

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
}

.outpaint-scale-pills {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
}

.outpaint-scale-pill {
  min-width: 44px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.72);
  transition: background 0.15s, color 0.15s;

  &:hover {
    color: #fff;
  }

  &.active {
    color: $text-primary;
    background: var(--bg-card);
    box-shadow: $shadow-sm;
  }
}

.outpaint-ratio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
    color: $accent-cyan;
    background: color-mix(in srgb, $accent-cyan 10%, transparent);
    border-color: color-mix(in srgb, $accent-cyan 35%, transparent);
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
  background: var(--bg-elevated);
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
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: $text-primary;
  background: var(--bg-card);
  border: 1px solid $border-light;
  box-shadow: $shadow-sm;
  transition: filter 0.15s, transform 0.15s;

  &:hover:not(:disabled) {
    filter: brightness(1.04);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  svg {
    color: $accent-cyan;
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
