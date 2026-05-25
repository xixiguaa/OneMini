<script setup lang="ts">
import {
  Box,
  Database,
  ExternalLink,
  EyeOff,
  Globe,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
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
        :title="t('sidebar.newChat')"
        @click="agent.newSession()"
      >
        <Plus :size="16" />
        <span v-show="!collapsed" class="sidebar-text">{{ t('sidebar.newChat') }}</span>
      </button>
      <button
        class="incognito-btn"
        :class="{ active: agent.isIncognito, 'icon-only': collapsed }"
        :title="t('sidebar.incognitoHint')"
        @click="agent.newIncognitoSession()"
      >
        <EyeOff :size="16" />
        <span v-show="!collapsed" class="sidebar-text">{{ t('sidebar.incognito') }}</span>
      </button>
    </div>

    <ChatHistory v-show="!collapsed" />

    <nav class="nav" :aria-label="t('sidebar.navAria')">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="nav-item"
        :class="{ active: agent.currentView === item.id, 'icon-only': collapsed }"
        :title="item.label"
        :aria-label="item.label"
        @click="selectView(item.id)"
      >
        <component :is="item.icon" :size="18" class="nav-icon" />
        <span v-show="!collapsed" class="sidebar-text">{{ item.label }}</span>
      </button>
    </nav>

    <div v-show="!collapsed" class="external">
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

    <a
      v-show="collapsed"
      :href="EXTERNAL_LINKS.chatbotArena"
      target="_blank"
      rel="noopener noreferrer"
      class="ext-icon-btn"
      :title="t('sidebar.arenaTitle')"
      :aria-label="t('sidebar.arenaTitle')"
    >
      <Trophy :size="18" />
    </a>

    <SidebarFooterBar :collapsed="collapsed" />
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

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
  backdrop-filter: blur(16px);
  border-right: 1px solid $glass-border;
  flex-shrink: 0;
  overflow: hidden;
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
  color: $text-muted;

  &:hover {
    background: $accent-light;
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
  background: linear-gradient(135deg, $accent, $accent-magic);
  color: #fff;

  &:hover {
    box-shadow: $shadow-glow;
    transform: translateY(-1px);
  }

  &.inactive {
    opacity: 0.85;
  }
}

.incognito-btn {
  padding: 9px 11px;
  color: #5a4a78;
  background: rgba(90, 70, 140, 0.1);
  border: 1px solid rgba(90, 70, 140, 0.28);

  &:hover {
    background: rgba(90, 70, 140, 0.16);
    border-color: rgba(90, 70, 140, 0.4);
  }

  &.active {
    color: #fff;
    background: linear-gradient(135deg, #6b5b95, #5a4a78);
    border-color: transparent;
    box-shadow: 0 2px 10px rgba(90, 70, 140, 0.35);
  }
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  padding-top: 8px;
  padding-bottom: 8px;
  border-top: 1px solid $glass-border;

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
  color: $text-secondary;
  text-align: left;

  &.icon-only {
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    background: $accent-light;
    color: $accent;
    font-weight: 600;
    box-shadow: inset $active-indicator 0 0 $accent;
  }
}

.nav-icon {
  flex-shrink: 0;
}

.external {
  flex-shrink: 0;
  margin-top: auto;
  margin-left: -10px;
  margin-right: -10px;
  padding: 10px 8px 8px;
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

.ext-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-top: auto;
  margin-bottom: 4px;
  align-self: center;
  border-radius: $radius-sm;
  color: $accent-gold;

  &:hover {
    background: $accent-light;
  }
}
</style>
