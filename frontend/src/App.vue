<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppToast from './components/AppToast.vue'
import ChatView from './components/ChatView.vue'
import CreateStudio from './components/CreateStudio.vue'
import LoginPage from './components/LoginPage.vue'
import ModelsView from './components/ModelsView.vue'
import KnowledgeView from './components/KnowledgeView.vue'
import PageAuroraBackground from './components/PageAuroraBackground.vue'
import WikiGraphView from './components/WikiGraphView.vue'
import SkillsView from './components/SkillsView.vue'
import WorldStudio from './components/WorldStudio.vue'
import { useAgentStore } from './stores/agent'
import { useAuthStore } from './stores/auth'

const agent = useAgentStore()
const auth = useAuthStore()
const { ready, isAuthenticated } = storeToRefs(auth)

watch(
  isAuthenticated,
  (ok) => {
    if (ok) void agent.bootstrapAfterLogin()
  },
  { immediate: true },
)
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
    <AppSidebar />
    <main class="main">
      <ChatView v-if="agent.currentView === 'chat'" />
      <CreateStudio v-else-if="agent.currentView === 'create'" />
      <WorldStudio v-else-if="agent.currentView === 'world'" />
      <ModelsView v-else-if="agent.currentView === 'models'" />
      <SkillsView v-else-if="agent.currentView === 'skills'" />
      <KnowledgeView v-else-if="agent.currentView === 'knowledge'" />
      <WikiGraphView v-else-if="agent.currentView === 'wikiGraph'" />
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
</style>
