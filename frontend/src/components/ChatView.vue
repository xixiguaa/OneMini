<script setup lang="ts">
import { computed } from 'vue'
import BrandLogo from './BrandLogo.vue'
import ChatInput from './ChatInput.vue'
import ChatMessages from './ChatMessages.vue'
import ConfigBanner from './ConfigBanner.vue'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()

const isEmpty = computed(() => !agent.messages.length)
</script>

<template>
  <div class="chat-view">
    <div class="chat-view__body">
      <div v-if="isEmpty" class="chat-empty">
        <div class="empty-hero">
          <BrandLogo :size="64" class="empty-logo" />
          <h2 class="empty-title">今天我能帮你什么？</h2>
          <ChatInput centered class="empty-input" />
        </div>
      </div>

      <template v-else>
        <div class="chat-conversation">
          <div class="banner-wrap">
            <ConfigBanner />
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
  max-width: $chat-column-max;
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
  max-width: $chat-column-max;
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

.empty-input {
  width: 100%;
  margin-top: 0;
}
</style>
