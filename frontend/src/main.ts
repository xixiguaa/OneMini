import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useAgentStore } from './stores/agent'
import { initUiPrefsFromStorage } from './stores/uiPrefs'
import './styles/main.scss'

initUiPrefsFromStorage()

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

app.mount('#app')

useAgentStore().initConversations()
