<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useHoverPopper } from '../composables/useHoverPopper'
import { formatGenerationTime } from '../utils/formatGenerationTime'
import type { ParsedAttachment } from '../utils/files'

const props = withDefaults(
  defineProps<{
    attachments: ParsedAttachment[]
    compact?: boolean
    /** 数字人等场景仅允许一张参考图 */
    single?: boolean
    /** 参考图对应的生成时间（毫秒时间戳），有值时 hover 展示 popper */
    generatedAt?: number
  }>(),
  { compact: false, single: false },
)

const emit = defineEmits<{
  add: []
  remove: [id: string]
}>()

/** 交替倾斜：左 → 右 → 左 … */
function fanTilt(index: number) {
  return index % 2 === 0 ? -8 : 8
}

/** 折叠时最多叠 3 张 */
const STACK_LAYERS = [
  { rotate: fanTilt(0), offsetX: -3, offsetY: 0 },
  { rotate: fanTilt(1), offsetX: 2, offsetY: 0 },
  { rotate: fanTilt(2), offsetX: 0, offsetY: 0 },
] as const

const expanded = ref(false)
let collapseTimer: ReturnType<typeof setTimeout> | null = null

/** 收起延迟：等扇形动画基本落定后再收，避免中途硬切 */
const COLLAPSE_DELAY_MS = 380

const frameW = computed(() => (props.compact ? 38 : 52))
/** 展开时相邻卡片重叠宽度 */
const fanOverlap = computed(() => (props.compact ? 6 : 1))
const fanStep = computed(() => frameW.value - fanOverlap.value)
/** 偶数位与前一卡倾斜相向时，视觉重叠偏大，需额外右移 */
const fanConvergeGap = computed(() => (props.compact ? 8 : 14))

const allImages = computed(() => props.attachments.filter((a) => a.kind === 'image'))

const visibleStack = computed(() => {
  const images = allImages.value
  if (images.length <= 3) return images
  return images.slice(-3)
})

const stackOffset = computed(() => Math.max(0, allImages.value.length - visibleStack.value.length))

const canExpand = computed(() => !props.single && allImages.value.length > 0)

const showExpanded = computed(() => canExpand.value && expanded.value)

const topImage = computed(() => allImages.value.at(-1))

function fanX(index: number) {
  const base = index * fanStep.value
  if (index <= 0 || index % 2 !== 0) return base
  return base + fanConvergeGap.value
}

/** 展开时的总宽度，用于 hover 热区 */
const fanWidth = computed(() => {
  const count = allImages.value.length + 1
  if (count <= 1) return frameW.value
  return fanX(count - 1) + frameW.value
})

const hoverZoneWidth = computed(() =>
  showExpanded.value && canExpand.value ? fanWidth.value : frameW.value,
)

function isVisibleInStack(item: ParsedAttachment) {
  return visibleStack.value.some((img) => img.id === item.id)
}

function fanDelay(index: number) {
  const last = Math.max(0, allImages.value.length - 1)
  return showExpanded.value ? index * 42 : (last - index) * 34
}

function addFanStyle() {
  const index = allImages.value.length
  const tilt = fanTilt(index)
  return {
    '--fan-x': `${fanX(index)}px`,
    '--fan-rotate': `${tilt}deg`,
    '--fan-delay': `${fanDelay(index)}ms`,
    zIndex: index + 1,
  }
}

function frameStyle(item: ParsedAttachment, globalIndex: number) {
  const stackIndex = visibleStack.value.findIndex((img) => img.id === item.id)
  const layer = STACK_LAYERS[stackIndex >= 0 ? stackIndex : 0] ?? STACK_LAYERS[STACK_LAYERS.length - 1]

  return {
    '--stack-x': `${layer.offsetX}px`,
    '--stack-y': `${layer.offsetY}px`,
    '--stack-rotate': `${layer.rotate}deg`,
    '--fan-x': `${fanX(globalIndex)}px`,
    '--fan-rotate': `${fanTilt(globalIndex)}deg`,
    '--fan-delay': `${fanDelay(globalIndex)}ms`,
    zIndex: showExpanded.value ? globalIndex + 1 : stackIndex >= 0 ? stackIndex + 1 : 0,
  }
}

function removeImage(id: string) {
  emit('remove', id)
}

function removeTop() {
  const top = topImage.value
  if (top) emit('remove', top.id)
}

function openExpand() {
  if (!canExpand.value) return
  if (collapseTimer) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
  expanded.value = true
}

function scheduleCollapse() {
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    collapseTimer = null
    expanded.value = false
  }, COLLAPSE_DELAY_MS)
}

function onAddClick(e: MouseEvent) {
  e.stopPropagation()
  emit('add')
}

const timePopper = useHoverPopper({ placement: 'below', offsetX: -6 })
const namePopper = useHoverPopper({ placement: 'above', gap: 24 })

const showTimePopper = computed(
  () =>
    !!props.generatedAt &&
    Number.isFinite(props.generatedAt) &&
    timePopper.activeKey.value === 'ref',
)

const activeNameItem = computed(() =>
  allImages.value.find((img) => img.id === namePopper.activeKey.value),
)

const showNamePopper = computed(
  () => !!activeNameItem.value?.name && !activeNameItem.value.loading,
)

function onPileEnter(e: MouseEvent) {
  if (!props.generatedAt || !Number.isFinite(props.generatedAt)) return
  timePopper.show('ref', e.currentTarget as HTMLElement)
}

function onPileLeave() {
  timePopper.hide()
}

function onFrameEnter(item: ParsedAttachment, e: MouseEvent) {
  if (item.loading || !item.name.trim()) return
  namePopper.show(item.id, e.currentTarget as HTMLElement)
}

function onFrameLeave() {
  namePopper.hide()
}
</script>

<template>
  <div
    class="ref-image-stack"
    :class="{
      compact,
      single,
      expanded: showExpanded,
      'ref-image-stack--multi': canExpand,
    }"
  >
    <div
      v-if="!allImages.length"
      class="ref-image-stack__track ref-image-stack__track--empty"
    >
      <button
        type="button"
        class="ref-image-empty"
        :title="single ? '上传参考图' : '上传参考内容'"
        @click="onAddClick"
      >
        <Plus :size="compact ? 14 : 16" stroke-width="1.75" />
        <span v-if="!compact" class="ref-image-empty__label">参考内容</span>
      </button>
    </div>

    <div
      v-else
      class="ref-image-stack__track"
      :class="{ expanded: showExpanded }"
      @mouseenter="openExpand"
      @mouseleave="scheduleCollapse"
    >
      <div
        class="ref-image-stack__hover-zone"
        :style="{ width: `${hoverZoneWidth}px` }"
      >
        <div
          class="ref-image-stack__pile"
          :aria-label="`已上传 ${allImages.length} 张参考图`"
          @mouseenter="onPileEnter"
          @mouseleave="onPileLeave"
        >
          <div
            v-for="(item, index) in allImages"
            :key="item.id"
            class="ref-image-frame"
            :class="{
              loading: item.loading,
              top: index === allImages.length - 1,
              'stack-hidden': !showExpanded && !isVisibleInStack(item),
            }"
            :style="frameStyle(item, index)"
            @mouseenter="onFrameEnter(item, $event)"
            @mouseleave="onFrameLeave"
          >
            <div class="ref-image-frame__surface">
              <div class="ref-image-frame__media">
                <template v-if="item.loading">
                  <div class="ref-image-skeleton" aria-hidden="true" />
                </template>
                <img
                  v-else-if="item.previewUrl"
                  :src="item.previewUrl"
                  :alt="item.name"
                  class="ref-image-img"
                />
              </div>
              <button
                v-if="!item.loading && (showExpanded || index === allImages.length - 1)"
                type="button"
                class="ref-image-remove"
                title="移除"
                @click.stop="showExpanded || single ? removeImage(item.id) : removeTop()"
              >
                <X :size="10" stroke-width="2.5" />
              </button>
            </div>
          </div>

          <span
            v-if="stackOffset > 0"
            class="ref-image-more"
            :class="{ 'ref-image-more--hidden': showExpanded }"
          >
            +{{ stackOffset }}
          </span>

          <button
            v-if="canExpand"
            type="button"
            class="ref-image-frame ref-image-frame--upload ref-image-add--fan"
            :class="{ 'is-active': showExpanded }"
            :style="addFanStyle()"
            :title="single ? '上传参考图' : '继续上传参考图'"
            :tabindex="showExpanded ? 0 : -1"
            @click="onAddClick"
          >
            <span class="ref-image-frame__surface ref-image-upload-surface">
              <Plus :size="compact ? 12 : 14" stroke-width="2.25" />
              <span class="ref-image-upload-surface__label">参考内容</span>
            </span>
          </button>
          <button
            v-if="canExpand"
            type="button"
            class="ref-image-add ref-image-add--dot"
            :class="{ 'is-active': !showExpanded }"
            :title="single ? '上传参考图' : '继续上传参考图'"
            :tabindex="showExpanded ? -1 : 0"
            @click="onAddClick"
          >
            <Plus :size="compact ? 12 : 14" stroke-width="2.25" />
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showNamePopper" class="ref-name-popper" :style="namePopper.panelStyle.value">
        {{ activeNameItem!.name }}
      </div>
      <div v-if="showTimePopper" class="ref-time-popper" :style="timePopper.panelStyle.value">
        <span class="ref-time-popper__label">生成时间</span>
        <span class="ref-time-popper__value">{{ formatGenerationTime(generatedAt!) }}</span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

$frame-w: 52px;
$frame-h: 68px;
$frame-w-compact: 38px;
$frame-h-compact: 50px;
$ref-ease: cubic-bezier(0.16, 1, 0.3, 1);
$ref-fan-duration: 0.72s;
$ref-fade-duration: 0.56s;

.ref-image-stack {
  position: relative;
  flex-shrink: 0;
  width: $frame-w;
  height: $frame-h;
  overflow: visible;

  &.compact {
    width: $frame-w-compact;
    height: $frame-h-compact;
  }

  &.expanded {
    z-index: 30;
  }

  &--multi:not(.expanded):hover .ref-image-add {
    transform: scale(1.06);
  }
}

.ref-image-stack__track {
  position: relative;
  width: $frame-w;
  height: $frame-h;
  overflow: visible;

  .compact & {
    width: $frame-w-compact;
    height: $frame-h-compact;
  }

  &--empty {
    width: auto;
    height: auto;
  }
}

.ref-image-stack__hover-zone {
  position: relative;
  width: $frame-w;
  height: $frame-h;
  overflow: visible;
  transition: width $ref-fan-duration $ref-ease;

  .compact & {
    width: $frame-w-compact;
    height: $frame-h-compact;
  }
}

.ref-image-stack__pile {
  position: absolute;
  left: 0;
  bottom: 0;
  width: $frame-w;
  height: $frame-h;
  overflow: visible;

  .compact & {
    width: $frame-w-compact;
    height: $frame-h-compact;
  }
}

.ref-image-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: $frame-w;
  height: $frame-h;
  border-radius: 10px;
  border: 1.5px dashed color-mix(in srgb, var(--composer-muted, $text-muted) 55%, transparent);
  background: var(--composer-pill-bg, rgba(30, 32, 38, 0.88));
  color: var(--composer-muted, $text-muted);
  transform-origin: center bottom;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.25s ease;

  .compact & {
    width: $frame-w-compact;
    height: $frame-h-compact;
    gap: 3px;
    border-radius: 8px;
  }

  &:hover {
    color: var(--composer-text, $text-primary);
    border-color: color-mix(in srgb, var(--composer-border-focus, $accent) 45%, transparent);
    box-shadow: var(--glass-float-shadow, $shadow-md);
  }

  &__label {
    max-width: 40px;
    font-size: 9px;
    line-height: 1.2;
    text-align: center;

    .compact & {
      max-width: 34px;
      font-size: 7px;
    }
  }
}

.ref-image-frame {
  position: absolute;
  inset: 0;
  overflow: visible;
  transform: translate(var(--stack-x, 0), var(--stack-y, 0)) rotate(var(--stack-rotate, 0deg));
  transform-origin: center bottom;
  transition:
    transform $ref-fan-duration $ref-ease var(--fan-delay, 0ms),
    opacity $ref-fade-duration $ref-ease var(--fan-delay, 0ms),
    z-index 0s $ref-fan-duration;

  .ref-image-stack__track.expanded & {
    transition:
      transform $ref-fan-duration $ref-ease var(--fan-delay, 0ms),
      opacity $ref-fade-duration $ref-ease var(--fan-delay, 0ms),
      z-index 0s;
  }

  &.stack-hidden {
    opacity: 0;
    pointer-events: none;
  }

  &__surface {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    padding: 3px;
    background: #fff;
    box-shadow:
      0 2px 8px rgba(15, 23, 42, 0.14),
      0 0 0 0.5px rgba(15, 23, 42, 0.06);
    transform-origin: center bottom;
    overflow: visible;
    transition:
      transform 0.38s $ref-ease,
      box-shadow 0.38s ease;
  }

  &__media {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 3px;
  }

  .compact &__media {
    border-radius: 2px;
  }

  .compact &__surface {
    border-radius: 5px;
    padding: 2px;
  }

  &.loading &__surface {
    background: var(--composer-pill-bg, $bg-input);
  }

  .ref-image-stack__track:not(.expanded) &:hover {
    z-index: 20;

    .ref-image-frame__surface {
      transform: scale(1.08) translateY(-6px);
      box-shadow:
        0 10px 24px rgba(15, 23, 42, 0.2),
        0 0 0 0.5px rgba(15, 23, 42, 0.08);
    }
  }

  .ref-image-stack__track:not(.expanded) &.loading:hover .ref-image-frame__surface {
    transform: none;
    box-shadow:
      0 2px 8px rgba(15, 23, 42, 0.14),
      0 0 0 0.5px rgba(15, 23, 42, 0.06);
  }

  .compact .ref-image-stack__track:not(.expanded) &:hover .ref-image-frame__surface {
    transform: scale(1.06) translateY(-5px);
  }

  .ref-image-stack__track.expanded & {
    transform: translateX(var(--fan-x, 0)) rotate(var(--fan-rotate, 0deg));
    cursor: pointer;

    &:hover {
      z-index: 20;

      .ref-image-frame__surface {
        transform: scale(1.08) translateY(-6px);
        box-shadow:
          0 10px 24px rgba(15, 23, 42, 0.2),
          0 0 0 0.5px rgba(15, 23, 42, 0.08);
      }
    }
  }

  &.ref-image-add--fan {
    transform: translateX(var(--fan-x, 0)) rotate(var(--fan-rotate, 0deg));
    opacity: 0;
    pointer-events: none;
    transition:
      transform $ref-fan-duration $ref-ease var(--fan-delay, 0ms),
      opacity $ref-fade-duration $ref-ease calc(var(--fan-delay, 0ms) + 40ms),
      z-index 0s;

    &.is-active {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &--upload {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .compact .ref-image-stack__track.expanded &:hover .ref-image-frame__surface {
    transform: scale(1.06) translateY(-5px);
  }
}

.ref-image-upload-surface {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  border-radius: 3px;
  color: color-mix(in srgb, var(--composer-muted, $text-muted) 72%, #fff);
  background: color-mix(
    in srgb,
    var(--composer-muted, $text-muted) 22%,
    var(--composer-pill-bg, rgba(30, 32, 38, 0.88))
  );
  border: 1.5px dashed color-mix(in srgb, var(--composer-muted, $text-muted) 45%, transparent);
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;

  .compact & {
    gap: 3px;
    border-radius: 2px;
  }

  &__label {
    font-size: 9px;
    line-height: 1.2;
    white-space: nowrap;

    .compact & {
      font-size: 7px;
    }
  }

  .ref-image-frame--upload:hover & {
    color: color-mix(in srgb, var(--composer-text, $text-primary) 85%, #fff);
    background: color-mix(
      in srgb,
      var(--composer-muted, $text-muted) 26%,
      var(--composer-pill-bg, rgba(30, 32, 38, 0.88))
    );
    border-color: color-mix(in srgb, var(--composer-border-focus, $accent) 40%, transparent);
  }
}

.ref-image-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 3px;

  .compact & {
    border-radius: 2px;
  }
}

.ref-image-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(
    110deg,
    color-mix(in srgb, var(--composer-muted, $text-muted) 14%, transparent) 30%,
    color-mix(in srgb, var(--composer-muted, $text-muted) 28%, transparent) 48%,
    color-mix(in srgb, var(--composer-muted, $text-muted) 14%, transparent) 70%
  );
  background-size: 200% 100%;
  animation: ref-image-shimmer 1.3s ease-in-out infinite;
}

.ref-image-remove {
  position: absolute;
  top: -5px;
  right: -5px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.52);
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;

  .ref-image-stack.single &,
  .ref-image-frame.top:hover &,
  .ref-image-frame.top:focus-within &,
  .expanded .ref-image-frame:hover &,
  .expanded .ref-image-frame:focus-within & {
    opacity: 1;
  }

  &:hover {
    background: rgba(220, 53, 69, 0.88);
  }
}

.ref-image-more {
  position: absolute;
  left: -2px;
  bottom: -2px;
  z-index: 5;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 23, 42, 0.72);
  pointer-events: none;
  transition:
    opacity 0.44s $ref-ease,
    transform 0.44s $ref-ease;

  &--hidden {
    opacity: 0;
    transform: scale(0.9);
  }
}

.ref-image-add {
  position: absolute;
  right: -6px;
  bottom: -6px;
  left: auto;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #fff;
  background: rgba(30, 32, 38, 0.88);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22);
  transform: none;
  transform-origin: center center;
  transition:
    width 0.44s $ref-ease,
    height 0.44s $ref-ease,
    border-radius 0.36s ease,
    transform 0.44s $ref-ease,
    opacity 0.44s $ref-ease,
    background 0.2s ease,
    border-color 0.24s ease,
    color 0.24s ease,
    box-shadow 0.3s ease;

  &--dot:not(.is-active) {
    opacity: 0;
    pointer-events: none;
    transform: scale(0.92);
  }

  .compact & {
    width: 20px;
    height: 20px;
    right: -5px;
    bottom: -5px;
  }

  .ref-image-stack--multi:not(.expanded) .ref-image-add--dot.is-active:hover {
    transform: scale(1.06);
  }

  &:hover {
    background: rgba(15, 17, 22, 0.94);
  }
}

@keyframes ref-image-shimmer {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -100% 0;
  }
}

.ref-name-popper {
  @include cosmic.cosmic-glass-frost(10px);
  max-width: min(220px, calc(100vw - 24px));
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, $border-light 70%, transparent);
  background: rgba(15, 17, 22, 0.92);
  box-shadow: var(--glass-float-shadow, $shadow-md);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  animation: ref-name-popper-in 0.16s ease;
}

@keyframes ref-name-popper-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (hover: none) {
  .ref-image-remove {
    opacity: 1;
  }
}

.ref-time-popper {
  @include cosmic.cosmic-glass-frost(10px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
  pointer-events: none;
  white-space: nowrap;
  animation: ref-time-popper-in 0.16s ease;

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

@keyframes ref-time-popper-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
