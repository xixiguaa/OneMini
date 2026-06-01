<script setup lang="ts">
import {
  Check,
  ChevronUp,
  Gem,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const SMART_HD_RESOLUTIONS = [
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K', premium: true },
  { id: '8k', label: '8K', premium: true },
] as const

type SmartHdResolution = (typeof SMART_HD_RESOLUTIONS)[number]['id']

const props = withDefaults(
  defineProps<{
    open: boolean
    imageUrl?: string
    aspectRatio?: string
    /** 消耗积分，暂无后端时默认 0 */
    cost?: number
  }>(),
  {
    imageUrl: '',
    aspectRatio: '16 / 9',
    cost: 0,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { resolution: SmartHdResolution; detailLevel: number }]
}>()

const selectedResolution = ref<SmartHdResolution>('4k')
const detailLevel = ref(50)
const resolutionMenuOpen = ref(false)
const detailPanelOpen = ref(false)
const submitting = ref(false)

const selectedResolutionLabel = computed(
  () => SMART_HD_RESOLUTIONS.find((r) => r.id === selectedResolution.value)?.label ?? '4K',
)

function close() {
  if (submitting.value) return
  resolutionMenuOpen.value = false
  detailPanelOpen.value = false
  emit('update:open', false)
}

function pickResolution(id: SmartHdResolution) {
  selectedResolution.value = id
  resolutionMenuOpen.value = false
}

function toggleResolutionMenu() {
  resolutionMenuOpen.value = !resolutionMenuOpen.value
  if (resolutionMenuOpen.value) detailPanelOpen.value = false
}

function toggleDetailPanel() {
  detailPanelOpen.value = !detailPanelOpen.value
  if (detailPanelOpen.value) resolutionMenuOpen.value = false
}

function onSubmit() {
  if (!props.imageUrl || submitting.value) return
  submitting.value = true
  emit('submit', {
    resolution: selectedResolution.value,
    detailLevel: detailLevel.value,
  })
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
}

function onDocumentClick(e: MouseEvent) {
  if (!props.open) return
  const target = e.target
  if (!(target instanceof Element)) return
  if (target.closest('.smart-hd-res-menu, .smart-hd-res-trigger, .smart-hd-detail-panel, .smart-hd-detail-trigger')) {
    return
  }
  resolutionMenuOpen.value = false
  detailPanelOpen.value = false
}

watch(
  () => props.open,
  (visible) => {
    if (visible) {
      selectedResolution.value = '4k'
      detailLevel.value = 50
      resolutionMenuOpen.value = false
      detailPanelOpen.value = false
      submitting.value = false
    }
  },
)

defineExpose({ finishSubmit: () => { submitting.value = false } })

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="smart-hd-fade">
      <div
        v-if="open"
        class="smart-hd-overlay"
        role="presentation"
        @click.self="close"
      >
        <div class="smart-hd-dialog" role="dialog" aria-modal="true" aria-labelledby="smart-hd-title">
          <header class="smart-hd-head">
            <h2 id="smart-hd-title" class="smart-hd-title">智能超清</h2>
            <button type="button" class="smart-hd-close" title="关闭" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="smart-hd-body">
            <div class="smart-hd-preview" :style="{ aspectRatio }">
              <img v-if="imageUrl" :src="imageUrl" alt="" class="smart-hd-img" />
              <span class="smart-hd-ai-tag">AI 生成</span>

              <div class="smart-hd-controls">
                <div class="smart-hd-controls-left">
                  <button
                    type="button"
                    class="smart-hd-detail-trigger"
                    :class="{ active: detailPanelOpen }"
                    @click.stop="toggleDetailPanel"
                  >
                    <SlidersHorizontal :size="14" />
                    <span>细节生成程度</span>
                  </button>

                  <div v-if="detailPanelOpen" class="smart-hd-detail-panel" @click.stop>
                    <div class="smart-hd-detail-head">
                      <span>细节生成程度</span>
                      <strong>{{ detailLevel }}%</strong>
                    </div>
                    <input
                      v-model.number="detailLevel"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      class="smart-hd-detail-slider"
                    />
                  </div>
                </div>

                <div class="smart-hd-controls-right">
                  <div v-if="resolutionMenuOpen" class="smart-hd-res-menu" @click.stop>
                    <button
                      v-for="opt in SMART_HD_RESOLUTIONS"
                      :key="opt.id"
                      type="button"
                      class="smart-hd-res-option"
                      :class="{ active: selectedResolution === opt.id }"
                      @click="pickResolution(opt.id)"
                    >
                      <Sparkles v-if="opt.premium" :size="14" class="smart-hd-res-sparkle" />
                      <span v-else class="smart-hd-res-sparkle smart-hd-res-sparkle--placeholder" />
                      <span>{{ opt.label }}</span>
                      <Check v-if="selectedResolution === opt.id" :size="14" class="smart-hd-res-check" />
                    </button>
                  </div>

                  <button
                    type="button"
                    class="smart-hd-res-trigger"
                    :class="{ open: resolutionMenuOpen }"
                    :disabled="submitting || !imageUrl"
                    @click.stop="toggleResolutionMenu"
                  >
                    <span>放大至 {{ selectedResolutionLabel }}</span>
                    <ChevronUp :size="14" class="smart-hd-res-chevron" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <footer class="smart-hd-foot">
            <button
              type="button"
              class="smart-hd-cost"
              :disabled="submitting || !imageUrl"
              @click="onSubmit"
            >
              <Gem :size="14" />
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

.smart-hd-overlay {
  @include cosmic.cosmic-modal-overlay(260);
}

.smart-hd-dialog {
  @include cosmic.cosmic-modal-panel-wide(920px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 18px 16px;
  width: min(920px, calc(100vw - 48px));
}

.smart-hd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.smart-hd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

.smart-hd-close {
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

.smart-hd-body {
  min-width: 0;
}

.smart-hd-preview {
  position: relative;
  width: 100%;
  max-height: min(72vh, 640px);
  border-radius: var(--glass-radius-sm, 14px);
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
}

.smart-hd-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.smart-hd-ai-tag {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: $text-secondary;
  background: var(--bg-card);
  border: 1px solid $border-light;
  backdrop-filter: blur(var(--glass-blur, 24px));
}

.smart-hd-controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.18) 72%, transparent 100%);
}

.smart-hd-controls-left,
.smart-hd-controls-right {
  position: relative;
  display: flex;
  align-items: flex-end;
}

.smart-hd-detail-trigger,
.smart-hd-res-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(12px);
  transition: background 0.15s, border-color 0.15s;

  &:hover:not(:disabled),
  &.active,
  &.open {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.28);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.smart-hd-detail-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  width: min(240px, calc(100vw - 120px));
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(18, 18, 24, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
}

.smart-hd-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);

  strong {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    font-variant-numeric: tabular-nums;
  }
}

.smart-hd-detail-slider {
  width: 100%;
  accent-color: $accent-cyan;
}

.smart-hd-res-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  min-width: 132px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(18, 18, 24, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(16px);
}

.smart-hd-res-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.88);
  text-align: left;
  transition: background 0.15s;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: $accent-cyan;
  }
}

.smart-hd-res-sparkle {
  flex-shrink: 0;
  color: $accent-cyan;
  opacity: 0.95;

  &--placeholder {
    width: 14px;
    height: 14px;
    opacity: 0;
  }
}

.smart-hd-res-check {
  margin-left: auto;
  flex-shrink: 0;
  color: $accent-cyan;
}

.smart-hd-res-chevron {
  flex-shrink: 0;
  opacity: 0.75;
  transition: transform 0.2s;

  .smart-hd-res-trigger.open & {
    transform: rotate(180deg);
  }
}

.smart-hd-foot {
  display: flex;
  justify-content: flex-end;
}

.smart-hd-cost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
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

.smart-hd-fade-enter-active,
.smart-hd-fade-leave-active {
  transition: opacity 0.2s ease;

  .smart-hd-dialog {
    transition: transform 0.22s ease, opacity 0.22s ease;
  }
}

.smart-hd-fade-enter-from,
.smart-hd-fade-leave-to {
  opacity: 0;

  .smart-hd-dialog {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}
</style>
