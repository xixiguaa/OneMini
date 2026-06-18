<script setup lang="ts">
import GhostIcon from './components/GhostIcon.vue'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import AppToast from './components/AppToast.vue'
import IncognitoOverlay from './components/IncognitoOverlay.vue'
import LoginPage from './components/LoginPage.vue'
import PageAuroraBackground from './components/PageAuroraBackground.vue'
import { useAgentStore } from './stores/agent'
import { useAuthStore } from './stores/auth'
import { useLocale } from './composables/useLocale'

const agent = useAgentStore()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
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

// Bi-directional sync between vue-router and Pinia agent store view state
watch(
  () => route.name,
  (name) => {
    if (name && name !== agent.currentView) {
      if (name === 'profile') {
        const userId = route.query.user as string | null
        agent.openUserProfile(userId)
      } else {
        agent.setCurrentView(name as any)
      }
    }
  }
)

watch(
  () => [agent.currentView, agent.profileUserId],
  ([view, userId]) => {
    if (view) {
      const currentQueryUser = route.query.user as string | null
      const targetQueryUser = userId as string | null

      if (route.name !== view || currentQueryUser !== targetQueryUser) {
        if (view === 'profile') {
          router.push({
            name: 'profile',
            query: targetQueryUser ? { user: targetQueryUser } : undefined
          })
        } else {
          router.push({ name: view as string })
        }
      }
    }
  }
)
</script>

<template>
  <div class="app-root">
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
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './styles/variables.scss' as *;

.app-root {
  width: 100%;
  height: 100%;
}

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
