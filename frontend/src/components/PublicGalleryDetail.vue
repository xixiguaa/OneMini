<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  Download,
  Heart,
  ImageIcon,
  MoreHorizontal,
  Repeat2,
  Share2,
  Shield,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ASPECT_RATIOS, VIDEO_ASPECT_RATIOS } from '../config/constants'
import { useDiscoverGalleryActions } from '../composables/useDiscoverGalleryActions'
import type { GalleryItem } from '../composables/useWorksGallery'
import { useToastStore } from '../stores/toast'
import { downloadMediaUrl } from '../utils/downloadMedia'
import { formatGalleryDate } from '../utils/formatGalleryDate'

const props = defineProps<{
  items: GalleryItem[]
  index: number
}>()

const emit = defineEmits<{
  'update:index': [value: number]
  close: []
}>()

const toast = useToastStore()
const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

const currentItem = computed(() => props.items[props.index] ?? null)

const {
  authorName,
  authorAvatar,
  liked,
  likes,
  canUseReference,
  refLoading,
  onMakeSameStyle,
  onUseReference,
  onToggleLike,
  openAuthorProfile,
} = useDiscoverGalleryActions(currentItem)

const aspectLabel = computed(() => {
  const it = currentItem.value
  if (!it?.aspectRatio) return '智能'
  const list = it.type === 'video' ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS
  return list.find((r) => r.id === it.aspectRatio)?.label ?? it.aspectRatio
})

const mediaTypeLabel = computed(() =>
  currentItem.value?.type === 'video' ? '视频' : '图片',
)

const promptTitle = computed(() =>
  currentItem.value?.type === 'video' ? '视频提示词' : '图片提示词',
)

const dateLabel = computed(() =>
  currentItem.value ? formatGalleryDate(currentItem.value.timestamp) : '',
)

/** 发布时填写的作品描述（非生成提示词） */
const publishDescription = computed(() => {
  const desc = currentItem.value?.description?.trim()
  return desc || ''
})

const canPrev = computed(() => props.index > 0)
const canNext = computed(() => props.index < props.items.length - 1)

function close() {
  menuOpen.value = false
  emit('close')
}

function goPrev() {
  if (!canPrev.value) return
  emit('update:index', props.index - 1)
}

function goNext() {
  if (!canNext.value) return
  emit('update:index', props.index + 1)
}

async function onDownload() {
  menuOpen.value = false
  const it = currentItem.value
  if (!it?.url) return
  const ext = it.type === 'video' ? 'mp4' : 'png'
  await downloadMediaUrl(it.url, `onemini-${it.id.slice(0, 8)}.${ext}`)
}

function onShare() {
  menuOpen.value = false
  const it = currentItem.value
  if (!it?.url) return
  void navigator.clipboard.writeText(it.url).then(
    () => toast.showSuccess('链接已复制'),
    () => toast.showError('复制失败'),
  )
}

function onReport() {
  menuOpen.value = false
  toast.show({ message: '举报已提交，感谢反馈', kind: 'info' })
}

function onFollow() {
  toast.show({ message: '关注功能即将上线', kind: 'info' })
}

function goAuthorProfile() {
  openAuthorProfile()
  close()
}

async function onRemixAndClose() {
  await onMakeSameStyle()
  close()
}

async function onReferenceAndClose() {
  await onUseReference()
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  if (e.key === 'ArrowUp') goPrev()
  if (e.key === 'ArrowDown') goNext()
}

function onDocClick(e: MouseEvent) {
  if (!menuOpen.value) return
  if (!menuRoot.value?.contains(e.target as Node)) menuOpen.value = false
}

watch(
  () => props.index,
  () => {
    menuOpen.value = false
  },
)

onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <Teleport to="body">
    <div class="public-detail" role="dialog" aria-modal="true" aria-label="作品详情">
      <div class="public-detail-backdrop" aria-hidden="true" @click="close" />

      <button type="button" class="public-detail-close" title="关闭" @click="close">
        <X :size="22" stroke-width="2" />
      </button>

      <div v-if="currentItem" class="public-detail-layout">
        <div class="public-detail-media-col">
          <div class="public-detail-media">
            <video
              v-if="currentItem.type === 'video' && currentItem.url"
              :src="currentItem.url"
              class="public-detail-asset"
              controls
              playsinline
              preload="metadata"
            />
            <img
              v-else-if="currentItem.url"
              :src="currentItem.url"
              :alt="currentItem.prompt"
              class="public-detail-asset"
            />
          </div>

          <div class="public-detail-nav">
            <button
              type="button"
              class="public-detail-nav-btn"
              title="上一个"
              :disabled="!canPrev"
              @click="goPrev"
            >
              <ChevronUp :size="20" stroke-width="2.25" />
            </button>
            <button
              type="button"
              class="public-detail-nav-btn"
              title="下一个"
              :disabled="!canNext"
              @click="goNext"
            >
              <ChevronDown :size="20" stroke-width="2.25" />
            </button>
          </div>
        </div>

        <aside class="public-detail-panel">
          <header class="public-detail-head">
            <button type="button" class="public-detail-author" @click="goAuthorProfile">
              <span class="public-detail-avatar" aria-hidden="true">
                <img
                  v-if="authorAvatar.avatarUrl"
                  :src="authorAvatar.avatarUrl"
                  alt=""
                />
                <span v-else>{{ authorAvatar.initial }}</span>
              </span>
              <span class="public-detail-author-name">{{ authorName }}</span>
            </button>
            <button type="button" class="public-detail-follow" @click="onFollow">+ 关注</button>

            <div class="public-detail-head-actions">
              <button
                type="button"
                class="public-detail-like"
                :class="{ active: liked }"
                :title="liked ? '取消点赞' : '点赞'"
                @click="onToggleLike"
              >
                <Heart :size="18" :fill="liked ? 'currentColor' : 'none'" />
                <span v-if="liked" class="public-detail-like-count">{{ likes }}</span>
              </button>

              <div ref="menuRoot" class="public-detail-menu-wrap">
                <button
                  type="button"
                  class="public-detail-more"
                  :aria-expanded="menuOpen"
                  title="更多"
                  @click.stop="menuOpen = !menuOpen"
                >
                  <MoreHorizontal :size="20" />
                </button>
                <Transition name="public-detail-menu">
                  <div v-if="menuOpen" class="public-detail-menu" role="menu" @click.stop>
                    <button type="button" role="menuitem" @click="onDownload">
                      <Download :size="16" />
                      下载
                    </button>
                    <button type="button" role="menuitem" @click="onShare">
                      <Share2 :size="16" />
                      分享
                    </button>
                    <button type="button" role="menuitem" @click="onReport">
                      <Shield :size="16" />
                      举报
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </header>

          <div class="public-detail-meta">
            <p v-if="publishDescription" class="public-detail-summary">
              {{ publishDescription }}
            </p>
            <p class="public-detail-subline">
              <span v-if="dateLabel" class="public-detail-date">{{ dateLabel }}</span>
              <span v-if="dateLabel" class="public-detail-subline-sep" aria-hidden="true">|</span>
              <span class="public-detail-ai-tag">内容由 AI 生成</span>
            </p>
          </div>

          <section class="public-detail-prompt-block">
            <h3 class="public-detail-prompt-title">{{ promptTitle }}</h3>
            <p class="public-detail-prompt-text">{{ currentItem.prompt || '暂无提示词' }}</p>
            <p class="public-detail-spec">
              {{ mediaTypeLabel }}生成 · {{ aspectLabel }}
            </p>
          </section>

          <footer class="public-detail-foot">
            <button type="button" class="public-detail-cta" @click="onRemixAndClose">
              <Repeat2 :size="16" />
              做同款
            </button>
            <button
              v-if="canUseReference"
              type="button"
              class="public-detail-cta"
              :disabled="refLoading"
              @click="onReferenceAndClose"
            >
              <ImageIcon :size="16" />
              用作参考图
            </button>
          </footer>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.public-detail {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: stretch;
  justify-content: center;
  color: #fff;
}

.public-detail-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 18, 0.88);
  backdrop-filter: blur(8px);
}

.public-detail-close {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 3;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

.public-detail-layout {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 28px 24px 64px;
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  gap: 0;
}

.public-detail-media-col {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-right: 8px;
}

.public-detail-media {
  flex: 1;
  min-width: 0;
  max-height: calc(100vh - 48px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.public-detail-asset {
  max-width: 100%;
  max-height: calc(100vh - 48px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
}

.public-detail-nav {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.public-detail-nav-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
  }

  &:disabled {
    opacity: 0.28;
    cursor: not-allowed;
  }
}

.public-detail-panel {
  flex-shrink: 0;
  width: min(400px, 36vw);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 0 8px 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.public-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
}

.public-detail-author {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    opacity: 0.88;
  }
}

.public-detail-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  font-size: 14px;
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.public-detail-author-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.public-detail-follow {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.public-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.public-detail-like {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  color: #fff;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &.active {
    color: #ff6b8a;
  }
}

.public-detail-like-count {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.public-detail-more {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #fff;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.public-detail-menu-wrap {
  position: relative;
}

.public-detail-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(32, 34, 40, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);

  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    color: #fff;
    text-align: left;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }
}

.public-detail-menu-enter-active,
.public-detail-menu-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.public-detail-menu-enter-from,
.public-detail-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.public-detail-meta {
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.public-detail-summary {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
  white-space: pre-wrap;
  word-break: break-word;
}

.public-detail-subline {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.42);
}

.public-detail-date {
  color: rgba(255, 255, 255, 0.45);
}

.public-detail-subline-sep {
  opacity: 0.55;
}

.public-detail-ai-tag {
  color: rgba(255, 255, 255, 0.42);
}

.public-detail-prompt-block {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.public-detail-prompt-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
}

.public-detail-prompt-text {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
}

.public-detail-spec {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.public-detail-foot {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding-top: 20px;
}

.public-detail-cta {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.16);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

@media (max-width: 900px) {
  .public-detail-layout {
    flex-direction: column;
    padding: 56px 16px 20px;
    overflow-y: auto;
  }

  .public-detail-media-col {
    flex: none;
    padding-right: 0;
  }

  .public-detail-nav {
    flex-direction: row;
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
  }

  .public-detail-panel {
    width: 100%;
    border-left: none;
    padding-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 16px;
  }
}
</style>
