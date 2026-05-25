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
    <div v-if="isEmpty" class="chat-empty">
      <div class="empty-hero">
        <BrandLogo :size="64" />
        <h2 class="empty-title">今天我能帮你什么？</h2>
        <p class="empty-sub">上传文档与图片，支持多轮对话</p>
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
  background: transparent;
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
  align-items: center;
  text-align: center;
  gap: 16px;
}

.empty-title {
  font-size: 26px;
  font-weight: 500;
  color: $text-primary;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.empty-sub {
  font-size: 14px;
  color: $text-secondary;
}

.empty-input {
  width: 100%;
  margin-top: 8px;
}
</style>
