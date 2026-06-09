<script setup lang="ts">
import GhostIcon from './components/GhostIcon.vue'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppToast from './components/AppToast.vue'
import ChatView from './components/ChatView.vue'
import CreateStudio from './components/CreateStudio.vue'
import IncognitoOverlay from './components/IncognitoOverlay.vue'
import LoginPage from './components/LoginPage.vue'
import ModelsView from './components/ModelsView.vue'
import KnowledgeView from './components/KnowledgeView.vue'
import PageAuroraBackground from './components/PageAuroraBackground.vue'
import WikiGraphView from './components/WikiGraphView.vue'
import SkillsView from './components/SkillsView.vue'
import UserProfileView from './components/UserProfileView.vue'
import WorldStudio from './components/WorldStudio.vue'
import { useAgentStore } from './stores/agent'
import { useAuthStore } from './stores/auth'
import { useLocale } from './composables/useLocale'

const agent = useAgentStore()
const auth = useAuthStore()
const { t } = useLocale()
const { ready, isAuthenticated } = storeToRefs(auth)

watch(
  isAuthenticated,
  (ok) => {
    if (ok) void agent.bootstrapAfterLogin()
  },
  { immediate: true },
)

function applyRouteFromUrl() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('view') !== 'profile') return
  const userId = params.get('user')?.trim()
  agent.openUserProfile(userId || null)
}

onMounted(() => {
  if (isAuthenticated.value) applyRouteFromUrl()
})

watch(isAuthenticated, (ok) => {
  if (ok) applyRouteFromUrl()
})
</script>

<template>
  <Teleport to="body">
    <AppToast />
  </Teleport>
  <div v-if="!ready" class="auth-boot">
    <p>加载中…</p>
  </div>
  <LoginPage v-else-if="!isAuthenticated" />
  <div v-else class="app">
    <PageAuroraBackground />
    <button
      v-if="agent.currentView === 'chat' && !agent.isIncognito"
      type="button"
      class="incognito-trigger"
      :title="t('incognito.openHint')"
      :aria-label="t('incognito.openHint')"
      @click="agent.newIncognitoSession()"
    >
      <GhostIcon :size="26" />
    </button>
    <IncognitoOverlay v-if="agent.isIncognito" />
    <AppSidebar />
    <main class="main">
      <ChatView v-if="agent.currentView === 'chat'" />
      <CreateStudio v-else-if="agent.currentView === 'create'" />
      <WorldStudio v-else-if="agent.currentView === 'world'" />
      <ModelsView v-else-if="agent.currentView === 'models'" />
      <SkillsView v-else-if="agent.currentView === 'skills'" />
      <KnowledgeView v-else-if="agent.currentView === 'knowledge'" />
      <WikiGraphView v-else-if="agent.currentView === 'wikiGraph'" />
      <UserProfileView v-else-if="agent.currentView === 'profile'" />
    </main>
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables.scss' as *;

.auth-boot {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: var(--bg-page-gradient);
}

.app {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: calc(#{$sidebar-expanded-width} + #{$main-content-min-width});
  overflow: hidden;
  position: relative;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: $main-content-min-width;
  position: relative;
  z-index: 1;
  background: transparent;
}

.incognito-trigger {
  position: fixed;
  top: 14px;
  right: 16px;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: var(--text-label, $text-secondary);
  background: color-mix(in srgb, var(--bg-card, #fff) 72%, transparent);
  border: var(--glass-border-width, 1px) solid var(--sidebar-divider, $border-light);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;

  &:hover {
    color: $text-primary;
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 55%, transparent);
    border-color: color-mix(in srgb, $accent 24%, transparent);
  }
}
</style>
