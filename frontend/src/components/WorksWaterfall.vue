<script setup lang="ts">
import { AlertCircle, Download, Image, Loader2, Pencil, Search, Trash2, Video } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useGalleryLikes } from '../composables/useGalleryLikes'
import { useWorksGallery } from '../composables/useWorksGallery'
import { usePublicGallery } from '../composables/usePublicGallery'
import type { GalleryItem } from '../composables/useWorksGallery'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import { downloadMediaUrl } from '../utils/downloadMedia'
import ConfirmDialog from './ConfirmDialog.vue'
import PublicGalleryDetail from './PublicGalleryDetail.vue'
import WorkCardDiscoverHover from './WorkCardDiscoverHover.vue'

const props = withDefaults(
  defineProps<{
    searchQuery?: string
    mediaType?: 'image' | 'video' | 'all'
    source?: 'mine' | 'public'
    /** 仅展示该用户发布的公共作品 */
    ownerId?: string
    /** 仅展示已点赞的公共作品 */
    likedOnly?: boolean
    emptyHint?: string
    /** 有内容时在列表底部显示的提示 */
    endHint?: string
    /** 个人主页等场景：更窄列宽、更密间距 */
    compact?: boolean
    /** 首次加载骨架屏 */
    loading?: boolean
  }>(),
  {
    searchQuery: '',
    mediaType: 'image',
    source: 'mine',
    ownerId: undefined,
    likedOnly: false,
    emptyHint: undefined,
    endHint: undefined,
    compact: false,
    loading: false,
  },
)

const agent = useAgentStore()
const settings = useSettingsStore()
const { galleryItems: mineItems } = useWorksGallery()
const { galleryItems: publicItems, hydrate: hydratePublicGallery } = usePublicGallery()
const { likedItemIds } = useGalleryLikes()
const galleryItems = computed(() => (props.source === 'public' ? publicItems.value : mineItems.value))
const readonly = computed(() => props.source === 'public')
const deleteTarget = ref<GalleryItem | null>(null)
const deleting = ref(false)
const brokenImages = ref<Set<string>>(new Set())
const loadedMedia = ref<Set<string>>(new Set())
const videoRatioOverrides = ref<Map<string, string>>(new Map())
const publicDetailOpen = ref(false)
const publicDetailIndex = ref(0)

const publicDetailItems = computed(() =>
  filteredItems.value.filter((item) => item.status === 'DONE' && item.url),
)

const poolItems = computed(() => {
  let items = galleryItems.value
  if (props.mediaType !== 'all') {
    items = items.filter((item) => item.type === props.mediaType)
  }
  if (props.source === 'public' && props.ownerId) {
    items = items.filter((item) => item.publishedBy === props.ownerId)
  }
  if (props.likedOnly) {
    const liked = new Set(likedItemIds())
    items = items.filter((item) => liked.has(item.id))
  }
  return items
})

const filteredItems = computed(() => {
  let items = poolItems.value
  const q = props.searchQuery.trim().toLowerCase()
  if (q) items = items.filter((item) => item.prompt.toLowerCase().includes(q))
  return items
})

const hasPoolItems = computed(() => poolItems.value.length > 0)

const endHintMain = computed(() => props.endHint?.trim().replace(/～+$/u, '') ?? '')
const endHintHasWave = computed(() => /～+$/u.test(props.endHint?.trim() ?? ''))

const SKELETON_IMAGE_RATIOS = ['1:1', '3:4', '1:1', '4:5', '1:1', '16:9', '1:1', '3:4', '1:1', '4:3']
const SKELETON_VIDEO_RATIOS = ['16:9', '16:9', '9:16', '16:9', '16:9', '16:9', '16:9', '16:9']

const skeletonItems = computed(() => {
  const ratios =
    props.mediaType === 'video' ? SKELETON_VIDEO_RATIOS : SKELETON_IMAGE_RATIOS
  return ratios.map((ratio, index) => ({ id: `sk-${index}`, ratio, index }))
})

function mediaStyleForRatio(ratio: string): Record<string, string> {
  const parts = ratio.split(':').map((n) => parseInt(n, 10))
  const col = columnWidth.value
  if (parts.length !== 2 || parts.some((n) => !n)) {
    return { width: '100%', height: `${col}px` }
  }
  const [wR, hR] = parts
  let height = Math.round((col * hR) / wR)
  if (wR >= hR) height = Math.max(height, col)
  return { width: '100%', height: `${height}px` }
}

watch(
  () => [props.source, props.ownerId, props.likedOnly] as const,
  () => {
    if (props.source === 'public') void hydratePublicGallery()
  },
  { immediate: true },
)

/** 瀑布流列宽：短片列更宽，横屏时高度与 1:1 图片对齐 */
const IMAGE_COLUMN_WIDTH = 200
const VIDEO_COLUMN_WIDTH = 280

const columnWidth = computed(() => {
  if (props.compact) return 160
  return props.mediaType === 'video' ? VIDEO_COLUMN_WIDTH : IMAGE_COLUMN_WIDTH
})

const columnGap = computed(() => (props.compact ? 6 : 8))

function itemRatioId(item: GalleryItem): string {
  const override = videoRatioOverrides.value.get(item.id)
  if (override) return override
  if (item.aspectRatio && item.aspectRatio !== 'smart') return item.aspectRatio
  const prefs = settings.settings.generationPrefs
  if (item.type === 'video') return prefs.videoAspectRatio || '16:9'
  return prefs.aspectRatio || '1:1'
}

function mediaLoadKey(item: GalleryItem): string {
  return `${item.id}::${item.url ?? ''}`
}

function imageBrokenKey(item: GalleryItem): string {
  return `${item.id}::${item.url ?? ''}`
}

function isMediaLoaded(item: GalleryItem): boolean {
  if (!item.url || item.status !== 'DONE') return true
  if (item.type === 'image' && brokenImages.value.has(imageBrokenKey(item))) return true
  return loadedMedia.value.has(mediaLoadKey(item))
}

function markMediaLoaded(item: GalleryItem) {
  if (!item.url) return
  const key = mediaLoadKey(item)
  if (loadedMedia.value.has(key)) return
  loadedMedia.value = new Set([...loadedMedia.value, key])
}

watch(
  () => filteredItems.value.map((i) => mediaLoadKey(i)).join('\n'),
  () => {
    const valid = new Set(filteredItems.value.map(mediaLoadKey))
    loadedMedia.value = new Set([...loadedMedia.value].filter((k) => valid.has(k)))
  },
)

/** 按列宽 + 宽高比预留高度，避免媒体加载前后布局跳动 */
function itemMediaStyle(item: GalleryItem): Record<string, string> | undefined {
  const reserve =
    item.status === 'RUNNING' || item.type === 'video' || (item.type === 'image' && item.status === 'DONE')
  if (!reserve) return undefined
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

function onImageLoad(item: GalleryItem, e: Event) {
  markMediaLoaded(item)
  const img = e.target as HTMLImageElement
  if (!item.aspectRatio && img.naturalWidth && img.naturalHeight) {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a)
    const d = g(img.naturalWidth, img.naturalHeight)
    const ratio = `${img.naturalWidth / d}:${img.naturalHeight / d}`
    if (ratio !== itemRatioId(item)) {
      videoRatioOverrides.value = new Map(videoRatioOverrides.value).set(item.id, ratio)
    }
  }
}

function onVideoLoaded(item: GalleryItem, e: Event) {
  markMediaLoaded(item)
  onVideoMeta(item, e)
}

function setImageRef(item: GalleryItem, el: HTMLImageElement | null) {
  if (!el?.complete || !el.naturalWidth) return
  markMediaLoaded(item)
}

function setVideoRef(item: GalleryItem, el: HTMLVideoElement | null) {
  if (!el || el.readyState < 2) return
  markMediaLoaded(item)
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

function openPublicDetail(item: GalleryItem) {
  const idx = publicDetailItems.value.findIndex((i) => i.id === item.id)
  if (idx < 0) return
  publicDetailIndex.value = idx
  publicDetailOpen.value = true
}

function onMediaClick(item: GalleryItem) {
  if (item.status !== 'DONE' || !item.url) return
  if (readonly.value) {
    openPublicDetail(item)
    return
  }
  openEdit(item)
}

const mediaLabel = computed(() => (props.mediaType === 'video' ? '短片' : '图片'))

const emptyHint = computed(() => {
  if (props.emptyHint) return props.emptyHint
  if (props.likedOnly) return '还没有赞过的作品'
  if (props.ownerId) {
    return props.mediaType === 'video' ? '还没有发布短片' : '还没有发布作品'
  }
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
    <Transition name="works-content-fade" mode="out-in">
      <div
        v-if="loading"
        key="works-skeleton"
        class="works-skeleton-grid"
        :class="{ 'works-skeleton-grid--video': mediaType === 'video' && !compact }"
        :style="{ columns: `${columnWidth}px`, columnGap: `${columnGap}px` }"
        aria-busy="true"
        aria-label="作品加载中"
      >
        <article
          v-for="item in skeletonItems"
          :key="item.id"
          class="work-card work-card--skeleton"
          :style="{ animationDelay: `${item.index * 55}ms` }"
        >
          <div class="work-skeleton-media" :style="mediaStyleForRatio(item.ratio)">
            <div class="work-skeleton-shimmer" aria-hidden="true" />
            <div class="work-skeleton-lines" aria-hidden="true">
              <span class="sk-block sk-block--lg" />
              <span class="sk-block sk-block--md" />
            </div>
          </div>
        </article>
      </div>

      <div v-else key="works-content" class="works-content">
    <div
      v-if="showGallery"
      class="works-grid works-grid--revealed"
      :class="{ 'works-grid--video': mediaType === 'video' && !compact, 'works-grid--compact': compact }"
      :style="{ columns: `${columnWidth}px`, columnGap: `${columnGap}px` }"
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
              editable: item.status === 'DONE' && !!item.url,
              'work-media-wrap--discover': readonly,
              'is-video': item.type === 'video',
              'is-media-loading': item.url && !isMediaLoaded(item),
            }"
            :style="itemMediaStyle(item)"
            @click="onMediaClick(item)"
            @mouseenter="item.type === 'video' && onVideoHover($event, true)"
            @mouseleave="item.type === 'video' && onVideoHover($event, false)"
          >
            <div v-if="item.url" class="work-media-skeleton" aria-hidden="true">
              <div class="work-media-shimmer" />
              <div class="work-media-sk-lines">
                <span class="sk-block sk-block--lg" />
                <span class="sk-block sk-block--md" />
              </div>
            </div>

            <img
              v-if="item.type === 'image' && item.url && !brokenImages.has(imageBrokenKey(item))"
              :key="`${item.id}::${item.url}`"
              :ref="(el) => setImageRef(item, el as HTMLImageElement | null)"
              :src="item.url"
              :alt="item.prompt"
              loading="lazy"
              decoding="async"
              class="work-img work-media-asset"
              :class="{ 'work-media-asset--visible': isMediaLoaded(item) }"
              @load="onImageLoad(item, $event)"
              @error="onImageError(imageBrokenKey(item))"
            />
            <div v-else-if="item.type === 'image'" class="work-img-broken">
              <AlertCircle :size="24" />
              <span>图片无法加载</span>
            </div>
            <div v-else-if="item.type === 'video' && item.url" class="video-player-wrap">
              <video
                :key="`${item.id}::${item.url}`"
                :ref="(el) => setVideoRef(item, el as HTMLVideoElement | null)"
                class="work-video work-media-asset"
                :class="{ 'work-media-asset--visible': isMediaLoaded(item) }"
                :src="item.url"
                muted
                loop
                preload="metadata"
                playsinline
                @loadeddata="onVideoLoaded(item, $event)"
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
            <WorkCardDiscoverHover v-else-if="item.status === 'DONE'" :item="item" />
          </div>
        </template>

      </article>
    </div>

    <div v-if="showGallery && endHint" class="works-end-hint" role="status">
      <span class="works-end-hint-line" aria-hidden="true" />
      <span class="works-end-hint-text">
        <span class="works-end-hint-copy">{{ endHintMain }}</span>
        <span v-if="endHintHasWave" class="works-end-hint-wave" aria-hidden="true">～</span>
      </span>
      <span class="works-end-hint-line" aria-hidden="true" />
    </div>

    <div v-if="!showGallery && hasPoolItems && searchQuery.trim()" class="empty search-empty">
      <Search :size="28" />
      <p>{{ searchEmptyHint }}</p>
    </div>

    <div v-else-if="!showGallery" class="empty">
      <Video v-if="mediaType === 'video'" :size="32" />
      <Image v-else :size="32" />
      <p>{{ emptyHint }}</p>
    </div>
      </div>
    </Transition>
  </section>

  <PublicGalleryDetail
    v-if="readonly && publicDetailOpen"
    :items="publicDetailItems"
    :index="publicDetailIndex"
    @update:index="publicDetailIndex = $event"
    @close="publicDetailOpen = false"
  />

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

.works-content-fade-enter-active,
.works-content-fade-leave-active {
  transition:
    opacity 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.works-content-fade-enter-from,
.works-content-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.works-skeleton-grid {
  width: 100%;
}

.work-card--skeleton {
  pointer-events: none;
  animation: works-skeleton-card-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;

  &:hover {
    transform: none;
    box-shadow: none;
  }
}

.work-skeleton-media {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-input, $bg-input) 88%, transparent);
}

.work-skeleton-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba($accent, 0.04) 42%,
    rgba($accent, 0.12) 50%,
    rgba($accent, 0.04) 58%,
    transparent 100%
  );
  background-size: 220% 100%;
  animation: shimmer 1.7s ease-in-out infinite;
}

.work-skeleton-lines {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 12px;
  pointer-events: none;
}

.works-grid--revealed {
  animation: works-grid-reveal 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes works-skeleton-card-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes works-grid-reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .works-content-fade-enter-active,
  .works-content-fade-leave-active,
  .work-card--skeleton,
  .works-grid--revealed,
  .work-skeleton-shimmer {
    animation: none;
    transition: none;
  }
}

.works-grid {
  width: 100%;

  &--video {
    /* column width via inline style */
  }

  &--compact {
    /* column width via inline style */
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
  background: color-mix(in srgb, $bg-input 88%, transparent);
  overflow: hidden;

  &.editable {
    cursor: pointer;
  }

  &.is-video {
    display: block;
  }

  &.is-media-loading {
    .work-actions-shade,
    .work-actions-bar,
    :deep(.discover-hover-bar) {
      opacity: 0;
      pointer-events: none;
    }
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

  &:hover:not(.is-media-loading) {
    .work-actions-shade,
    .work-actions-bar {
      opacity: 1;
    }

    .work-actions-bar {
      transform: translateY(0);
      pointer-events: auto;
    }
  }

  &--discover:hover:not(.is-media-loading) {
    :deep(.discover-hover-bar) {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

.work-media-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
  transition: opacity 0.42s ease;
}

.work-media-wrap:not(.is-media-loading) .work-media-skeleton {
  opacity: 0;
}

.work-media-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba($accent, 0.05) 42%,
    rgba($accent, 0.12) 50%,
    rgba($accent, 0.05) 58%,
    transparent 100%
  );
  background-size: 220% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
}

.work-media-sk-lines {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
}

.work-media-asset {
  position: relative;
  z-index: 0;
  opacity: 0;
  transition: opacity 0.52s ease;

  &--visible {
    opacity: 1;
  }
}

.work-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.work-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: transparent;
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

.works-end-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin: 28px 0 12px;
  padding: 0 12px;
  animation: works-end-hint-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.works-end-hint-line {
  flex: 1;
  max-width: 72px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, $accent 28%, $border-light),
    transparent
  );
  transform-origin: center;
  animation: works-end-hint-line 0.7s ease-out 0.12s both;

  &:first-child {
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, $accent 28%, $border-light)
    );
  }

  &:last-child {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, $accent 28%, $border-light),
      transparent
    );
  }
}

.works-end-hint-text {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.works-end-hint-copy {
  background: linear-gradient(
    120deg,
    $text-muted 0%,
    color-mix(in srgb, $accent 72%, $text-secondary) 45%,
    $text-muted 90%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: works-end-hint-shimmer 2.8s ease-in-out infinite;
}

.works-end-hint-wave {
  display: inline-block;
  color: color-mix(in srgb, $accent 78%, $text-muted);
  transform-origin: 70% 100%;
  animation: works-end-hint-wave 1.6s ease-in-out infinite;
}

@keyframes works-end-hint-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes works-end-hint-line {
  from {
    opacity: 0;
    transform: scaleX(0.35);
  }

  to {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes works-end-hint-shimmer {
  0%,
  100% {
    background-position: 0% center;
  }

  50% {
    background-position: 100% center;
  }
}

@keyframes works-end-hint-wave {
  0%,
  100% {
    transform: rotate(0deg) translateY(0);
  }

  25% {
    transform: rotate(8deg) translateY(-1px);
  }

  75% {
    transform: rotate(-4deg) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .works-end-hint,
  .works-end-hint-line,
  .works-end-hint-copy,
  .works-end-hint-wave {
    animation: none;
  }
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
