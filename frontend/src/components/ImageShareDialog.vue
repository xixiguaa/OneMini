<script setup lang="ts">
import { Check, Download, Link2, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { copyShareLink, shareViaPlatform, type SharePlatform } from '../utils/sharePlatforms'
import { downloadMediaUrl } from '../utils/downloadMedia'

const props = defineProps<{
  open: boolean
  title: string
  imageUrl: string
}>()

const emit = defineEmits<{
  close: []
}>()

const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

const platforms: {
  id: SharePlatform | 'copy' | 'download'
  label: string
  logo?: string
}[] = [
  { id: 'copy', label: '复制链接' },
  { id: 'qq', label: 'QQ', logo: '/logos/icon_QQ.svg' },
  { id: 'wechat', label: '微信', logo: '/logos/微信.svg' },
  { id: 'xiaohongshu', label: '小红书', logo: '/logos/小红书.svg' },
  { id: 'douyin', label: '抖音', logo: '/logos/抖音.svg' },
  { id: 'download', label: '下载' },
]

function showTip(msg: string) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = msg
  toastTimer = window.setTimeout(() => {
    toast.value = ''
    toastTimer = null
  }, 2400)
}

function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = ''
  toastTimer = null
}

async function onAction(id: (typeof platforms)[number]['id']) {
  if (!props.imageUrl) return

  try {
    if (id === 'copy') {
      await copyShareLink(props.imageUrl)
      showTip('链接已复制!')
      return
    }
    if (id === 'download') {
      await downloadMediaUrl(props.imageUrl, `onemini-${Date.now()}.png`)
      showTip('已开始下载')
      return
    }
    const msg = await shareViaPlatform(id, props.imageUrl, props.title)
    showTip(msg)
  } catch {
    showTip('操作失败，请重试')
  }
}

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="share-toast">
      <div
        v-if="toast"
        class="share-toast-top"
        role="status"
        aria-live="polite"
      >
        <Check :size="16" class="share-toast-icon" />
        <span class="share-toast-text">{{ toast }}</span>
        <button type="button" class="share-toast-close" title="关闭" @click="dismissToast">
          <X :size="14" />
        </button>
      </div>
    </Transition>

    <div v-if="open" class="share-overlay" @click="onBackdrop" @keydown="onKeydown">
      <div class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <header class="share-head">
          <h3 id="share-dialog-title" class="share-title">{{ title }}</h3>
          <button type="button" class="close-btn" title="关闭" @click="emit('close')">
            <X :size="18" />
          </button>
        </header>

        <div class="share-preview">
          <img :src="imageUrl" :alt="title" />
        </div>

        <div class="share-actions">
          <button
            v-for="p in platforms"
            :key="p.id"
            type="button"
            class="share-item"
            :title="p.label"
            :aria-label="p.label"
            @click="onAction(p.id)"
          >
            <span class="share-icon" :class="{ 'is-logo': !!p.logo, 'is-action': !p.logo }">
              <img v-if="p.logo" :src="p.logo" :alt="p.label" class="share-logo" />
              <Link2 v-else-if="p.id === 'copy'" :size="16" color="#212121" />
              <Download v-else-if="p.id === 'download'" :size="16" color="#212121" />
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.share-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
}

.share-dialog {
  width: 100%;
  max-width: 480px;
  border-radius: 20px;
  background: #2b2b2b;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.share-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.share-title {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.share-preview {
  padding: 20px 24px 32px;
  display: flex;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 12px;
    object-fit: contain;
  }
}

.share-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 0 20px 28px;
  margin-top: 16px;
  overflow-x: auto;
  overflow-y: visible;
}

.share-item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: 50%;
  transition: opacity 0.15s, filter 0.15s;

  &:hover {
    opacity: 0.92;
    filter: brightness(1.08);
  }
}

.share-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;

  &.is-action {
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  &.is-logo {
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }
}

.share-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  display: block;
}

.share-toast-top {
  position: fixed;
  top: 20px;
  left: 50%;
  z-index: 400;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 200px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(22, 58, 40, 0.96);
  border: 1px solid rgba(76, 175, 80, 0.45);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.95);
  transform: translateX(-50%);
}

.share-toast-icon {
  flex-shrink: 0;
  color: #6ee7a0;
}

.share-toast-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
}

.share-toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.75);

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
}

.share-toast-enter-active,
.share-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.share-toast-enter-from,
.share-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
