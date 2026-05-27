import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useAgentStore } from './stores/agent'
import { useSettingsStore } from './stores/settings'
import { initUiPrefsFromStorage } from './stores/uiPrefs'
import './styles/main.scss'

initUiPrefsFromStorage()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

app.mount('#app')

const settings = useSettingsStore()
void Promise.all([
  settings.hydrateSecretStatuses(),
  useAgentStore().initConversations(),
]).catch(console.error)
