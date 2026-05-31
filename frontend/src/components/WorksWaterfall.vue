<script setup lang="ts">
import { AlertCircle, Download, Image, Loader2, Pencil, Trash2, Video } from 'lucide-vue-next'
import { ref } from 'vue'
import { useWorksGallery } from '../composables/useWorksGallery'
import type { GalleryItem } from '../composables/useWorksGallery'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useAgentStore } from '../stores/agent'
import { downloadMediaUrl } from '../utils/downloadMedia'
import ConfirmDialog from './ConfirmDialog.vue'

const agent = useAgentStore()
const { galleryItems, hasItems } = useWorksGallery()
const deleteTarget = ref<GalleryItem | null>(null)
const deleting = ref(false)
const brokenImages = ref<Set<string>>(new Set())

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
  if (status === 'RUNNING') return type === 'video' ? '视频生成中…' : '图片生成中…'
  return ''
}

function openEdit(item: GalleryItem) {
  if (item.type !== 'image' || item.status !== 'DONE' || !item.url) return
  agent.openImageEdit({
    id: item.id,
    prompt: item.prompt,
    type: 'image',
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
</script>

<template>
  <section class="works-section">
    <div v-if="hasItems" class="works-grid">
      <article
        v-for="item in galleryItems"
        :key="item.id"
        class="work-card"
        :class="{ pending: item.status === 'RUNNING' }"
      >
        <template v-if="item.status === 'RUNNING'">
          <div class="work-placeholder">
            <button
              type="button"
              class="card-delete-btn"
              title="删除"
              @click.stop="requestDelete(item)"
            >
              <Trash2 :size="14" />
            </button>
            <div class="placeholder-shimmer" aria-hidden="true" />
            <div class="placeholder-content">
              <Loader2 :size="28" class="om-loading-spinner" />
              <span>{{ statusLabel(item.type, item.status) }}</span>
            </div>
          </div>
        </template>

        <template v-else>
          <div
            class="work-media-wrap"
            :class="{ editable: item.type === 'image' }"
            @click="item.type === 'image' && openEdit(item)"
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
            <div v-else class="video-cover">
              <Video :size="28" />
              <span>视频</span>
            </div>

            <div class="work-actions">
              <div class="work-actions-shade" aria-hidden="true" />
              <div class="work-actions-bar">
                <template v-if="item.type === 'image'">
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
                </template>
                <div v-else class="action-btn-group">
                  <button type="button" class="action-btn icon-only" title="下载" @click.stop="downloadItem(item)">
                    <Download :size="16" />
                  </button>
                  <button type="button" class="action-btn icon-only danger" title="删除" @click.stop="requestDelete(item)">
                    <Trash2 :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <p v-if="item.prompt" class="work-caption">{{ item.prompt }}</p>
      </article>
    </div>

    <div v-else class="empty">
      <Image :size="32" />
      <p>暂无创作记录</p>
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
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.work-card {
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
}

.work-media-wrap {
  position: relative;
  aspect-ratio: 1;
  background: $bg-input;
  overflow: hidden;

  &.editable {
    cursor: pointer;
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
  height: 100%;
  object-fit: cover;
  display: block;
}

.work-img-broken {
  width: 100%;
  height: 100%;
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
  aspect-ratio: 1;
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
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
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

.work-caption {
  padding: 8px 10px;
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
