<script setup lang="ts">
import {
  ChevronDown,
  ClipboardCopy,
  Info,
  Loader2,
  MoreHorizontal,
  PenSquare,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DigitalHumanMode } from '../config/digitalHumanModes'
import type { CreateHistoryItem } from '../stores/createHistory'
import { useHoverPopper } from '../composables/useHoverPopper'
import { formatGenerationTime } from '../utils/formatGenerationTime'
import { resolveCreateHistoryImageUrl } from '../utils/createHistoryMedia'
import {
  buildDigitalHumanDetailRows,
  buildDigitalHumanSpecsSummary,
  buildEditHistoryMeta,
  displayEditPrompt,
  EDIT_ACTION_LABELS,
  isRootEditVersion,
  isSystemEditPrompt,
  resolveEditAction,
  resolveEditActionLabel,
  resolveEditTagThumb,
  resolveParentVersion,
  type ImageEditAction,
} from '../utils/imageEditHistory'
import { cssAspectRatio } from '../utils/aspectRatioStyle'

const props = defineProps<{
  versions: CreateHistoryItem[]
  activeId: string | null
  isVideo?: boolean
  imageResolution?: string
  videoResolution?: string
  /** 数字人 / 对口型模式：控制是否展示「详细信息」 */
  digitalHumanMode?: boolean
  digitalHumanModeId?: DigitalHumanMode
}>()

const detailPopper = useHoverPopper({ placement: 'above', gap: 10 })

const emit = defineEmits<{
  select: [id: string]
  reEdit: [id: string]
  regenerate: [id: string]
  delete: [id: string]
  usePrompt: [prompt: string]
}>()

type OpFilter = 'all' | ImageEditAction

const opFilter = ref<OpFilter>('all')
const opMenuOpen = ref(false)
const entryRefs = ref(new Map<string, HTMLElement>())

const filteredVersions = computed(() => {
  if (opFilter.value === 'all') return props.versions
  return props.versions.filter(
    (v) => resolveEditAction(v, props.versions) === opFilter.value,
  )
})

const opFilterLabel = computed(() => {
  if (opFilter.value === 'all') return '操作类型'
  return EDIT_ACTION_LABELS[opFilter.value]
})

function bindEntry(id: string, el: unknown) {
  if (el instanceof HTMLElement) entryRefs.value.set(id, el)
  else entryRefs.value.delete(id)
}

function mediaUrl(item: CreateHistoryItem) {
  return resolveCreateHistoryImageUrl(item) || item.previewUrl || item.url || ''
}

function parentThumb(item: CreateHistoryItem) {
  const parent = resolveParentVersion(item, props.versions)
  if (!parent) return ''
  return mediaUrl(parent)
}

function tagThumb(item: CreateHistoryItem) {
  return resolveEditTagThumb(item, props.versions, mediaUrl)
}

function previewAspect(item: CreateHistoryItem) {
  return cssAspectRatio(item.aspectRatio ?? (props.isVideo ? '16:9' : '1:1'))
}

function metaLine(item: CreateHistoryItem) {
  return buildEditHistoryMeta(item, {
    isVideo: props.isVideo,
    imageResolution: props.imageResolution,
    videoResolution: props.videoResolution,
  })
}

function digitalHumanSpecsLine(_item: CreateHistoryItem) {
  return buildDigitalHumanSpecsSummary(props.digitalHumanModeId)
}

function detailRows(item: CreateHistoryItem) {
  return buildDigitalHumanDetailRows(item, {
    digitalHumanModeId: props.digitalHumanModeId,
    videoResolution: props.videoResolution,
  })
}

function onDetailEnter(item: CreateHistoryItem, e: MouseEvent) {
  detailPopper.show(item.id, e.currentTarget as HTMLElement)
}

function onDetailLeave() {
  detailPopper.hide()
}

const hoveredDetailItem = computed(() =>
  props.versions.find((v) => v.id === detailPopper.activeKey.value),
)

function pickOpFilter(value: OpFilter) {
  opFilter.value = value
  opMenuOpen.value = false
}

function onUsePrompt(item: CreateHistoryItem, e: MouseEvent) {
  e.stopPropagation()
  const prompt = displayEditPrompt(item, props.versions)
  if (!prompt || isSystemEditPrompt(prompt)) return
  emit('usePrompt', prompt)
}

watch(
  () => props.activeId,
  (id) => {
    if (!id) return
    void nextTick(() => {
      entryRefs.value.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  },
)

function onDocumentClick(e: MouseEvent) {
  if (!opMenuOpen.value) return
  const target = e.target as Node
  if (target instanceof Element && target.closest('.edit-history-filter')) return
  opMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<template>
  <div class="edit-history-feed">
    <header v-if="versions.length > 1" class="edit-history-feed__toolbar">
      <div class="edit-history-filter">
        <button
          type="button"
          class="edit-history-filter__btn"
          :class="{ open: opMenuOpen }"
          @click="opMenuOpen = !opMenuOpen"
        >
          <span>{{ opFilterLabel }}</span>
          <ChevronDown :size="12" />
        </button>
        <div v-if="opMenuOpen" class="edit-history-filter__menu">
          <button type="button" :class="{ active: opFilter === 'all' }" @click="pickOpFilter('all')">
            全部
          </button>
          <button
            type="button"
            :class="{ active: opFilter === 'generate' }"
            @click="pickOpFilter('generate')"
          >
            图片生成
          </button>
          <button
            type="button"
            :class="{ active: opFilter === 'prompt-edit' }"
            @click="pickOpFilter('prompt-edit')"
          >
            描述编辑
          </button>
          <button
            type="button"
            :class="{ active: opFilter === 'detail-repair' }"
            @click="pickOpFilter('detail-repair')"
          >
            细节修复
          </button>
        </div>
      </div>
    </header>

    <div v-if="!filteredVersions.length" class="edit-history-feed__empty">
      暂无符合条件的编辑记录
    </div>

    <article
      v-for="item in filteredVersions"
      :key="item.id"
      :ref="(el) => bindEntry(item.id, el)"
      class="edit-history-entry"
      :class="{ active: activeId === item.id, pending: item.status === 'RUNNING' }"
      @click="emit('select', item.id)"
    >
      <header class="edit-history-entry__head">
        <div v-if="parentThumb(item)" class="edit-history-entry__ref">
          <img :src="parentThumb(item)" alt="" />
          <span class="edit-history-entry__ref-quote" aria-hidden="true">“</span>
        </div>

        <div class="edit-history-entry__meta-row">
          <div
            class="edit-history-entry__content-line"
            :class="{
              'edit-history-entry__content-line--promptable':
                !!displayEditPrompt(item, versions) &&
                !isSystemEditPrompt(displayEditPrompt(item, versions)),
            }"
          >
            <span class="edit-history-entry__tag">
              <img
                v-if="tagThumb(item)"
                :src="tagThumb(item)"
                alt=""
                class="edit-history-entry__tag-thumb"
              />
              <span class="edit-history-entry__tag-label">
                {{ resolveEditActionLabel(item, versions) }}
              </span>
            </span>
            <p class="edit-history-entry__prompt">
              <span class="edit-history-entry__prompt-text">
                {{ displayEditPrompt(item, versions) || '（无提示词）' }}
              </span>
              <button
                v-if="displayEditPrompt(item, versions) && !isSystemEditPrompt(displayEditPrompt(item, versions))"
                type="button"
                class="edit-history-entry__use-prompt"
                @click="onUsePrompt(item, $event)"
              >
                <ClipboardCopy :size="12" />
                使用提示词
              </button>
            </p>
          </div>
          <div class="edit-history-entry__specs">
            <span v-if="digitalHumanMode">{{ digitalHumanSpecsLine(item) }}</span>
            <template v-else>
              <span v-if="metaLine(item)">{{ metaLine(item) }}</span>
              <span v-if="item.createdAt" class="edit-history-entry__time">
                {{ item.status === 'RUNNING' ? '生成中…' : formatGenerationTime(item.createdAt) }}
              </span>
            </template>
            <span
              v-if="digitalHumanMode"
              class="edit-history-entry__info"
              @mouseenter="onDetailEnter(item, $event)"
              @mouseleave="onDetailLeave"
              @click.stop
            >
              <Info :size="11" />
              详细信息
            </span>
          </div>
        </div>
      </header>

      <div class="edit-history-entry__preview" :style="{ aspectRatio: previewAspect(item) }">
        <div class="edit-history-entry__frame">
          <span class="edit-history-entry__ai-tag">AI 生成</span>
          <video
            v-if="isVideo && mediaUrl(item)"
            :src="mediaUrl(item)"
            class="edit-history-entry__media"
            :class="{ dimmed: item.status === 'RUNNING' }"
            muted
            playsinline
            preload="metadata"
            @click.stop
          />
          <img
            v-else-if="mediaUrl(item)"
            :src="mediaUrl(item)"
            alt=""
            class="edit-history-entry__media"
            :class="{ dimmed: item.status === 'RUNNING' }"
          />
          <div v-if="item.status === 'RUNNING'" class="edit-history-entry__loading">
            <Loader2 :size="32" class="om-loading-spinner" />
          </div>
        </div>
      </div>

      <footer class="edit-history-entry__actions" @click.stop>
        <button type="button" class="edit-history-action" @click="emit('reEdit', item.id)">
          <PenSquare :size="14" />
          重新编辑
        </button>
        <button
          type="button"
          class="edit-history-action"
          :disabled="isRootEditVersion(item, versions) || item.status === 'RUNNING'"
          @click="emit('regenerate', item.id)"
        >
          <RefreshCw :size="14" />
          再次生成
        </button>
        <button type="button" class="edit-history-action edit-history-action--icon" title="更多">
          <MoreHorizontal :size="14" />
        </button>
        <button
          v-if="!isRootEditVersion(item, versions)"
          type="button"
          class="edit-history-action edit-history-action--danger"
          @click="emit('delete', item.id)"
        >
          <Trash2 :size="14" />
          删除该批次结果
        </button>
      </footer>
    </article>

    <Teleport to="body">
      <div
        v-if="digitalHumanMode && hoveredDetailItem"
        class="edit-history-detail-popper"
        :style="detailPopper.panelStyle.value"
        @mouseenter="detailPopper.cancelHide()"
        @mouseleave="detailPopper.hide()"
      >
        <div
          v-for="row in detailRows(hoveredDetailItem)"
          :key="row.label"
          class="edit-history-detail-popper__row"
        >
          <span class="edit-history-detail-popper__label">{{ row.label }}</span>
          <span class="edit-history-detail-popper__value">{{ row.value }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.edit-history-feed {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 4px 0 24px;
}

.edit-history-feed__toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-shrink: 0;
}

.edit-history-filter {
  position: relative;
}

.edit-history-filter__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  color: $text-secondary;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
  transition: background 0.15s, color 0.15s;

  &.open,
  &:hover {
    color: $text-primary;
    background: $accent-light;
  }
}

.edit-history-filter__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 4;
  min-width: 120px;
  padding: 6px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid $border-light;
  box-shadow: $shadow-md;

  button {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    text-align: left;
    color: $text-primary;

    &:hover,
    &.active {
      background: $accent-light;
    }
  }
}

.edit-history-feed__empty {
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
}

.edit-history-entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 14px;
  transition: box-shadow 0.15s;

  &.active .edit-history-entry__frame {
    box-shadow: 0 0 0 2px color-mix(in srgb, $accent 55%, transparent);
  }
}

.edit-history-entry__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.edit-history-entry__ref {
  position: relative;
  flex-shrink: 0;
  width: 28px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transform: rotate(-6deg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.edit-history-entry__ref-quote {
  position: absolute;
  left: 2px;
  bottom: 0;
  font-size: 14px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}

.edit-history-entry__meta-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-history-entry__content-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    padding 0.15s ease;
}

.edit-history-entry:hover .edit-history-entry__content-line--promptable,
.edit-history-entry:focus-within .edit-history-entry__content-line--promptable {
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--bg-elevated) 88%, #000 12%);
  border-color: color-mix(in srgb, $border-light 80%, transparent);
}

.edit-history-entry__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 100%;
  height: 24px;
  padding: 0 8px 0 4px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: $text-primary;
  background: color-mix(in srgb, var(--bg-elevated) 88%, $text-primary 4%);
  border: 1px solid $border-light;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.edit-history-entry:hover .edit-history-entry__content-line--promptable .edit-history-entry__tag,
.edit-history-entry:focus-within .edit-history-entry__content-line--promptable .edit-history-entry__tag {
  background: color-mix(in srgb, var(--bg-card) 70%, var(--bg-elevated) 30%);
  border-color: color-mix(in srgb, $border-light 65%, transparent);
}

.edit-history-entry__tag-label {
  white-space: nowrap;
}

.edit-history-entry__tag-thumb {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.edit-history-entry__prompt {
  margin: 0;
  flex: 1;
  min-width: min(180px, 100%);
  font-size: 13px;
  line-height: 1.55;
  color: $text-secondary;
  word-break: break-word;
}

.edit-history-entry:hover .edit-history-entry__content-line--promptable .edit-history-entry__prompt,
.edit-history-entry:focus-within .edit-history-entry__content-line--promptable .edit-history-entry__prompt {
  color: $text-primary;
}

.edit-history-entry__prompt-text {
  margin-right: 8px;
}

.edit-history-entry__use-prompt {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: $text-muted;
  vertical-align: baseline;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s, color 0.15s;

  &:hover {
    color: $accent-emphasis;
  }
}

.edit-history-entry:hover .edit-history-entry__use-prompt,
.edit-history-entry:focus-within .edit-history-entry__use-prompt {
  opacity: 1;
  pointer-events: auto;
}

.edit-history-entry__specs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: $text-muted;
}

.edit-history-entry__info {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  cursor: default;
  transition: color 0.15s;

  &:hover {
    color: $text-secondary;
  }
}

.edit-history-detail-popper {
  min-width: 240px;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-elevated) 92%, #000 8%);
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
  pointer-events: auto;
  animation: edit-history-detail-popper-in 0.16s ease;

  &__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 20px;
    font-size: 12px;
    line-height: 1.6;

    & + & {
      margin-top: 6px;
    }
  }

  &__label {
    flex-shrink: 0;
    color: $text-muted;
  }

  &__value {
    text-align: right;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
  }
}

@keyframes edit-history-detail-popper-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.edit-history-entry__preview {
  width: 100%;
  max-height: min(56vh, 520px);
}

.edit-history-entry__frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--glass-radius-sm, 14px);
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
  transition: box-shadow 0.15s;
}

.edit-history-entry__ai-tag {
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

.edit-history-entry__media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;

  &.dimmed {
    opacity: 0.45;
  }
}

.edit-history-entry__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $accent;
  background: color-mix(in srgb, var(--bg-page) 35%, transparent);
}

.edit-history-entry__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.edit-history-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  color: $text-primary;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover:not(:disabled) {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 25%, $border-light);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &--icon {
    width: 34px;
    padding: 0;
    justify-content: center;
  }

  &--danger {
    margin-left: auto;
    color: $text-secondary;

    &:hover:not(:disabled) {
      color: $color-danger;
      background: $color-danger-soft;
      border-color: color-mix(in srgb, $color-danger 25%, $border-light);
    }
  }
}

html[data-theme='light'] {
  .edit-history-entry__ref {
    border-color: $border-light;
  }
}
</style>
