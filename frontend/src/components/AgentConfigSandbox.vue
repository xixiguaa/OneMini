<script setup lang="ts">
import {
  ArrowUp,
  FileText,
  Loader2,
  RefreshCw,
  ScrollText,
  Trash2,
  UserCog,
  X,
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { sendChatStream, type ChatMessagePayload } from '../api/agent'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import { useUserAgentsStore } from '../stores/userAgents'
import { usePlatformStore } from '../stores/platform'
import { composeSystemPromptPreview } from '../utils/agentPersonaCompose'
import { resolveChatModel } from '../utils/resolveModel'
import AgentAvatar from './AgentAvatar.vue'

const props = withDefaults(
  defineProps<{
    closable?: boolean
  }>(),
  { closable: false },
)

const emit = defineEmits<{
  close: []
}>()

interface SandboxMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface TraceEntry {
  id: string
  time: string
  label: string
  detail: string
}

const agentConfig = useAgentConfigStore()
const settings = useSettingsStore()
const userAgents = useUserAgentsStore()
const platform = usePlatformStore()

const messages = ref<SandboxMessage[]>([])
const input = ref('')
const loading = ref(false)
const sandboxSessionId = ref(`sandbox-${Math.random().toString(36).slice(2, 9)}`)
const showTrace = ref(false)
const showVars = ref(false)
const traces = ref<TraceEntry[]>([])
const abortRef = ref<AbortController | null>(null)

const sandboxVars = ref({
  userNickname: '',
  language: '',
  context: '',
})

const form = computed(() => agentConfig.persona)

const systemPrompt = computed(() => {
  const base = composeSystemPromptPreview({
    ...form.value,
    userNickname: sandboxVars.value.userNickname || form.value.userNickname,
    language: sandboxVars.value.language || form.value.language,
  })
  const ctx = sandboxVars.value.context.trim()
  if (!ctx) return base
  return `${base}\n\n## 沙盒模拟上下文\n${ctx}`
})

const resolvedModel = computed(() => {
  const r = resolveChatModel(agentConfig.skeleton, settings)
  return r.ok ? r.model : null
})

const temperature = computed(() => agentConfig.skeleton.models.temperature)

function pushTrace(label: string, detail: string) {
  traces.value.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toLocaleTimeString(),
    label,
    detail,
  })
  if (traces.value.length > 30) traces.value.length = 30
}

function clearChat() {
  if (loading.value) abortRef.value?.abort()
  messages.value = []
  loading.value = false
  sandboxSessionId.value = `sandbox-${Math.random().toString(36).slice(2, 9)}`
  pushTrace('清除对话', '沙盒消息已清空并重置会话')
}

function refreshConfig() {
  pushTrace('刷新配置', `模型 ${resolvedModel.value?.name ?? '—'} · 温度 ${temperature.value}`)
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  const modelResult = resolveChatModel(agentConfig.skeleton, settings)
  if (!modelResult.ok) {
    pushTrace('错误', modelResult.error)
    return
  }

  const model = modelResult.model
  input.value = ''
  const userMsg: SandboxMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: text,
  }
  messages.value.push(userMsg)

  const assistantId = `a-${Date.now()}`
  messages.value.push({ id: assistantId, role: 'assistant', content: '' })

  const apiMessages: ChatMessagePayload[] = [
    { role: 'system', content: systemPrompt.value },
    ...messages.value
      .filter((m) => m.id !== assistantId)
      .map((m) => ({ role: m.role, content: m.content })),
  ]

  loading.value = true
  const controller = new AbortController()
  abortRef.value = controller

  pushTrace(
    '请求',
    `${model.name} · temp=${temperature.value} · system ${systemPrompt.value.length} chars`,
  )

  try {
    await sendChatStream({
      messages: apiMessages,
      model: model.model,
      provider: model.provider,
      baseUrl: model.baseUrl,
      modelConfigId: model.id,
      temperature: temperature.value,
      claudeAgentConfig: agentConfig.skeleton.claudeAgent,
      enabledSkills: [
        ...(platform.webSearchEnabled ? ['web-search'] : []),
        ...(platform.ragEnabled ? ['knowledge-rag'] : []),
        ...(platform.wikiChatEnabled ? ['knowledge-wiki'] : []),
      ],
      conversationId: sandboxSessionId.value,
      signal: controller.signal,
      onDelta: (delta) => {
        const msg = messages.value.find((m) => m.id === assistantId)
        if (msg) msg.content += delta
      },
    })
    pushTrace('完成', `回复 ${messages.value.find((m) => m.id === assistantId)?.content.length ?? 0} 字符`)
  } catch (e) {
    const err = e instanceof Error ? e.message : '请求失败'
    const msg = messages.value.find((m) => m.id === assistantId)
    if (msg) msg.content = `⚠️ ${err}`
    pushTrace('错误', err)
  } finally {
    loading.value = false
    abortRef.value = null
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}

function initVarsFromPersona() {
  sandboxVars.value = {
    userNickname: form.value.userNickname,
    language: form.value.language,
    context: '',
  }
}

initVarsFromPersona()
</script>

<template>
  <aside class="config-sandbox card" aria-label="配置沙盒测试">
    <header class="sandbox-head">
      <div class="sandbox-head__title">
        <span class="sandbox-head__dot" />
        实时沙盒
      </div>
      <div class="sandbox-head__tools">
        <button
          type="button"
          class="sandbox-tool"
          title="刷新当前配置"
          @click="refreshConfig"
        >
          <RefreshCw :size="13" />
        </button>
        <button
          type="button"
          class="sandbox-tool"
          :class="{ active: showVars }"
          title="模拟用户变量"
          @click="showVars = !showVars"
        >
          <UserCog :size="13" />
        </button>
        <button
          type="button"
          class="sandbox-tool"
          :class="{ active: showTrace }"
          title="查看 Trace 日志"
          @click="showTrace = !showTrace"
        >
          <ScrollText :size="13" />
        </button>
        <button type="button" class="sandbox-tool" title="清除对话" @click="clearChat">
          <Trash2 :size="13" />
        </button>
        <span v-if="props.closable" class="sandbox-tool-divider" aria-hidden="true" />
        <button
          v-if="props.closable"
          type="button"
          class="sandbox-tool"
          title="关闭沙盒"
          aria-label="关闭沙盒"
          @click="emit('close')"
        >
          <X :size="13" />
        </button>
      </div>
    </header>

    <div v-if="showVars" class="sandbox-vars">
      <div class="sandbox-vars__head">
        <span>模拟用户变量</span>
        <button type="button" aria-label="关闭" @click="showVars = false">
          <X :size="12" />
        </button>
      </div>
      <label class="sandbox-field">
        <span>称呼</span>
        <input v-model="sandboxVars.userNickname" class="input" placeholder="用户昵称" />
      </label>
      <label class="sandbox-field">
        <span>语言</span>
        <input v-model="sandboxVars.language" class="input" placeholder="中文简体" />
      </label>
      <label class="sandbox-field">
        <span>额外上下文</span>
        <textarea v-model="sandboxVars.context" class="input" rows="2" placeholder="模拟用户背景信息…" />
      </label>
    </div>

    <div v-if="showTrace" class="sandbox-trace">
      <div class="sandbox-trace__head">Trace 日志</div>
      <div v-if="!traces.length" class="sandbox-trace__empty">暂无记录，发送消息后将显示调用详情</div>
      <div v-for="t in traces" :key="t.id" class="trace-row">
        <span class="trace-time">{{ t.time }}</span>
        <span class="trace-label">{{ t.label }}</span>
        <span class="trace-detail">{{ t.detail }}</span>
      </div>
    </div>

    <div class="sandbox-meta">
      <span v-if="resolvedModel">{{ resolvedModel.name }}</span>
      <span>温度 {{ temperature.toFixed(2) }}</span>
    </div>

    <div class="sandbox-messages">
      <div v-if="!messages.length" class="sandbox-empty">
        <AgentAvatar
          :name="form.name"
          :avatar="userAgents.activeAgent?.avatar"
          size="lg"
        />
        <p>修改配置后，在此直接测试对话效果</p>
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="sandbox-msg"
        :class="`sandbox-msg--${msg.role}`"
      >
        <p>{{ msg.content }}<span v-if="loading && msg.role === 'assistant' && !msg.content" class="typing">…</span></p>
      </div>
    </div>

    <footer class="sandbox-composer">
      <textarea
        v-model="input"
        class="sandbox-input"
        rows="2"
        placeholder="输入测试消息…"
        :disabled="loading"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="sandbox-send"
        :disabled="loading || !input.trim()"
        title="发送"
        @click="send"
      >
        <Loader2 v-if="loading" :size="16" class="om-loading-spinner" />
        <ArrowUp v-else :size="16" stroke-width="2.5" />
      </button>
    </footer>

    <details class="sandbox-prompt-preview">
      <summary>
        <FileText :size="12" />
        当前 System Prompt
      </summary>
      <pre>{{ systemPrompt }}</pre>
    </details>
  </aside>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.config-sandbox {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.sandbox-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
}

.sandbox-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.sandbox-head__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: $color-success;
  box-shadow: 0 0 8px color-mix(in srgb, $color-success 60%, transparent);
}

.sandbox-head__tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sandbox-tool-divider {
  width: 1px;
  height: 18px;
  background: $border-light;
  flex-shrink: 0;
  margin: 0 2px;
}

.sandbox-tool {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: $text-muted;
  border: 1px solid transparent;

  &:hover,
  &.active {
    color: $accent-emphasis;
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 20%, transparent);
  }
}

.sandbox-vars,
.sandbox-trace {
  flex-shrink: 0;
  padding: 10px 14px;
  border-bottom: 1px solid $border-light;
  background: color-mix(in srgb, $bg-input 50%, transparent);
}

.sandbox-vars__head,
.sandbox-trace__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  margin-bottom: 8px;
}

.sandbox-field {
  display: block;
  margin-bottom: 8px;

  > span {
    display: block;
    font-size: 10px;
    color: $text-muted;
    margin-bottom: 4px;
  }
}

.input {
  width: 100%;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid $border-light;
  background: var(--bg-card);
  font-size: 12px;
  color: $text-primary;
  outline: none;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }
}

.sandbox-trace {
  max-height: 140px;
  overflow-y: auto;
}

.sandbox-trace__empty {
  font-size: 11px;
  color: $text-muted;
}

.trace-row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 6px;
  font-size: 10px;
  padding: 3px 0;
  color: $text-secondary;
}

.trace-time {
  color: $text-muted;
  font-family: ui-monospace, monospace;
}

.trace-label {
  font-weight: 600;
  color: $accent-emphasis;
}

.trace-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sandbox-meta {
  display: flex;
  gap: 10px;
  padding: 6px 14px;
  font-size: 10px;
  color: $text-muted;
  border-bottom: 1px solid color-mix(in srgb, $border-light 60%, transparent);
  flex-shrink: 0;
}

.sandbox-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sandbox-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: center;
  font-size: 12px;
  color: $text-muted;
  padding: 24px 12px;
}

.sandbox-msg {
  max-width: 92%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.5;

  p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &--user {
    align-self: flex-end;
    background: var(--btn-primary-gradient, $accent);
    color: #fff;
    border-radius: 12px 12px 4px 12px;
  }

  &--assistant {
    align-self: flex-start;
    background: var(--bg-card);
    border: 1px solid $border-light;
    color: $text-primary;
    border-radius: 12px 12px 12px 4px;
  }
}

.typing {
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: 0.3; }
}

.sandbox-composer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid $border-light;
  flex-shrink: 0;
}

.sandbox-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: $bg-input;
  font-size: 12px;
  resize: none;
  outline: none;

  &:focus {
    border-color: $accent;
  }
}

.sandbox-send {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #fff;
  background: var(--btn-primary-gradient, $accent);
  flex-shrink: 0;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.sandbox-prompt-preview {
  flex-shrink: 0;
  border-top: 1px dashed $border-light;
  padding: 8px 14px 10px;
  font-size: 11px;
  color: $text-muted;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    list-style: none;
    user-select: none;

    &::-webkit-details-marker {
      display: none;
    }
  }

  pre {
    margin: 8px 0 0;
    max-height: 120px;
    overflow: auto;
    padding: 8px;
    border-radius: 8px;
    background: $bg-input;
    font-size: 10px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    color: $text-secondary;
  }
}
</style>
