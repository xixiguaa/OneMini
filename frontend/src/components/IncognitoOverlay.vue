<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted } from 'vue'
import GhostIcon from './GhostIcon.vue'
import ChatInput from './ChatInput.vue'
import ChatMessages from './ChatMessages.vue'
import PageAuroraBackground from './PageAuroraBackground.vue'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()
const { t } = useLocale()

const isEmpty = computed(() => !agent.messages.length)

function close() {
  void agent.exitIncognito()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      class="incognito-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="t('incognito.overlayTitle')"
    >
      <PageAuroraBackground />

      <header class="incognito-header">
        <div class="incognito-header__brand">
          <GhostIcon :size="18" />
          <span>{{ t('incognito.overlayTitle') }}</span>
        </div>
        <button
          type="button"
          class="incognito-header__close"
          :aria-label="t('incognito.close')"
          @click="close"
        >
          <X :size="18" />
        </button>
      </header>

      <div class="incognito-body">
        <div v-if="isEmpty" class="incognito-empty">
          <div class="incognito-empty__hero">
            <GhostIcon :size="56" class="incognito-empty__logo" />
            <h1 class="incognito-empty__title">{{ t('incognito.overlayEmptyTitle') }}</h1>
            <ChatInput centered class="incognito-empty__input" />
            <p class="incognito-disclaimer">{{ t('incognito.overlayDisclaimer') }}</p>
          </div>
        </div>

        <div v-else class="incognito-chat">
          <ChatMessages />
          <div class="incognito-chat__composer">
            <ChatInput />
            <p class="incognito-disclaimer">{{ t('incognito.overlayDisclaimer') }}</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.incognito-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--chat-mesh-base, $bg-page);
}

.incognito-header {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: color-mix(in srgb, $bg-sidebar 88%, transparent);
  backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(var(--glass-saturate, 1.35));
  border-bottom: 1px solid $border-light;
}

.incognito-header__brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.incognito-header__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: $text-secondary;
  transition: background 0.15s ease, color 0.15s ease;
  @include cosmic.cosmic-interactive-item(10px);

  &:hover {
    color: $text-primary;
  }
}

.incognito-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.incognito-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px;
}

.incognito-empty__hero {
  width: 100%;
  max-width: $chat-column-max;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.incognito-empty__logo {
  margin-bottom: 20px;
}

.incognito-empty__title {
  margin: 0 0 24px;
  font-size: 26px;
  font-weight: 500;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: $text-primary;
}

.incognito-empty__input {
  width: 100%;
}

.incognito-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.incognito-chat__composer {
  flex-shrink: 0;
  max-width: $chat-column-max;
  width: 100%;
  margin: 0 auto;
  padding: 0 20px 16px;
}

.incognito-disclaimer {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: $text-muted;
  text-align: center;
}
</style>
