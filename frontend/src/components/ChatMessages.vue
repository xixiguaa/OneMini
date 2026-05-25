<script setup lang="ts">
import { Download, FileText } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAgentStore } from '../stores/agent'
import MarkdownContent from './MarkdownContent.vue'

const agent = useAgentStore()
const scrollRef = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)

const showTypingIndicator = computed(() => {
  if (!agent.isProcessing || agent.isStreaming) return false
  const last = agent.messages[agent.messages.length - 1]
  return !(last?.role === 'assistant' && last.type === 'text')
})

const lastAssistantContent = computed(() => {
  const msgs = agent.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].content
  }
  return ''
})

function isNearBottom(el: HTMLElement, threshold = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
}

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  stickToBottom.value = isNearBottom(el)
}

function scrollToBottom() {
  const el = scrollRef.value
  if (!el || !stickToBottom.value) return
  el.scrollTop = el.scrollHeight
}

watch(
  () => agent.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

watch(
  () => agent.isProcessing,
  async (processing) => {
    if (processing) stickToBottom.value = true
    await nextTick()
    scrollToBottom()
  },
)

watch(lastAssistantContent, async () => {
  await nextTick()
  scrollToBottom()
})

onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <div ref="scrollRef" class="messages-scroll" @scroll="onScroll">
    <div class="messages-inner">
      <article
        v-for="msg in agent.messages"
        :key="msg.id"
        class="turn"
        :class="msg.role"
      >
        <div v-if="msg.role === 'user'" class="user-bubble">
          <p class="content">{{ msg.content }}</p>
          <div v-if="msg.attachments?.uploadedFiles?.length" class="file-list">
            <span v-for="f in msg.attachments.uploadedFiles" :key="f.id" class="file-chip">
              <FileText v-if="f.kind !== 'image'" :size="12" />
              <img v-else-if="f.previewUrl" :src="f.previewUrl" class="mini-thumb" alt="" />
              {{ f.name }}
            </span>
          </div>
        </div>

        <div v-else class="assistant-body">
          <MarkdownContent
            v-if="msg.type === 'text' && msg.content"
            class="content"
            :content="msg.content"
          />
          <p v-else class="content" :class="{ error: msg.type === 'error' }">{{ msg.content }}</p>

          <div v-if="msg.attachments?.uploadedFiles?.length" class="file-list">
            <span v-for="f in msg.attachments.uploadedFiles" :key="f.id" class="file-chip">
              <FileText v-if="f.kind !== 'image'" :size="12" />
              <img v-else-if="f.previewUrl" :src="f.previewUrl" class="mini-thumb" alt="" />
              {{ f.name }}
            </span>
          </div>

          <img
            v-if="msg.attachments?.url && msg.type === 'image'"
            :src="msg.attachments.url"
            class="result-image"
            alt="生成图片"
          />
          <img
            v-if="msg.attachments?.previewUrl && msg.type === 'world'"
            :src="msg.attachments.previewUrl"
            class="result-image"
            alt="世界预览"
          />

          <div v-if="msg.attachments?.files?.length" class="file-links">
            <a
              v-for="f in msg.attachments.files"
              :key="f.url"
              :href="f.url"
              target="_blank"
              rel="noopener"
              class="file-link"
            >
              <Download :size="14" />
              下载 {{ f.type }}
            </a>
          </div>

          <span
            v-if="msg.attachments?.status && msg.attachments.status !== 'DONE'"
            class="status-badge"
          >
            {{ msg.attachments.status }}
          </span>
        </div>
      </article>

      <article v-if="showTypingIndicator" class="turn assistant">
        <div class="assistant-body typing">
          <span class="dot" /><span class="dot" /><span class="dot" />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

$messages-max: 48rem;

.messages-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: auto;
}

.messages-inner {
  max-width: $messages-max;
  margin: 0 auto;
  padding: 28px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.turn {
  contain: layout style;

  &.user {
    display: flex;
    justify-content: flex-end;
  }

  &.assistant {
    display: block;
  }
}

.user-bubble {
  max-width: min(85%, 32rem);
  padding: 12px 18px;
  background: rgba(45, 138, 78, 0.1);
  border: 1px solid rgba(45, 138, 78, 0.14);
  border-radius: 20px 20px 6px 20px;
}

.assistant-body {
  max-width: 100%;
  padding: 2px 4px 2px 0;
}

.content {
  &.error {
    color: #b45309;
  }
}

p.content {
  font-size: 15px;
  line-height: 1.7;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-bubble .content {
  font-size: 15px;
  line-height: 1.55;
}

.file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 12px;
  font-size: 11px;
  color: $text-secondary;
}

.assistant-body .file-chip {
  background: $bg-input;
}

.mini-thumb {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
}

.result-image {
  display: block;
  max-width: min(100%, 360px);
  margin-top: 14px;
  border-radius: 12px;
  border: 1px solid $glass-border;
}

.file-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.file-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: $accent-light;
  border-radius: 16px;
  color: $accent;
  font-size: 12px;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.status-badge {
  display: inline-block;
  margin-top: 10px;
  padding: 4px 10px;
  background: rgba(184, 134, 11, 0.12);
  color: $accent-gold;
  border-radius: 10px;
  font-size: 11px;
}

.typing {
  display: flex;
  gap: 6px;
  padding: 4px 0;
}

.dot {
  width: 7px;
  height: 7px;
  background: $text-muted;
  border-radius: 50%;
  animation: bounce 1.2s infinite;
  will-change: transform;

  &:nth-child(2) {
    animation-delay: 0.15s;
  }

  &:nth-child(3) {
    animation-delay: 0.3s;
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  40% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
</style>
