<script setup lang="ts">
import {
  Box,
  Brain,
  Database,
  Globe,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Wrench,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useLocale } from '../composables/useLocale'
import ChatHistory from './ChatHistory.vue'
import SidebarFooterBar from './SidebarFooterBar.vue'
import { useAgentStore } from '../stores/agent'
import { useUiPrefsStore } from '../stores/uiPrefs'
import type { ViewId } from '../types/agent'
import { BRAND_NAME } from '../utils/modelLogo'

const agent = useAgentStore()
const ui = useUiPrefsStore()
const { t } = useLocale()

const collapsed = computed(() => ui.sidebarCollapsed)

const navItems = computed(() => [
  { id: 'create' as ViewId, label: t('nav.create'), icon: Palette },
  { id: 'world' as ViewId, label: t('nav.world'), icon: Globe },
  { id: 'models' as ViewId, label: t('nav.models'), icon: Box },
  { id: 'skills' as ViewId, label: t('nav.skills'), icon: Wrench },
  { id: 'knowledge' as ViewId, label: t('nav.knowledge'), icon: Database },
  { id: 'wikiGraph' as ViewId, label: t('nav.wikiGraph'), icon: Brain },
])

const chatNavItem = computed(() => ({
  id: 'chat' as ViewId,
  label: t('nav.chat'),
  icon: MessageSquare,
}))

function selectView(id: ViewId) {
  agent.setCurrentView(id)
}

function onNewChat() {
  agent.newSession()
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed }"
    :aria-expanded="!collapsed"
  >
    <div class="sidebar-head">
      <h1 v-show="!collapsed" class="brand-title brand-wordmark">{{ BRAND_NAME }}</h1>
      <button
        type="button"
        class="collapse-btn"
        :title="collapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        :aria-label="collapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        @click="ui.toggleSidebar()"
      >
        <PanelLeftOpen v-if="collapsed" :size="18" />
        <PanelLeftClose v-else :size="18" />
      </button>
    </div>

    <nav class="nav" :aria-label="t('sidebar.navAria')">
      <button
        type="button"
        class="nav-item"
        :class="{ 'icon-only': collapsed }"
        :title="collapsed ? t('sidebar.newChat') : undefined"
        :aria-label="t('sidebar.newChat')"
        @click="onNewChat"
      >
        <Plus :size="18" class="nav-icon" />
        <span v-show="!collapsed" class="sidebar-text">{{ t('sidebar.newChat') }}</span>
      </button>

      <button
        type="button"
        class="nav-item"
        :class="{ active: agent.currentView === chatNavItem.id, 'icon-only': collapsed }"
        :title="collapsed ? chatNavItem.label : undefined"
        :aria-label="chatNavItem.label"
        @click="selectView(chatNavItem.id)"
      >
        <component :is="chatNavItem.icon" :size="18" class="nav-icon" />
        <span v-show="!collapsed" class="sidebar-text">{{ chatNavItem.label }}</span>
      </button>

      <div v-if="collapsed" class="nav-divider" aria-hidden="true" />

      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="nav-item"
        :class="{ active: agent.currentView === item.id, 'icon-only': collapsed }"
        :title="collapsed ? item.label : undefined"
        :aria-label="item.label"
        @click="selectView(item.id)"
      >
        <component :is="item.icon" :size="18" class="nav-icon" />
        <span v-show="!collapsed" class="sidebar-text">{{ item.label }}</span>
      </button>
    </nav>

    <div v-show="!collapsed" class="sidebar-recents">
      <ChatHistory />
    </div>

    <div v-show="collapsed" class="sidebar-spacer" />

    <SidebarFooterBar :collapsed="collapsed" />
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

$sidebar-expanded: 248px;
$sidebar-collapsed: 56px;

.sidebar {
  --sidebar-width: #{$sidebar-expanded};
  width: var(--sidebar-width);
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px 10px 12px;
  background: $bg-sidebar;
  backdrop-filter: blur(var(--glass-blur, 32px)) saturate(var(--glass-saturate, 1.35));
  -webkit-backdrop-filter: blur(var(--glass-blur, 32px)) saturate(var(--glass-saturate, 1.35));
  border-right: var(--glass-border-width, 1px) solid var(--sidebar-divider, rgba(255, 255, 255, 0.45));
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  z-index: 2;
  transition: width 0.22s ease, padding 0.22s ease;

  &.collapsed {
    --sidebar-width: #{$sidebar-collapsed};
    padding: 10px 8px;
  }
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 12px;
  min-height: 32px;
  padding: 0 2px;

  .collapsed & {
    justify-content: center;
    margin-bottom: 8px;
    min-height: 36px;
  }
}

.brand-title {
  font-size: 17px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  color: var(--text-label, $text-secondary);
  @include cosmic.cosmic-interactive-item(12px);

  &:hover {
    color: $text-primary;
  }

  .collapsed & {
    width: 36px;
    height: 36px;
  }
}

.sidebar-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-recents {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  overflow: hidden;
}

.sidebar-spacer {
  flex: 1;
  min-height: 0;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;

  .collapsed & {
    align-items: center;
    gap: 2px;
  }
}

.nav-divider {
  width: 20px;
  height: 1px;
  margin: 6px 0;
  background: var(--sidebar-divider, $border-light);
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  text-align: left;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 55%, transparent);
  }

  &.icon-only {
    width: 36px;
    height: 36px;
    padding: 0;
    justify-content: center;
  }

  &.active {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 78%, transparent);
    color: $accent-emphasis;
    font-weight: 600;
  }
}

.nav-icon {
  flex-shrink: 0;
  color: var(--text-label, $text-secondary);

  .nav-item.active & {
    color: $accent-emphasis;
  }
}
</style>
