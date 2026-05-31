<script setup lang="ts">
import { computed } from 'vue'
import BrandLogo from './BrandLogo.vue'
import ChatInput from './ChatInput.vue'
import ChatMessages from './ChatMessages.vue'
import ConfigBanner from './ConfigBanner.vue'
import IncognitoBanner from './IncognitoBanner.vue'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()
const { t } = useLocale()

const isEmpty = computed(() => !agent.messages.length)
</script>

<template>
  <div class="chat-view">
    <div class="chat-aurora" aria-hidden="true">
      <div class="chat-aurora__mesh" />
      <div class="chat-aurora__blob chat-aurora__blob--purple" />
      <div class="chat-aurora__blob chat-aurora__blob--pink" />
      <div class="chat-aurora__blob chat-aurora__blob--blue" />
      <div class="chat-aurora__blob chat-aurora__blob--lavender" />
      <div class="chat-aurora__grain" />
    </div>

    <div class="chat-view__body">
      <div v-if="isEmpty" class="chat-empty">
        <div class="empty-hero" :class="{ 'empty-hero--incognito': agent.isIncognito }">
          <BrandLogo :size="64" class="empty-logo" />
          <template v-if="agent.isIncognito">
            <h2 class="empty-title">{{ t('incognito.emptyTitle') }}</h2>
            <p class="empty-sub">{{ t('incognito.emptySub') }}</p>
            <IncognitoBanner variant="hero" class="empty-banner" />
          </template>
          <template v-else>
            <h2 class="empty-title">今天我能帮你什么？</h2>
          </template>
          <ChatInput centered class="empty-input" />
        </div>
      </div>

      <template v-else>
        <div class="chat-conversation">
          <div class="banner-wrap">
            <IncognitoBanner v-if="agent.isIncognito" />
            <ConfigBanner v-else />
          </div>
          <ChatMessages />
          <ChatInput />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.chat-aurora {
  @include cosmic.aurora-mesh-panel;
}

.chat-aurora__mesh {
  position: absolute;
  inset: 0;
  background: var(--chat-mesh-overlay);
  opacity: 0.92;
}

.chat-aurora__grain {
  position: absolute;
  inset: 0;
  opacity: 0.025;
  background-image: var(--glass-noise-image);
  background-size: 180px 180px;
  mix-blend-mode: soft-light;
}

.chat-aurora__blob {
  position: absolute;
  border-radius: 50%;

  &--purple {
    @include cosmic.aurora-mesh-blob(
      min(62vw, 560px),
      min(56vh, 520px),
      $bottom: -18%,
      $left: -12%,
      $color: var(--chat-blob-purple),
      $animation: chat-aurora-drift-1 16s ease-in-out infinite,
      $blur: 110px
    );
  }

  &--pink {
    @include cosmic.aurora-mesh-blob(
      min(54vw, 500px),
      min(50vh, 460px),
      $top: -14%,
      $right: -6%,
      $color: var(--chat-blob-pink),
      $animation: chat-aurora-drift-2 18s ease-in-out infinite,
      $blur: 105px
    );
  }

  &--blue {
    @include cosmic.aurora-mesh-blob(
      min(46vw, 420px),
      min(44vh, 400px),
      $top: 42%,
      $left: 32%,
      $color: var(--chat-blob-blue),
      $animation: chat-aurora-drift-3 20s ease-in-out infinite,
      $blur: 95px
    );
  }

  &--lavender {
    @include cosmic.aurora-mesh-blob(
      min(38vw, 360px),
      min(36vh, 340px),
      $top: 8%,
      $left: 12%,
      $color: var(--chat-blob-lavender),
      $animation: chat-aurora-drift-4 22s ease-in-out infinite,
      $blur: 90px
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-aurora__blob {
    animation: none !important;
  }
}

.chat-view__body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-conversation {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.banner-wrap {
  flex-shrink: 0;
  max-width: 48rem;
  width: 100%;
  margin: 0 auto;
  padding: 12px 20px 0;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 24px;
}

.empty-hero {
  width: 100%;
  max-width: 48rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: center;
  gap: 0;
}

.empty-logo {
  align-self: center;
  margin-bottom: 20px;
}

.empty-title {
  align-self: center;
  font-size: 26px;
  font-weight: 500;
  color: $text-primary;
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin: 0 0 20px;
  max-width: 100%;
}

.empty-sub {
  align-self: center;
  font-size: 14px;
  color: $text-secondary;
  line-height: 1.5;
  margin: 0 0 20px;
  max-width: 36rem;
}

.empty-hero--incognito {
  .empty-title {
    font-size: 24px;
    margin-bottom: 6px;
  }

  .empty-sub {
    margin-bottom: 16px;
  }
}

.empty-banner {
  width: 100%;
  margin-bottom: 20px;
}

.empty-input {
  width: 100%;
  margin-top: 0;
}
</style>
