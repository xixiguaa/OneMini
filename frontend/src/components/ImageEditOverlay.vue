<script setup lang="ts">
import {
  ArrowUp,
  ChevronDown,
  Download,
  Loader2,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { ASPECT_RATIOS } from '../config/constants'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import { applyAspectRatioToPrompt } from '../utils/aspectRatioPrompt'
import ConfirmDialog from './ConfirmDialog.vue'
import ImageShareDialog from './ImageShareDialog.vue'
import { downloadMediaUrl } from '../utils/downloadMedia'
import { resolveCreateHistoryImageUrl } from '../utils/createHistoryMedia'

const agent = useAgentStore()
const settings = useSettingsStore()
const showRatioMenu = ref(false)
const showShareDialog = ref(false)
const deleteMode = ref<'session' | 'version' | 'blocked' | null>(null)
const deleteVersionId = ref('')
const deleting = ref(false)

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

const title = computed(() => {
  const p = agent.imageEditActive?.prompt
  if (!p) return '编辑图片'
  return p.length > 36 ? `${p.slice(0, 36)}…` : p
})

const displayUrl = computed(() => {
  const active = agent.imageEditActive
  if (!active) return ''
  if (active.status === 'DONE') {
    const resolved = resolveCreateHistoryImageUrl(active)
    if (resolved) return resolved
  }
  if (active.status === 'RUNNING') {
    const idx = agent.imageEditVersions.findIndex((v) => v.id === active.id)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = agent.imageEditVersions[i]
      const resolved = resolveCreateHistoryImageUrl(prev)
      if (resolved) return resolved
    }
  }
  return active.previewUrl || active.url || ''
})

const isLoading = computed(() => agent.imageEditLoading)

const selectedRatioLabel = computed(() => {
  const id = settings.settings.generationPrefs.aspectRatio
  return ASPECT_RATIOS.find((r) => r.id === id)?.label ?? '1:1'
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!isLoading.value && agent.imageEditInput.trim()) {
      void agent.submitImageEdit()
    }
  }
  if (e.key === 'Escape') {
    showRatioMenu.value = false
    if (showShareDialog.value) {
      showShareDialog.value = false
      return
    }
    agent.closeImageEdit()
  }
}

function pickRatio(id: string) {
  settings.updateGenerationPrefs({ aspectRatio: id })
  agent.imageEditInput = applyAspectRatioToPrompt(agent.imageEditInput, id)
  showRatioMenu.value = false
}

async function downloadCurrent() {
  const url = displayUrl.value
  if (!url) return
  await downloadMediaUrl(url, `onemini-edit-${Date.now()}.png`)
}

function openShareDialog() {
  if (!displayUrl.value) return
  showShareDialog.value = true
}

function requestDeleteSession() {
  const count = agent.imageEditVersions.length
  deleteMode.value = 'session'
  void showConfirm({
    title: '删除作品',
    message:
      count > 1
        ? `删除此作品及全部 ${count} 个编辑版本？此操作会从服务端移除记录且无法恢复。`
        : '确定删除此作品？此操作会从服务端移除记录且无法恢复。',
    confirmLabel: '删除',
    danger: true,
  })
}

function requestDeleteVersion(versionId: string) {
  if (!agent.canDeleteImageEditVersion(versionId)) {
    deleteMode.value = 'blocked'
    void showConfirm({
      title: '无法删除',
      message: '只能删除最新版本（无后续编辑分支的版本）。',
      confirmLabel: '知道了',
      danger: false,
    })
    return
  }
  deleteMode.value = 'version'
  deleteVersionId.value = versionId
  const isOnly = agent.imageEditVersions.length === 1
  void showConfirm({
    title: isOnly ? '删除作品' : '删除版本',
    message: isOnly
      ? '确定删除此作品？此操作会从服务端移除记录且无法恢复。'
      : '删除此版本？此操作会从服务端移除记录且无法恢复。',
    confirmLabel: '删除',
    danger: true,
  })
}

async function onDeleteConfirm() {
  if (deleteMode.value === 'blocked') {
    deleteMode.value = null
    onConfirmOk()
    return
  }
  deleting.value = true
  try {
    if (deleteMode.value === 'session') {
      await agent.deleteImageEditSession()
    } else if (deleteMode.value === 'version') {
      await agent.deleteImageEditVersion(deleteVersionId.value)
    }
    deleteMode.value = null
    deleteVersionId.value = ''
    onConfirmOk()
  } catch {
    /* keep open */
  } finally {
    deleting.value = false
  }
}

function onDeleteCancel() {
  if (deleting.value) return
  deleteMode.value = null
  deleteVersionId.value = ''
  onConfirmCancel()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="agent.imageEditOpen" class="edit-overlay" @click="showRatioMenu = false" @keydown="onKeydown">
      <header class="edit-head">
        <div class="head-left">
          <button type="button" class="head-icon-btn" title="关闭" @click="agent.closeImageEdit()">
            <X :size="20" />
          </button>
          <h2 class="edit-title">{{ title }}</h2>
        </div>

        <div class="head-actions">
          <div class="ratio-wrap" @click.stop>
            <button type="button" class="head-pill" @click="showRatioMenu = !showRatioMenu">
              <span>{{ selectedRatioLabel }}</span>
              <ChevronDown :size="14" />
            </button>
            <div v-if="showRatioMenu" class="ratio-menu">
              <button
                v-for="r in ASPECT_RATIOS"
                :key="r.id"
                type="button"
                class="ratio-item"
                :class="{ active: settings.settings.generationPrefs.aspectRatio === r.id }"
                @click="pickRatio(r.id)"
              >
                {{ r.label }}
              </button>
            </div>
          </div>

          <button type="button" class="head-pill share" @click="openShareDialog">
            <Share2 :size="15" />
            <span>分享</span>
          </button>

          <button type="button" class="head-icon-btn" title="下载" @click="downloadCurrent">
            <Download :size="18" />
          </button>

          <button type="button" class="head-icon-btn danger" title="删除作品" @click="requestDeleteSession">
            <Trash2 :size="18" />
          </button>
        </div>
      </header>

      <div class="edit-body">
        <aside v-if="agent.imageEditVersions.length" class="version-rail">
          <div
            v-for="ver in agent.imageEditVersions"
            :key="ver.id"
            class="version-thumb-wrap"
          >
            <button
              type="button"
              class="version-thumb"
              :class="{ active: agent.imageEditActive?.id === ver.id, pending: ver.status === 'RUNNING' }"
              @click="agent.selectImageEditVersion(ver.id)"
            >
              <img v-if="ver.url" :src="ver.url" alt="" />
              <span v-else class="thumb-loading">
                <Loader2 :size="16" class="om-loading-spinner" />
              </span>
            </button>
            <button
              v-if="agent.canDeleteImageEditVersion(ver.id)"
              type="button"
              class="thumb-delete"
              title="删除此版本"
              @click.stop="requestDeleteVersion(ver.id)"
            >
              <X :size="12" />
            </button>
          </div>
        </aside>

        <div class="edit-center">
          <div class="preview-box">
            <img
              v-if="displayUrl"
              :key="displayUrl"
              :src="displayUrl"
              alt=""
              class="preview-img"
              :class="{ dimmed: isLoading }"
            />
            <div v-if="isLoading" class="preview-loading">
              <Loader2 :size="36" class="om-loading-spinner" />
            </div>
          </div>
        </div>
      </div>

      <footer class="edit-composer">
        <div class="composer-pill">
            <button type="button" class="composer-plus" title="添加参考" disabled>
              <Plus :size="20" />
            </button>
            <input
              v-model="agent.imageEditInput"
              type="text"
              class="composer-input"
              placeholder="描述编辑"
              :disabled="isLoading"
              @keydown="onKeydown"
            />
            <button
              type="button"
              class="send-btn"
              :class="{ ready: agent.imageEditInput.trim() && !isLoading }"
              :disabled="!agent.imageEditInput.trim() || isLoading"
              title="应用编辑"
              @click="agent.submitImageEdit()"
            >
              <Loader2 v-if="isLoading" :size="18" class="om-loading-spinner" />
              <ArrowUp v-else :size="18" stroke-width="2.5" />
            </button>
        </div>
      </footer>

      <ImageShareDialog
        :open="showShareDialog"
        :title="agent.imageEditActive?.prompt || '创作图片'"
        :image-url="displayUrl"
        @close="showShareDialog = false"
      />

      <ConfirmDialog
        :open="confirmOpen"
        :title="confirmTitle"
        :message="confirmMessage"
        :confirm-label="confirmConfirmLabel"
        :cancel-label="confirmCancelLabel"
        :danger="confirmDanger"
        :loading="confirmLoading || deleting"
        :show-cancel="deleteMode !== 'blocked'"
        @update:open="onConfirmOpenUpdate"
        @confirm="onDeleteConfirm"
        @cancel="onDeleteCancel"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

$rail-width: 52px;
$content-max: 680px;

.edit-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: #060412;
  color: rgba(255, 255, 255, 0.92);
}

.edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.head-icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.85);
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &.danger:hover {
    background: rgba(220, 53, 69, 0.35);
    color: #ffb4bc;
  }
}

.head-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &.share {
    background: rgba(255, 255, 255, 0.12);

    &:hover {
      background: rgba(255, 255, 255, 0.18);
    }
  }
}

.ratio-wrap {
  position: relative;
}

.ratio-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 120px;
  padding: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 0.5px solid rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 10;
}

.ratio-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  color: rgba(255, 255, 255, 0.85);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: #fff;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.1);
  }
}

.edit-title {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edit-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 24px 8px;
  overflow: hidden;
}

.version-rail {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: calc(#{$rail-width} + 8px);
  max-height: min(68vh, 520px);
  overflow-y: auto;
  padding: 4px 8px 4px 0;
  z-index: 2;
}

.edit-center {
  width: 100%;
  max-width: $content-max;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.version-thumb-wrap {
  position: relative;
  width: $rail-width;
  flex-shrink: 0;

  &:hover .thumb-delete {
    opacity: 1;
  }
}

.version-thumb {
  width: $rail-width;
  height: $rail-width;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid transparent;
  opacity: 0.7;
  transition: opacity 0.15s, border-color 0.15s;
  background: rgba(255, 255, 255, 0.06);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &.active {
    opacity: 1;
    border-color: #fff;
  }

  &:hover {
    opacity: 1;
  }
}

.thumb-delete {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 3;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(220, 53, 69, 0.92);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);

  &:hover {
    background: rgba(200, 35, 51, 1);
  }
}

.thumb-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.6);
}

.preview-box {
  position: relative;
  width: 100%;
  max-height: min(62vh, 560px);
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  display: block;
  width: 100%;
  max-height: min(62vh, 560px);
  object-fit: contain;

  &.dimmed {
    opacity: 0.4;
  }
}

.preview-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.9);
}

.edit-composer {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding: 12px 24px 28px;
}

.composer-pill {
  width: 100%;
  max-width: $content-max;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 52px;
  padding: 0 8px 0 4px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 0.5px solid rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.composer-plus {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.45);
  flex-shrink: 0;

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

.composer-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  border: none;
  background: transparent;
  font-size: 15px;
  line-height: 52px;
  color: #ececec;
  outline: none;

  &::placeholder {
    color: rgba(255, 255, 255, 0.42);
  }

  &:disabled {
    opacity: 0.55;
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  margin-right: 2px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.4);
  transition: background 0.15s, color 0.15s;

  &.ready {
    background: #fff;
    color: #212121;

    &:hover {
      filter: brightness(0.95);
    }
  }

  &:disabled {
    cursor: not-allowed;
  }
}

@media (max-width: 720px) {
  .version-rail {
    left: 12px;
  }

  .head-pill span {
    display: none;
  }

  .head-pill {
    padding: 0 10px;
  }
}
</style>
