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
import { resolveCreateHistoryImageUrl, resolveReferenceUrls } from '../utils/createHistoryMedia'
import {
  buildDigitalHumanDetailRows,
  buildEditHistoryMeta,
  displayEditPrompt,
  EDIT_ACTION_LABELS,
  isRootEditVersion,
  resolveEditAction,
  resolveEditActionLabel,
  resolveEditTagThumb,
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
const refPreviewPopper = useHoverPopper({
  placement: 'below',
  gap: 10,
  horizontalAlign: 'start',
  estimatedWidth: 240,
})

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
const entryActionMenuOpenId = ref<string | null>(null)
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

function generationRefs(item: CreateHistoryItem) {
  return resolveReferenceUrls(item)
}

function hasGenerationRefs(item: CreateHistoryItem) {
  return generationRefs(item).length > 0
}

function primaryGenerationRef(item: CreateHistoryItem) {
  return generationRefs(item)[0] ?? ''
}

function extraGenerationRefCount(item: CreateHistoryItem) {
  return Math.max(0, generationRefs(item).length - 1)
}

function onGenRefEnter(item: CreateHistoryItem, e: MouseEvent) {
  if (!hasGenerationRefs(item)) return
  refPreviewPopper.show(item.id, e.currentTarget as HTMLElement)
}

function onGenRefLeave() {
  refPreviewPopper.hide()
}

const hoveredGenRefItem = computed(() =>
  props.versions.find((v) => v.id === refPreviewPopper.activeKey.value),
)

const hoveredGenRefUrls = computed(() =>
  hoveredGenRefItem.value ? generationRefs(hoveredGenRefItem.value) : [],
)

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

function isDigitalHumanEntry(item: CreateHistoryItem) {
  return props.digitalHumanMode || resolveEditAction(item, props.versions) === 'lipsync'
}

function detailRows(item: CreateHistoryItem) {
  return buildDigitalHumanDetailRows(item, {
    digitalHumanModeId: props.digitalHumanModeId,
    videoResolution: props.videoResolution,
    prompt: displayEditPrompt(item, props.versions),
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
  if (!prompt) return
  emit('usePrompt', prompt)
}

/** 顶部可 hover 展开的条目（含细节修复等系统提示词） */
function hasHoverPromptHeader(item: CreateHistoryItem) {
  return !!displayEditPrompt(item, props.versions)
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

function toggleEntryActionMenu(itemId: string, e: MouseEvent) {
  e.stopPropagation()
  entryActionMenuOpenId.value = entryActionMenuOpenId.value === itemId ? null : itemId
}

function onEntryDelete(itemId: string, e: MouseEvent) {
  e.stopPropagation()
  entryActionMenuOpenId.value = null
  emit('delete', itemId)
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as Node
  if (!(target instanceof Element)) return

  if (opMenuOpen.value && !target.closest('.edit-history-filter')) {
    opMenuOpen.value = false
  }
  if (entryActionMenuOpenId.value && !target.closest('.edit-history-entry__more')) {
    entryActionMenuOpenId.value = null
  }
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
        <div
          v-if="hasGenerationRefs(item)"
          class="edit-history-entry__gen-ref"
          @mouseenter="onGenRefEnter(item, $event)"
          @mouseleave="onGenRefLeave"
        >
          <span class="edit-history-entry__gen-ref-label">智能参考</span>
          <img :src="primaryGenerationRef(item)" alt="" />
          <span v-if="extraGenerationRefCount(item) > 0" class="edit-history-entry__gen-ref-more">
            +{{ extraGenerationRefCount(item) }}
          </span>
        </div>

        <div class="edit-history-entry__meta-row">
          <div
            class="edit-history-entry__prompt-anchor"
            :class="{ 'edit-history-entry__prompt-anchor--promptable': hasHoverPromptHeader(item) }"
          >
            <div
              class="edit-history-entry__content-line"
              :class="{ 'edit-history-entry__content-line--promptable': hasHoverPromptHeader(item) }"
            >
              <span class="edit-history-entry__tag">
                <img
                  v-if="tagThumb(item) && !hasGenerationRefs(item)"
                  :src="tagThumb(item)"
                  alt=""
                  class="edit-history-entry__tag-thumb"
                />
                <span class="edit-history-entry__tag-label">
                  {{ resolveEditActionLabel(item, versions) }}
                </span>
              </span>
              <p class="edit-history-entry__prompt">
                <span class="edit-history-entry__prompt-text">{{ displayEditPrompt(item, versions) || '（无提示词）' }}</span><span
                  v-if="hasHoverPromptHeader(item)"
                  class="edit-history-entry__prompt-specs"
                ><span v-if="metaLine(item)">{{ metaLine(item) }}</span><span v-if="item.createdAt" class="edit-history-entry__time">{{ item.status === 'RUNNING' ? '生成中…' : formatGenerationTime(item.createdAt) }}</span><span
                  v-if="isDigitalHumanEntry(item)"
                  class="edit-history-entry__info"
                  @mouseenter="onDetailEnter(item, $event)"
                  @mouseleave="onDetailLeave"
                  @click.stop
                >
                  <Info :size="11" />
                  详细信息
                </span></span><button
                  v-if="hasHoverPromptHeader(item)"
                  type="button"
                  class="edit-history-entry__use-prompt"
                  @click="onUsePrompt(item, $event)"
                >
                  <ClipboardCopy :size="12" />
                  使用提示词
                </button><span
                  v-if="hasHoverPromptHeader(item) && isDigitalHumanEntry(item)"
                  class="edit-history-entry__info edit-history-entry__info--hover"
                  @mouseenter="onDetailEnter(item, $event)"
                  @mouseleave="onDetailLeave"
                  @click.stop
                >
                  <Info :size="11" />
                  详细信息
                </span>
              </p>
            </div>
          </div>
          <div v-if="!hasHoverPromptHeader(item)" class="edit-history-entry__specs">
            <span v-if="metaLine(item)">{{ metaLine(item) }}</span>
            <span v-if="item.createdAt" class="edit-history-entry__time">
              {{ item.status === 'RUNNING' ? '生成中…' : formatGenerationTime(item.createdAt) }}
            </span>
            <span
              v-if="isDigitalHumanEntry(item)"
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
        <div
          v-if="!isRootEditVersion(item, versions)"
          class="edit-history-entry__more"
        >
          <button
            type="button"
            class="edit-history-action edit-history-action--icon"
            :class="{ open: entryActionMenuOpenId === item.id }"
            title="更多"
            @click="toggleEntryActionMenu(item.id, $event)"
          >
            <MoreHorizontal :size="14" />
          </button>
          <div v-if="entryActionMenuOpenId === item.id" class="edit-history-entry__more-menu">
            <button
              type="button"
              class="edit-history-entry__more-menu-item edit-history-entry__more-menu-item--danger"
              @click="onEntryDelete(item.id, $event)"
            >
              <Trash2 :size="14" />
              删除该批次结果
            </button>
          </div>
        </div>
      </footer>
    </article>

    <Teleport to="body">
      <div
        v-if="hoveredGenRefItem && hoveredGenRefUrls.length"
        class="edit-history-ref-preview"
        :style="refPreviewPopper.panelStyle.value"
        @mouseenter="refPreviewPopper.cancelHide()"
        @mouseleave="refPreviewPopper.hide()"
      >
        <p class="edit-history-ref-preview__title">智能参考</p>
        <div
          class="edit-history-ref-preview__grid"
          :class="{ 'edit-history-ref-preview__grid--multi': hoveredGenRefUrls.length > 1 }"
        >
          <img
            v-for="(url, idx) in hoveredGenRefUrls"
            :key="`${hoveredGenRefItem!.id}-ref-${idx}`"
            :src="url"
            alt=""
          />
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="hoveredDetailItem && isDigitalHumanEntry(hoveredDetailItem)"
        class="edit-history-detail-popper"
        :style="detailPopper.panelStyle.value"
        @mouseenter="detailPopper.cancelHide()"
        @mouseleave="detailPopper.hide()"
      >
        <p class="edit-history-detail-popper__title">详细信息</p>
        <div class="edit-history-detail-popper__rows">
          <div
            v-for="row in detailRows(hoveredDetailItem)"
            :key="row.label"
            class="edit-history-detail-popper__row"
            :class="{ 'edit-history-detail-popper__row--multiline': row.multiline }"
          >
            <span class="edit-history-detail-popper__label">{{ row.label }}</span>
            <span class="edit-history-detail-popper__value">{{ row.value }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.edit-history-feed {
  width: 100%;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 4px 0 24px;
  box-sizing: border-box;
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
  border-radius: 14px;
  overflow: visible;
  transition: box-shadow 0.15s;

  &:has(.edit-history-entry__content-line--promptable) .edit-history-entry__preview {
    margin-top: -6px;
  }

  &.active .edit-history-entry__frame {
    box-shadow: 0 0 0 2px color-mix(in srgb, $accent 55%, transparent);
  }
}

.edit-history-entry__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  overflow: visible;
  position: relative;
  z-index: 2;

  &:has(.edit-history-entry__content-line--promptable) {
    align-items: center;
  }

  &:has(.edit-history-entry__gen-ref) {
    align-items: flex-end;
    padding-top: 4px;
  }
}

.edit-history-entry__ref {
  position: relative;
  z-index: 12;
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

.edit-history-entry__gen-ref {
  position: relative;
  z-index: 12;
  flex-shrink: 0;
  width: 34px;
  height: 44px;
  border-radius: 6px;
  overflow: visible;
  transform: rotate(-7deg);
  cursor: pointer;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 6px;
    border: 2px solid #fff;
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.18),
      0 0 0 0.5px rgba(15, 23, 42, 0.08);
  }

  &:hover {
    transform: rotate(-4deg) scale(1.06);
    z-index: 14;
  }
}

.edit-history-entry__gen-ref-label {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  color: #fff;
  white-space: nowrap;
  background: rgba(28, 30, 36, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.edit-history-entry__gen-ref-more {
  position: absolute;
  right: -4px;
  bottom: -4px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: rgba(15, 23, 42, 0.78);
  pointer-events: none;
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
  overflow: visible;
  position: relative;
}

$prompt-slot-height: calc(24px + max(28px, 2 * 13px * 1.55));
$prompt-hover-bleed: 6px;
$prompt-ref-width: 28px;
$prompt-gen-ref-width: 34px;
$prompt-ref-gap: 10px;

.edit-history-entry__prompt-anchor {
  min-width: 0;

  &--promptable {
    position: relative;
    flex-shrink: 0;

    &::after {
      content: '';
      display: block;
      height: $prompt-slot-height;
    }

    .edit-history-entry__content-line--promptable {
      position: absolute;
      top: 0;
      z-index: 1;
    }
  }
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
}

.edit-history-entry__content-line--promptable {
  align-items: center;
  gap: 10px;
  padding: 12px $prompt-hover-bleed 25px $prompt-hover-bleed;
  box-sizing: border-box;
  max-height: $prompt-slot-height;
  overflow: hidden;
  left: -$prompt-hover-bleed;
  right: -$prompt-hover-bleed;
  width: auto;
}

.edit-history-entry__head:has(.edit-history-entry__ref) .edit-history-entry__content-line--promptable {
  left: calc(-1 * (#{$prompt-ref-width} + #{$prompt-ref-gap} + #{$prompt-hover-bleed}));
  right: -$prompt-hover-bleed;
  padding-left: calc(#{$prompt-ref-width} + #{$prompt-ref-gap} + #{$prompt-hover-bleed});
}

.edit-history-entry__head:has(.edit-history-entry__gen-ref) .edit-history-entry__content-line--promptable {
  left: calc(-1 * (#{$prompt-gen-ref-width} + #{$prompt-ref-gap} + #{$prompt-hover-bleed}));
  right: -$prompt-hover-bleed;
  padding-left: calc(#{$prompt-gen-ref-width} + #{$prompt-ref-gap} + #{$prompt-hover-bleed});
}

.edit-history-entry__content-line--promptable:hover,
.edit-history-entry__content-line--promptable:focus-within {
  z-index: 10;
  align-items: flex-start;
  max-height: 248px;
  overflow-y: auto;
  overflow-x: hidden;
  background: color-mix(in srgb, var(--bg-page) 92%, $accent-light);
  backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  border-color: color-mix(in srgb, $accent 22%, transparent);
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
  min-width: 0;
  font-size: 13px;
  line-height: 1.55;
  color: $text-secondary;
  word-break: break-word;
}

.edit-history-entry__content-line--promptable:not(:hover):not(:focus-within) .edit-history-entry__prompt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.edit-history-entry__content-line--promptable:hover .edit-history-entry__prompt,
.edit-history-entry__content-line--promptable:focus-within .edit-history-entry__prompt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  color: $text-primary;
  overflow: visible;
}

.edit-history-entry__prompt-text {
  display: inline;
}

.edit-history-entry__prompt-specs {
  display: inline;
  margin-left: 10px;
  font-size: 11px;
  line-height: inherit;
  color: $text-muted;
  white-space: nowrap;

  .edit-history-entry__time {
    margin-left: 8px;
  }

  .edit-history-entry__info {
    margin-left: 8px;
  }
}

.edit-history-entry__content-line--promptable:hover .edit-history-entry__prompt-specs,
.edit-history-entry__content-line--promptable:focus-within .edit-history-entry__prompt-specs {
  display: none;
}

.edit-history-entry__use-prompt {
  display: none;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  line-height: 1;
  color: $text-muted;

  &:hover {
    color: $accent-emphasis;
  }
}

.edit-history-entry__content-line--promptable:hover .edit-history-entry__use-prompt,
.edit-history-entry__content-line--promptable:focus-within .edit-history-entry__use-prompt {
  display: inline-flex;
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

  &--hover {
    display: none;
  }
}

.edit-history-entry__content-line--promptable:hover .edit-history-entry__info--hover,
.edit-history-entry__content-line--promptable:focus-within .edit-history-entry__info--hover {
  display: inline-flex;
}

.edit-history-detail-popper {
  @include cosmic.cosmic-glass-frost(14px);
  min-width: 280px;
  max-width: min(340px, calc(100vw - 32px));
  padding: 0;
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  border: 1px solid $border-light;
  box-shadow: var(--glass-float-shadow, $shadow-md);
  pointer-events: auto;
  animation: edit-history-detail-popper-in 0.16s ease;
  overflow: hidden;

  &__title {
    margin: 0;
    padding: 12px 16px 10px;
    font-size: 12px;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0.02em;
    border-bottom: 1px solid color-mix(in srgb, $border-light 75%, transparent);
  }

  &__rows {
    display: flex;
    flex-direction: column;
    padding: 6px 0 10px;
  }

  &__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 20px;
    padding: 7px 16px;
    font-size: 12px;
    line-height: 1.5;

    &--multiline {
      flex-direction: column;
      align-items: stretch;
      gap: 5px;
      padding-top: 8px;
      padding-bottom: 8px;

      .edit-history-detail-popper__value {
        text-align: left;
        font-weight: 400;
        line-height: 1.6;
        word-break: break-word;
        white-space: pre-wrap;
      }
    }
  }

  &__label {
    flex-shrink: 0;
    color: $text-muted;
    font-weight: 500;
  }

  &__value {
    min-width: 0;
    text-align: right;
    color: $text-primary;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

@keyframes edit-history-detail-popper-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.edit-history-entry__preview {
  position: relative;
  z-index: 1;
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
  margin-top: 12px;
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

    &.open,
    &:hover:not(:disabled) {
      background: $accent-light;
      border-color: color-mix(in srgb, $accent 25%, $border-light);
    }
  }
}

.edit-history-entry__more {
  position: relative;
}

.edit-history-entry__more-menu {
  position: absolute;
  top: 50%;
  left: calc(100% + 6px);
  transform: translateY(-50%);
  z-index: 4;
  min-width: 168px;
  padding: 6px;
  border-radius: 10px;
  background: var(--bg-card);
  border: 1px solid $border-light;
  box-shadow: $shadow-md;
}

.edit-history-entry__more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  text-align: left;
  color: $text-secondary;
  white-space: nowrap;

  &:hover {
    color: $text-primary;
    background: $accent-light;
  }

  &--danger:hover {
    color: $color-danger;
    background: $color-danger-soft;
  }
}

html[data-theme='light'] {
  .edit-history-entry__ref {
    border-color: $border-light;
  }

  .edit-history-entry__gen-ref-label {
    background: rgba(28, 30, 36, 0.88);
  }
}

.edit-history-ref-preview {
  @include cosmic.cosmic-glass-frost(12px);
  padding: 10px 12px;
  border: 1px solid $border-light;
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
  pointer-events: auto;
  animation: edit-history-ref-preview-in 0.16s ease;

  &__title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    color: $text-muted;
    letter-spacing: 0.04em;
  }

  &__grid {
    display: flex;
    gap: 8px;

    img {
      display: block;
      width: 168px;
      max-height: 220px;
      object-fit: contain;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.04);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
    }

    &--multi img {
      width: 120px;
      max-height: 160px;
    }
  }
}

@keyframes edit-history-ref-preview-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
