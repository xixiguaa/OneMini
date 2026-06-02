<script setup lang="ts">
import { Heart, ImageIcon, Repeat2 } from 'lucide-vue-next'
import { onBeforeUnmount, ref } from 'vue'
import { useDiscoverGalleryActions } from '../composables/useDiscoverGalleryActions'
import type { GalleryItem } from '../composables/useWorksGallery'

const props = defineProps<{
  item: GalleryItem
}>()

const TIP_SHOW_DELAY_MS = 450

const tipShown = ref<'remix' | 'reference' | 'like' | null>(null)
let tipShowTimer: ReturnType<typeof setTimeout> | null = null

function onTipEnter(action: 'remix' | 'reference' | 'like') {
  if (tipShowTimer) clearTimeout(tipShowTimer)
  tipShowTimer = setTimeout(() => {
    tipShown.value = action
    tipShowTimer = null
  }, TIP_SHOW_DELAY_MS)
}

function onTipLeave() {
  if (tipShowTimer) {
    clearTimeout(tipShowTimer)
    tipShowTimer = null
  }
  tipShown.value = null
}

onBeforeUnmount(() => {
  if (tipShowTimer) clearTimeout(tipShowTimer)
})

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
} = useDiscoverGalleryActions(() => props.item)
</script>

<template>
  <div class="discover-hover" @click.stop>
    <div class="discover-hover-shade" aria-hidden="true" />

    <div class="discover-hover-bar">
      <button type="button" class="discover-hover-author" @click.stop="openAuthorProfile">
        <span class="discover-hover-avatar" aria-hidden="true">
          <img
            v-if="authorAvatar.avatarUrl"
            :src="authorAvatar.avatarUrl"
            alt=""
            class="discover-hover-avatar-img"
          />
          <span v-else class="discover-hover-avatar-fallback">{{ authorAvatar.initial }}</span>
        </span>
        <span class="discover-hover-name">{{ authorName }}</span>
      </button>

      <div class="discover-hover-actions">
        <div
          class="discover-hover-action-wrap"
          @mouseenter="onTipEnter('remix')"
          @mouseleave="onTipLeave"
        >
          <Transition name="discover-tip">
            <span v-if="tipShown === 'remix'" class="discover-hover-tip">做同款</span>
          </Transition>
          <button
            type="button"
            class="discover-hover-icon-btn"
            title="做同款"
            @click="onMakeSameStyle"
          >
            <Repeat2 :size="18" stroke-width="2" />
          </button>
        </div>

        <div
          v-if="canUseReference"
          class="discover-hover-action-wrap"
          @mouseenter="onTipEnter('reference')"
          @mouseleave="onTipLeave"
        >
          <Transition name="discover-tip">
            <span v-if="tipShown === 'reference'" class="discover-hover-tip">用作参考图</span>
          </Transition>
          <button
            type="button"
            class="discover-hover-icon-btn"
            title="用作参考图"
            :disabled="refLoading"
            @click="onUseReference"
          >
            <ImageIcon :size="18" stroke-width="2" />
          </button>
        </div>

        <div
          class="discover-hover-action-wrap discover-hover-action-wrap--like"
          @mouseenter="onTipEnter('like')"
          @mouseleave="onTipLeave"
        >
          <Transition name="discover-tip">
            <span v-if="tipShown === 'like'" class="discover-hover-tip">点赞</span>
          </Transition>
          <button
            type="button"
            class="discover-hover-like"
            :class="{ active: liked }"
            :title="liked ? '取消点赞' : '点赞'"
            @click="onToggleLike"
          >
            <Heart :size="16" stroke-width="2" :fill="liked ? 'currentColor' : 'none'" />
            <span v-if="liked" class="discover-hover-like-count">{{ likes }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.discover-hover {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.discover-hover-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.72) 0%,
    rgba(0, 0, 0, 0.2) 45%,
    transparent 100%
  );
  pointer-events: none;
}

.discover-hover-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  pointer-events: auto;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.discover-hover-author {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    opacity: 0.92;
  }
}

.discover-hover-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.discover-hover-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.discover-hover-avatar-fallback {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.discover-hover-name {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.discover-hover-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}

.discover-hover-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.discover-hover-tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  background: rgba(28, 28, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.discover-tip-enter-active {
  transition: opacity 0.32s ease, transform 0.32s ease;
}

.discover-tip-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.discover-tip-enter-from,
.discover-tip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

.discover-tip-enter-to,
.discover-tip-leave-from {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.discover-hover-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: transparent;
  border: none;
  border-radius: 0;

  &:hover:not(:disabled) {
    background: transparent;
    opacity: 0.88;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.discover-hover-like {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 0 0 2px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: none;
  border-radius: 0;
  transition: color 0.15s ease, opacity 0.15s ease;

  &:hover {
    background: transparent;
    opacity: 0.88;
  }

  &.active {
    color: #ff6b8a;
    opacity: 1;
  }
}

.discover-hover-like-count {
  min-width: 1ch;
}
</style>
