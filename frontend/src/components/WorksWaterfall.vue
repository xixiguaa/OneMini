<script setup lang="ts">
import { AlertCircle, Download, Image, Loader2, Pencil, Search, Trash2, Video } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useWorksGallery } from '../composables/useWorksGallery'
import { usePublicGallery } from '../composables/usePublicGallery'
import type { GalleryItem } from '../composables/useWorksGallery'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import { downloadMediaUrl } from '../utils/downloadMedia'
import ConfirmDialog from './ConfirmDialog.vue'

const props = withDefaults(
  defineProps<{
    searchQuery?: string
    mediaType?: 'image' | 'video'
    source?: 'mine' | 'public'
  }>(),
  {
    searchQuery: '',
    mediaType: 'image',
    source: 'mine',
  },
)

const agent = useAgentStore()
const settings = useSettingsStore()
const { galleryItems: mineItems } = useWorksGallery()
const { galleryItems: publicItems } = usePublicGallery()
const galleryItems = computed(() => (props.source === 'public' ? publicItems.value : mineItems.value))
const readonly = computed(() => props.source === 'public')
const deleteTarget = ref<GalleryItem | null>(null)
const deleting = ref(false)
const brokenImages = ref<Set<string>>(new Set())
const videoRatioOverrides = ref<Map<string, string>>(new Map())

const filteredItems = computed(() => {
  let items = galleryItems.value.filter((item) => item.type === props.mediaType)
  const q = props.searchQuery.trim().toLowerCase()
  if (q) items = items.filter((item) => item.prompt.toLowerCase().includes(q))
  return items
})

const hasFilteredItems = computed(() =>
  galleryItems.value.some((item) => item.type === props.mediaType),
)

/** 瀑布流列宽：短片列更宽，横屏时高度与 1:1 图片对齐 */
const IMAGE_COLUMN_WIDTH = 200
const VIDEO_COLUMN_WIDTH = 280

const columnWidth = computed(() => (props.mediaType === 'video' ? VIDEO_COLUMN_WIDTH : IMAGE_COLUMN_WIDTH))

function itemRatioId(item: GalleryItem): string {
  const override = videoRatioOverrides.value.get(item.id)
  if (override) return override
  if (item.aspectRatio && item.aspectRatio !== 'smart') return item.aspectRatio
  const prefs = settings.settings.generationPrefs
  if (item.type === 'video') return prefs.videoAspectRatio || '16:9'
  return prefs.aspectRatio || '1:1'
}

/** 按列宽 + 宽高比计算固定高度，横屏短片最小高度与列宽一致（对齐 1:1 图片） */
function itemMediaStyle(item: GalleryItem): Record<string, string> | undefined {
  if (item.type !== 'video' && item.status !== 'RUNNING') return undefined
  const ratioId = itemRatioId(item)
  const parts = ratioId.split(':').map((n) => parseInt(n, 10))
  const col = columnWidth.value
  if (parts.length !== 2 || parts.some((n) => !n)) {
    return { width: '100%', height: `${col}px` }
  }
  const [wR, hR] = parts
  let height = Math.round((col * hR) / wR)
  if (wR >= hR) height = Math.max(height, col)
  return { width: '100%', height: `${height}px` }
}

const showGallery = computed(() => filteredItems.value.length > 0)

function onImageError(id: string) {
  brokenImages.value = new Set([...brokenImages.value, id])
}

const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  loading: confirmLoading,
  confirm: showConfirm,
  onConfirm: onConfirmOk,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

function statusLabel(type: 'image' | 'video', status: string) {
  if (status === 'RUNNING') return type === 'video' ? '短片生成中…' : '图片生成中…'
  return ''
}

function openEdit(item: GalleryItem) {
  if (readonly.value) return
  if (item.status !== 'DONE' || !item.url) return
  agent.openImageEdit({
    id: item.id,
    prompt: item.prompt,
    type: item.type,
    url: item.url,
    previewUrl: item.url,
    status: 'DONE',
    createdAt: item.timestamp,
    sessionId: item.sessionId,
    parentId: item.parentId,
  })
}

async function downloadItem(item: GalleryItem) {
  if (!item.url) return
  const ext = item.type === 'video' ? 'mp4' : 'png'
  const name = `onemini-${item.id.slice(0, 8)}.${ext}`
  await downloadMediaUrl(item.url, name)
}

function sessionKey(item: GalleryItem) {
  return item.sessionId || item.id
}

function requestDelete(item: GalleryItem) {
  deleteTarget.value = item
  const msg =
    item.status === 'RUNNING'
      ? '该作品正在生成中，确定删除吗？'
      : '删除此作品及全部编辑版本？此操作会从服务端移除记录且无法恢复。'
  void showConfirm({
    title: '删除作品',
    message: msg,
    confirmLabel: '删除',
    danger: true,
  })
}

async function onDeleteConfirm() {
  const item = deleteTarget.value
  if (!item) return
  deleting.value = true
  try {
    await agent.deleteGallerySession(sessionKey(item))
    deleteTarget.value = null
    onConfirmOk()
  } catch {
    /* keep dialog open */
  } finally {
    deleting.value = false
  }
}

function onDeleteCancel() {
  if (deleting.value) return
  deleteTarget.value = null
  onConfirmCancel()
}

function onMediaClick(item: GalleryItem) {
  if (readonly.value || item.status !== 'DONE' || !item.url) return
  openEdit(item)
}

const mediaLabel = computed(() => (props.mediaType === 'video' ? '短片' : '图片'))

const emptyHint = computed(() => {
  if (readonly.value) {
    return props.mediaType === 'video' ? '暂无公共短片' : '暂无发现内容'
  }
  return `暂无${mediaLabel.value}作品`
})

const searchEmptyHint = computed(() => `没有匹配的${mediaLabel.value}`)

function onVideoMeta(item: GalleryItem, e: Event) {
  if (item.aspectRatio) return
  const video = e.target as HTMLVideoElement
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) return
  const g = (a: number, b: number): number => (b ? g(b, a % b) : a)
  const d = g(w, h)
  const ratio = `${w / d}:${h / d}`
  videoRatioOverrides.value = new Map(videoRatioOverrides.value).set(item.id, ratio)
}

function onVideoHover(e: MouseEvent, play: boolean) {
  const video = (e.currentTarget as HTMLElement).querySelector('video')
  if (!video) return
  if (play) {
    void video.play().catch(() => {})
  } else {
    video.pause()
    video.currentTime = 0
  }
}
</script>

<template>
  <section class="works-section">
    <div
      v-if="showGallery"
      class="works-grid"
      :class="{ 'works-grid--video': mediaType === 'video' }"
    >
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="work-card"
        :data-gallery-session="sessionKey(item)"
        :class="{ pending: item.status === 'RUNNING', done: item.status !== 'RUNNING' }"
      >
        <template v-if="item.status === 'RUNNING'">
          <div class="work-placeholder" :style="itemMediaStyle(item)">
            <button
              v-if="!readonly"
              type="button"
              class="card-delete-btn"
              title="删除"
              @click.stop="requestDelete(item)"
            >
              <Trash2 :size="14" />
            </button>
            <div class="placeholder-shimmer" aria-hidden="true" />
            <div class="placeholder-skeleton" aria-hidden="true">
              <span class="sk-block sk-block--lg" />
              <span class="sk-block sk-block--md" />
              <span class="sk-block sk-block--sm" />
            </div>
            <div class="placeholder-content">
              <Loader2 :size="24" class="om-loading-spinner" />
              <span>{{ statusLabel(item.type, item.status) }}</span>
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="work-media-wrap"
            :class="{
              editable: !readonly && item.status === 'DONE' && !!item.url,
              'is-video': item.type === 'video',
            }"
            :style="itemMediaStyle(item)"
            @click="onMediaClick(item)"
            @mouseenter="item.type === 'video' && onVideoHover($event, true)"
            @mouseleave="item.type === 'video' && onVideoHover($event, false)"
          >
            <img
              v-if="item.type === 'image' && item.url && !brokenImages.has(`${item.id}::${item.url}`)"
              :key="`${item.id}::${item.url}`"
              :src="item.url"
              :alt="item.prompt"
              loading="lazy"
              class="work-img"
              @error="onImageError(`${item.id}::${item.url}`)"
            />
            <div v-else-if="item.type === 'image'" class="work-img-broken">
              <AlertCircle :size="24" />
              <span>图片无法加载</span>
            </div>
            <div v-else-if="item.type === 'video' && item.url" class="video-player-wrap">
              <video
                :key="`${item.id}::${item.url}`"
                class="work-video"
                :src="item.url"
                muted
                loop
                preload="metadata"
                playsinline
                @loadedmetadata="onVideoMeta(item, $event)"
              />
            </div>
            <div v-else-if="item.type === 'video'" class="video-cover">
              <Video :size="28" />
              <span>视频</span>
            </div>

            <div v-if="!readonly" class="work-actions">
              <div class="work-actions-shade" aria-hidden="true" />
              <div class="work-actions-bar">
                <button type="button" class="action-btn" @click.stop="openEdit(item)">
                  <Pencil :size="14" />
                  编辑
                </button>
                <div class="action-btn-group">
                  <button type="button" class="action-btn icon-only" title="下载" @click.stop="downloadItem(item)">
                    <Download :size="16" />
                  </button>
                  <button type="button" class="action-btn icon-only danger" title="删除" @click.stop="requestDelete(item)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="work-actions">
              <div class="work-actions-shade" aria-hidden="true" />
              <div class="work-actions-bar work-actions-bar--public">
                <button type="button" class="action-btn icon-only" title="下载" @click.stop="downloadItem(item)">
                  <Download :size="16" />
                </button>
              </div>
            </div>
          </div>
        </template>

      </article>
    </div>

    <div v-else-if="hasFilteredItems && searchQuery.trim()" class="empty search-empty">
      <Search :size="28" />
      <p>{{ searchEmptyHint }}</p>
    </div>

    <div v-else class="empty">
      <Video v-if="mediaType === 'video'" :size="32" />
      <Image v-else :size="32" />
      <p>{{ emptyHint }}</p>
    </div>
  </section>

  <ConfirmDialog
    :open="confirmOpen"
    :title="confirmTitle"
    :message="confirmMessage"
    :confirm-label="confirmConfirmLabel"
    :cancel-label="confirmCancelLabel"
    :danger="confirmDanger"
    :loading="confirmLoading || deleting"
    @update:open="onConfirmOpenUpdate"
    @confirm="onDeleteConfirm"
    @cancel="onDeleteCancel"
  />
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.works-section {
  padding: 0;
}

.works-grid {
  columns: 200px;
  column-gap: 8px;
  width: 100%;

  &--video {
    columns: 280px;
  }
}

.work-card {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 8px;
  display: inline-block;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  vertical-align: top;
  @include cosmic.cosmic-glass-frost(var(--glass-radius-sm, 14px));
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;

  &:not(.pending):not(.failed):hover {
    transform: translateY(-2px);
    box-shadow: var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md));
  }

  &.pending {
    border-style: dashed;
    border-color: rgba($accent, 0.35);
  }

  &.failed {
    border-color: rgba($color-danger, 0.35);
  }

  &.work-card--located {
    box-shadow:
      0 0 0 2px rgba($accent, 0.5),
      var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md));
    transform: translateY(-2px);
  }
}

.work-media-wrap {
  position: relative;
  width: 100%;
  background: $bg-input;
  overflow: hidden;

  &.editable {
    cursor: pointer;
  }

  &.is-video {
    display: block;
  }

  .work-actions-shade,
  .work-actions-bar {
    opacity: 0;
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  .work-actions-bar {
    transform: translateY(6px);
    pointer-events: none;
  }

  &:hover {
    .work-actions-shade,
    .work-actions-bar {
      opacity: 1;
    }

    .work-actions-bar {
      transform: translateY(0);
      pointer-events: auto;
    }
  }
}

.work-img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.work-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: #000;
}

.video-player-wrap {
  width: 100%;
  height: 100%;
  position: absolute;
  inset: 0;
}

.work-img-broken {
  width: 100%;
  min-height: 200px;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--om-surface-2, #f3f4f6);
  color: var(--om-text-muted, #9ca3af);
  font-size: 12px;
}

.work-actions {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.work-actions-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.08) 52%, transparent 100%);
  pointer-events: none;
}

.work-actions-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;

  &--public {
    justify-content: flex-end;
  }
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background-color: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.32);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;

  svg {
    color: #fff;
    flex-shrink: 0;
  }

  &:hover {
    background-color: rgba(255, 255, 255, 0.38);
    border-color: rgba(255, 255, 255, 0.45);
  }

  &.icon-only {
    padding: 8px;
    border-radius: 50%;
  }

  &.danger:hover {
    background-color: rgba(220, 53, 69, 0.55);
    border-color: rgba(255, 255, 255, 0.45);
  }
}

.action-btn-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);

  &:hover {
    background: rgba(220, 53, 69, 0.75);
  }
}

.work-placeholder {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: $bg-input;

  &.failed-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: $color-danger;
    font-size: 12px;
    background: rgba($color-danger, 0.06);
  }
}

.placeholder-skeleton {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px;
  pointer-events: none;
}

.sk-block {
  display: block;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba($text-muted, 0.12) 0%,
    rgba($text-muted, 0.22) 50%,
    rgba($text-muted, 0.12) 100%
  );
  background-size: 200% 100%;
  animation: sk-pulse 1.4s ease-in-out infinite;

  &--lg {
    width: 72%;
  }

  &--md {
    width: 52%;
    animation-delay: 0.1s;
  }

  &--sm {
    width: 36%;
    animation-delay: 0.2s;
  }
}

@keyframes sk-pulse {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.placeholder-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba($accent, 0.06) 45%,
    rgba($accent, 0.14) 50%,
    rgba($accent, 0.06) 55%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
}

.placeholder-content {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: $accent;
  font-size: 12px;
  font-weight: 500;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.video-cover {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: $accent;
  background: linear-gradient(145deg, $accent-light, rgba(255, 255, 255, 0.6));
  font-size: 12px;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: $text-muted;
  text-align: center;
  gap: 8px;

  svg {
    color: $accent;
    opacity: 0.5;
  }

  p {
    font-size: 15px;
    font-weight: 500;
    color: $text-secondary;
  }

  span {
    font-size: 12px;
    max-width: 280px;
  }
}
</style>
