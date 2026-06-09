import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useAgentStore } from './stores/agent'
import { useAuthStore } from './stores/auth'
import { useSettingsStore } from './stores/settings'
import { useUserAgentsStore } from './stores/userAgents'
import { initUiPrefsFromStorage } from './stores/uiPrefs'
import './styles/main.scss'

initUiPrefsFromStorage()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
useUserAgentsStore()

app.mount('#app')

async function bootstrap() {
  const auth = useAuthStore()
  await auth.hydrate()
  if (!auth.isAuthenticated) return
  const settings = useSettingsStore()
  await Promise.all([
    settings.hydrateSecretStatuses(),
    useAgentStore().initConversations(),
  ])
}

void bootstrap().catch(console.error)
