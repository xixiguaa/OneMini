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
    <div class="cosmic-bg" aria-hidden="true">
      <div class="cosmic-bg__stars" />
      <div class="cosmic-bg__nebula" />
      <div class="cosmic-bg__aurora cosmic-bg__aurora--1" />
      <div class="cosmic-bg__aurora cosmic-bg__aurora--2" />
    </div>
    <AppSidebar />
    <main class="main" :class="{ 'main--chat': agent.currentView === 'chat' }">
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
  overflow: hidden;
  position: relative;
}

.cosmic-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: $bg-page-gradient;
  overflow: hidden;
  transition: opacity 0.35s ease;
}

.cosmic-bg__stars {
  position: absolute;
  inset: 0;
  opacity: var(--cosmic-star-opacity, 0.6);
  background-image:
    radial-gradient(1.5px 1.5px at 12% 18%, var(--star-color-primary, #d8d0ff) 0%, transparent 100%),
    radial-gradient(1px 1px at 48% 22%, var(--star-color-secondary, #faf8ff) 0%, transparent 100%),
    radial-gradient(2px 2px at 78% 62%, var(--star-color-primary, #d8d0ff) 0%, transparent 100%),
    radial-gradient(1px 1px at 28% 72%, var(--star-color-secondary, #faf8ff) 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 88% 28%, var(--star-color-primary, #d8d0ff) 0%, transparent 100%),
    radial-gradient(1px 1px at 58% 88%, var(--star-color-secondary, #faf8ff) 0%, transparent 100%);
  animation: cosmic-twinkle 8s ease-in-out infinite alternate;
}

.cosmic-bg__nebula {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 50% 20%, var(--nebula-glow), transparent 70%);
}

.cosmic-bg__aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(64px);
  will-change: opacity, transform;
}

.cosmic-bg__aurora--1 {
  width: 70%;
  height: 45%;
  top: -8%;
  left: -12%;
  background: radial-gradient(ellipse at center, var(--aurora-glow-1), transparent 72%);
  animation: cosmic-aurora-1 9s ease-in-out infinite;
}

.cosmic-bg__aurora--2 {
  width: 60%;
  height: 40%;
  bottom: -6%;
  right: -10%;
  background: radial-gradient(ellipse at center, var(--aurora-glow-2), transparent 72%);
  animation: cosmic-aurora-2 11s ease-in-out infinite;
}

@keyframes cosmic-twinkle {
  0% { opacity: calc(var(--cosmic-star-opacity, 0.6) * 0.75); }
  100% { opacity: var(--cosmic-star-opacity, 0.6); }
}

@keyframes cosmic-aurora-1 {
  0%, 100% { opacity: 0.55; transform: translate(0, 0) scale(1); }
  50% { opacity: 0.85; transform: translate(2%, 1%) scale(1.04); }
}

@keyframes cosmic-aurora-2 {
  0%, 100% { opacity: 0.5; transform: translate(0, 0) scale(1); }
  50% { opacity: 0.8; transform: translate(-1%, -2%) scale(1.05); }
}

@media (prefers-reduced-motion: reduce) {
  .cosmic-bg__stars,
  .cosmic-bg__aurora {
    animation: none !important;
  }
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
  z-index: 1;
  background: var(--bg-main, transparent);
}

.app:has(.main--chat) .cosmic-bg {
  opacity: 0.28;
}
</style>
