<script setup lang="ts">
import AppSidebar from './components/AppSidebar.vue'
import ChatView from './components/ChatView.vue'
import CreateStudio from './components/CreateStudio.vue'
import ModelsView from './components/ModelsView.vue'
import KnowledgeView from './components/KnowledgeView.vue'
import SkillsView from './components/SkillsView.vue'
import WorldStudio from './components/WorldStudio.vue'
import { useAgentStore } from './stores/agent'

const agent = useAgentStore()
</script>

<template>
  <div class="app">
    <div class="forest-bg" aria-hidden="true" />
    <AppSidebar />
    <main class="main">
      <ChatView v-if="agent.currentView === 'chat'" />
      <CreateStudio v-else-if="agent.currentView === 'create'" />
      <WorldStudio v-else-if="agent.currentView === 'world'" />
      <ModelsView v-else-if="agent.currentView === 'models'" />
      <SkillsView v-else-if="agent.currentView === 'skills'" />
      <KnowledgeView v-else-if="agent.currentView === 'knowledge'" />
    </main>
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables.scss' as *;

.app {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.forest-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 70% 45% at 15% 5%, var(--forest-glow-1), transparent),
    radial-gradient(ellipse 50% 35% at 85% 90%, var(--forest-glow-2), transparent),
    $bg-page-gradient;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  z-index: 1;
}
</style>
