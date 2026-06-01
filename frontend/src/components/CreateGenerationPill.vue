<script setup lang="ts">
import { ChevronRight, Loader2 } from 'lucide-vue-next'
import { useCreateGenerationPill } from '../composables/useCreateGenerationPill'

const emit = defineEmits<{
  view: [sessionId: string]
}>()

const { visible, focusItem, statusLabel, isGenerating, dismiss, thumbUrl, sessionKey } =
  useCreateGenerationPill()

function onView() {
  const item = focusItem.value
  if (!item) return
  emit('view', sessionKey(item))
  dismiss()
}
</script>

<template>
  <Transition name="gen-pill">
    <button
      v-if="visible && focusItem"
      type="button"
      class="create-gen-pill"
      @click="onView"
    >
      <span class="create-gen-pill__thumb" :class="{ 'create-gen-pill__thumb--loading': isGenerating }">
        <img
          v-if="thumbUrl(focusItem)"
          :src="thumbUrl(focusItem)"
          alt=""
          class="create-gen-pill__img"
        />
        <span v-if="isGenerating" class="create-gen-pill__spinner" aria-hidden="true">
          <Loader2 :size="14" class="om-loading-spinner" />
        </span>
      </span>
      <span class="create-gen-pill__text">{{ statusLabel }}</span>
      <span class="create-gen-pill__action">
        去查看
        <ChevronRight :size="14" />
      </span>
    </button>
  </Transition>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.create-gen-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(100%, 320px);
  height: 40px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(22, 22, 28, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px) saturate(1.2);
  transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    background: rgba(30, 30, 38, 0.94);
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
  }
}

.create-gen-pill__thumb {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);

  &--loading .create-gen-pill__img {
    filter: blur(2px) brightness(0.72);
    transform: scale(1.08);
  }
}

.create-gen-pill__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.create-gen-pill__spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.92);
}

.create-gen-pill__text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-align: left;
}

.create-gen-pill__action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;

  .create-gen-pill:hover & {
    color: #fff;
  }
}

.gen-pill-enter-active,
.gen-pill-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.gen-pill-enter-from,
.gen-pill-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
