<script setup lang="ts">
import {
  Box,
  Database,
  GitBranch,
  EyeOff,
  Globe,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Sparkles,
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
  { id: 'chat' as ViewId, label: t('nav.chat'), icon: MessageSquare },
  { id: 'create' as ViewId, label: t('nav.create'), icon: Palette },
  { id: 'world' as ViewId, label: t('nav.world'), icon: Globe },
  { id: 'models' as ViewId, label: t('nav.models'), icon: Box },
  { id: 'skills' as ViewId, label: t('nav.skills'), icon: Sparkles },
  { id: 'knowledge' as ViewId, label: t('nav.knowledge'), icon: Database },
  { id: 'wikiGraph' as ViewId, label: t('nav.wikiGraph'), icon: GitBranch },
])

function selectView(id: ViewId) {
  agent.setCurrentView(id)
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed }"
    :aria-expanded="!collapsed"
  >
    <div class="sidebar-head">
      <h1 v-show="!collapsed" class="brand-title">{{ BRAND_NAME }}</h1>
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

    <div class="chat-actions">
      <button
        class="new-chat-btn"
        :class="{ inactive: agent.isIncognito, 'icon-only': collapsed }"
        :title="collapsed ? t('sidebar.newChat') : undefined"
        @click="agent.newSession()"
      >
        <Plus :size="16" />
        <span v-show="!collapsed" class="sidebar-text">{{ t('sidebar.newChat') }}</span>
      </button>
      <button
        class="incognito-btn"
        :class="{ active: agent.isIncognito, 'icon-only': collapsed }"
        :title="collapsed ? t('sidebar.incognitoHint') : undefined"
        @click="agent.newIncognitoSession()"
      >
        <EyeOff :size="16" />
        <span v-show="!collapsed" class="sidebar-text">{{ t('sidebar.incognito') }}</span>
      </button>
    </div>

    <div class="sidebar-scroll">
      <ChatHistory v-show="!collapsed" />
    </div>

    <div class="sidebar-bottom">
      <nav class="nav" :aria-label="t('sidebar.navAria')">
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

      <SidebarFooterBar :collapsed="collapsed" />
    </div>
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
    padding: 12px 6px;
  }
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  margin-bottom: 8px;
  min-height: 32px;
  padding: 0 2px;

  .collapsed & {
    justify-content: center;
    margin-bottom: 10px;
  }
}

.brand-title {
  font-size: 17px;
  font-weight: 700;
  color: $text-primary;
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
    width: 40px;
    height: 40px;
  }
}

.sidebar-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.chat-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  flex-shrink: 0;

  .collapsed & {
    align-items: center;
    gap: 8px;
  }
}

.new-chat-btn,
.incognito-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  border-radius: $radius-sm;
  font-size: 13px;
  font-weight: 500;

  &.icon-only {
    width: 40px;
    height: 40px;
    padding: 0;
  }
}

.new-chat-btn {
  padding: 11px;
  background: var(--btn-primary-gradient, $accent);
  color: $btn-primary-text;

  &:hover {
    filter: brightness(1.08);
    box-shadow: $shadow-glow;
  }

  &.inactive {
    background: $btn-primary-disabled-bg;
    color: $btn-primary-disabled-text;
  }
}

.incognito-btn {
  padding: 9px 11px;
  color: $accent-emphasis;
  @include cosmic.cosmic-interactive-item;

  &.active {
    color: #fff;
    background: var(--btn-primary-gradient, $accent);
    border-color: transparent;
    box-shadow: $shadow-glow;
  }
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  padding-top: 8px;
  padding-bottom: 8px;
  border-top: 1px solid var(--sidebar-divider, $border-light);

  .collapsed & {
    align-items: center;
    gap: 4px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border-radius: $radius-sm;
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  text-align: left;
  @include cosmic.cosmic-interactive-item;

  &.icon-only {
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }

  &.active {
    @include cosmic.cosmic-interactive-item-active;
    color: $accent-emphasis;
    font-weight: 600;
  }
}

.nav-icon {
  flex-shrink: 0;
}
</style>
