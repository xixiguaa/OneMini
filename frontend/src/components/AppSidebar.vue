<script setup lang="ts">
import {
  Box,
  Database,
  ExternalLink,
  Globe,
  MessageSquare,
  Palette,
  Plus,
  Sparkles,
  Trophy,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useLocale } from '../composables/useLocale'
import { EXTERNAL_LINKS } from '../config/constants'
import ChatHistory from './ChatHistory.vue'
import SidebarFooterBar from './SidebarFooterBar.vue'
import { useAgentStore } from '../stores/agent'
import type { ViewId } from '../types/agent'
import BrandLogo from './BrandLogo.vue'
import { BRAND_NAME } from '../utils/modelLogo'

const agent = useAgentStore()
const { t } = useLocale()

const navItems = computed(() => [
  { id: 'chat' as ViewId, label: t('nav.chat'), icon: MessageSquare },
  { id: 'create' as ViewId, label: t('nav.create'), icon: Palette },
  { id: 'world' as ViewId, label: t('nav.world'), icon: Globe },
  { id: 'models' as ViewId, label: t('nav.models'), icon: Box },
  { id: 'skills' as ViewId, label: t('nav.skills'), icon: Sparkles },
  { id: 'knowledge' as ViewId, label: t('nav.knowledge'), icon: Database },
])

function selectView(id: ViewId) {
  agent.setCurrentView(id)
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <BrandLogo :size="28" />
      <div class="brand-text">
        <h1 class="brand-title">{{ BRAND_NAME }}</h1>
      </div>
    </div>

    <button class="new-chat-btn" @click="agent.newSession()">
      <Plus :size="16" />
      {{ t('sidebar.newChat') }}
    </button>

    <ChatHistory />

    <nav class="nav">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: agent.currentView === item.id }"
        @click="selectView(item.id)"
      >
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="external">
      <p class="ext-label">{{ t('sidebar.external') }}</p>
      <a
        :href="EXTERNAL_LINKS.chatbotArena"
        target="_blank"
        rel="noopener noreferrer"
        class="ext-link"
      >
        <Trophy :size="16" />
        <div>
          <span class="ext-title">{{ t('sidebar.arenaTitle') }}</span>
          <span class="ext-sub">{{ t('sidebar.arenaSub') }}</span>
        </div>
        <ExternalLink :size="12" class="ext-arrow" />
      </a>
    </div>

    <SidebarFooterBar />
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.sidebar {
  width: 248px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
  background: $bg-sidebar;
  backdrop-filter: blur(16px);
  border-right: 1px solid $glass-border;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px 14px;
}

.brand-title {
  font-size: 18px;
  font-weight: 700;
}

.brand-sub {
  font-size: 11px;
  color: $accent-magic;
}

.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px;
  margin-bottom: 10px;
  border-radius: $radius-sm;
  background: linear-gradient(135deg, $accent, $accent-magic);
  color: #fff;
  font-size: 13px;
  font-weight: 500;

  &:hover {
    box-shadow: $shadow-glow;
    transform: translateY(-1px);
  }
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid $glass-border;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-secondary;
  text-align: left;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    background: $accent-light;
    color: $accent;
    font-weight: 600;
    box-shadow: inset 3px 0 0 $accent;
  }
}

.external {
  flex-shrink: 0;
  margin: auto -12px 0;
  padding: 8px;
  border-top: 1px solid $glass-border;
}

.ext-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 2px 6px;
}

.ext-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 6px 8px;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  font-size: 13px;
  border: 1px solid transparent;

  &:hover {
    background: $accent-light;
    border-color: transparent;
  }

  svg:first-child {
    color: $accent-gold;
    flex-shrink: 0;
  }
}

.ext-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
}

.ext-sub {
  display: none;
}

.ext-arrow {
  margin-left: auto;
  color: $text-muted;
}


</style>
