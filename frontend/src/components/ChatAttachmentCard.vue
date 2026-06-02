<script setup lang="ts">
import { FileText, X } from 'lucide-vue-next'
import { fileExtensionBadge } from '../utils/files'
import type { ParsedAttachment } from '../utils/files'

defineProps<{
  attachment: ParsedAttachment
}>()

const emit = defineEmits<{
  remove: []
}>()
</script>

<template>
  <div
    class="attach-card"
    :class="{
      loading: attachment.loading,
      'attach-card--image':
        !attachment.loading &&
        attachment.previewUrl &&
        (attachment.kind === 'image' || attachment.kind === 'video'),
    }"
  >
    <button
      type="button"
      class="attach-remove"
      title="移除"
      :disabled="attachment.loading"
      @click="emit('remove')"
    >
      <X :size="12" />
    </button>

    <p v-if="!attachment.previewUrl || (attachment.kind !== 'image' && attachment.kind !== 'video')" class="attach-name">
      {{ attachment.name }}
    </p>

    <div class="attach-preview">
      <template v-if="attachment.loading">
        <div class="attach-skeleton" aria-hidden="true">
          <span class="sk-line sk-line--lg" />
          <span class="sk-line sk-line--md" />
          <span class="sk-line sk-line--sm" />
        </div>
      </template>
      <template v-else-if="attachment.previewUrl && attachment.kind === 'image'">
        <img :src="attachment.previewUrl" :alt="attachment.name" class="attach-img" />
      </template>
      <template v-else-if="attachment.previewUrl && attachment.kind === 'video'">
        <video :src="attachment.previewUrl" class="attach-img attach-video" muted playsinline />
      </template>
      <template v-else>
        <FileText :size="26" class="attach-doc-icon" aria-hidden="true" />
      </template>
    </div>

    <span class="attach-badge">{{ fileExtensionBadge(attachment.name) }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.attach-card {
  position: relative;
  flex-shrink: 0;
  width: 104px;
  height: 112px;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: var(--composer-pill-bg, $bg-input);
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border, $glass-border);
  box-shadow: $shadow-sm;

  &.loading {
    .attach-name {
      color: $text-muted;
    }
  }

  &--image {
    .attach-preview {
      flex: 1;
      margin: 0;
      border-radius: 0;
      background: transparent;
    }
  }
}

.attach-name {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 8px 4px;
  font-size: 11px;
  line-height: 1.35;
  font-weight: 500;
  color: var(--composer-text, $text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.attach-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 8px 8px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--composer-picker-hover, $bg-elevated);
}

.attach-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.attach-doc-icon {
  color: $text-muted;
}

.attach-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.attach-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;

  .attach-card:hover &,
  .attach-card:focus-within & {
    opacity: 1;
  }

  &:hover:not(:disabled) {
    background: rgba(220, 53, 69, 0.85);
  }

  &:disabled {
    cursor: default;
    opacity: 0;
  }
}

.attach-skeleton {
  width: 100%;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sk-line {
  display: block;
  height: 6px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--composer-muted, $text-muted) 18%, transparent) 0%,
    color-mix(in srgb, var(--composer-muted, $text-muted) 32%, transparent) 50%,
    color-mix(in srgb, var(--composer-muted, $text-muted) 18%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: attach-shimmer 1.4s ease-in-out infinite;

  &--lg {
    width: 88%;
  }

  &--md {
    width: 72%;
    animation-delay: 0.12s;
  }

  &--sm {
    width: 48%;
    animation-delay: 0.24s;
  }
}

@keyframes attach-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@media (hover: none) {
  .attach-remove {
    opacity: 1;
  }
}
</style>
