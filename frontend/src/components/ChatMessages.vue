<script setup lang="ts">
import {
  Copy,
  Download,
  FileText,
  Loader2,
  RotateCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAgentStore } from '../stores/agent'
import { useToastStore } from '../stores/toast'
import type { ChatMessage, MessageFeedback } from '../types/agent'
import LoadingIndicator from './LoadingIndicator.vue'
import MarkdownContent from './MarkdownContent.vue'

const agent = useAgentStore()
const toast = useToastStore()
const scrollRef = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const copiedId = ref<string | null>(null)

const STATUS_PREFIXES = [
  '📚 Milvus RAG 检索中…',
  '🕸️ LLM-Wiki 检索中…',
  '🦞 多智能体协作中',
]

function isAwaitingReply(content: string): boolean {
  const c = content.trim()
  if (!c) return true
  for (const prefix of STATUS_PREFIXES) {
    if (!c.startsWith(prefix)) continue
    const afterStatus = c
      .replace(/^[^\n]+\n+/, '')
      .replace(/^> 引用：[^\n]*\n\n?/, '')
      .trim()
    if (!afterStatus) return true
  }
  return false
}

function isLastMessage(id: string): boolean {
  const msgs = agent.messages
  return msgs.length > 0 && msgs[msgs.length - 1]?.id === id
}

function shouldShowThinking(msg: ChatMessage): boolean {
  if (!agent.isChatProcessing || !isLastMessage(msg.id)) return false
  if (msg.role !== 'assistant' || msg.type !== 'text') return false
  return isAwaitingReply(msg.content)
}

function canShowActions(msg: ChatMessage): boolean {
  if (msg.role !== 'assistant' || msg.type !== 'text') return false
  if (shouldShowThinking(msg)) return false
  if (!msg.content.trim()) return false
  if (isLastMessage(msg.id) && (agent.isChatProcessing || agent.isStreaming)) return false
  return true
}

const showThinkingForUserTurn = computed(() => {
  if (!agent.isChatProcessing) return false
  const last = agent.messages[agent.messages.length - 1]
  return last?.role === 'user'
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

async function copyMessage(msg: ChatMessage) {
  const text = msg.content.trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = msg.id
    toast.showSuccess('已复制')
    setTimeout(() => {
      if (copiedId.value === msg.id) copiedId.value = null
    }, 1500)
  } catch {
    toast.showError('复制失败')
  }
}

async function regenerateMessage(msg: ChatMessage) {
  if (agent.isChatProcessing) return
  try {
    await agent.regenerateAssistant(msg.id)
  } catch (err: unknown) {
    toast.showError(err instanceof Error ? err.message : '重生成失败')
  }
}

async function setFeedback(msg: ChatMessage, feedback: MessageFeedback) {
  await agent.setMessageFeedback(msg.id, feedback)
}

function siblingVariants(msg: ChatMessage): ChatMessage[] {
  return agent.getMessageBranchVariants(msg.id)
}

function variantBadge(msg: ChatMessage): string | null {
  if (msg.role !== 'assistant') return null
  const variants = siblingVariants(msg)
  if (variants.length <= 1) return null
  const idx = variants.findIndex((v) => v.id === msg.id)
  if (idx < 0) return null
  return idx === 0 ? `回答 1/${variants.length}` : `重新生成 · ${idx + 1}/${variants.length}`
}

function isContinuationActive(msg: ChatMessage) {
  return agent.activePathIds.has(msg.id)
}

function showSetContinuation(msg: ChatMessage) {
  if (msg.role !== 'assistant' || msg.type !== 'text') return false
  if (siblingVariants(msg).length < 2) return false
  return !isContinuationActive(msg)
}

function setContinuation(msg: ChatMessage) {
  agent.switchMessageBranch(msg.id)
}

watch(
  () => agent.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

watch(
  () => agent.isChatProcessing,
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

        <div v-else class="assistant-turn">
          <div
            class="assistant-bubble"
            :class="{
              'assistant-bubble--thinking': shouldShowThinking(msg),
              'assistant-bubble--inactive-branch':
                msg.role === 'assistant' && !isContinuationActive(msg),
            }"
          >
            <div class="assistant-body">
          <LoadingIndicator
            v-if="shouldShowThinking(msg)"
            label="思考中"
            variant="thinking"
            :size="16"
          />
            <MarkdownContent
              v-else-if="msg.type === 'text' && msg.content"
              class="content"
              :content="msg.content"
            />
            <p v-else-if="msg.content" class="content" :class="{ error: msg.type === 'error' }">
              {{ msg.content }}
            </p>

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
              <Loader2
                v-if="msg.attachments.status === 'WAIT' || msg.attachments.status === 'RUN'"
                :size="11"
                class="om-loading-spinner"
                aria-hidden="true"
              />
              {{ msg.attachments.status }}
            </span>
          </div>
          </div>

          <div v-if="variantBadge(msg) || showSetContinuation(msg)" class="msg-meta-row">
            <span v-if="variantBadge(msg)" class="version-badge">{{ variantBadge(msg) }}</span>
            <span
              v-if="variantBadge(msg) && isContinuationActive(msg)"
              class="continuation-hint"
            >
              后续对话基于此版本
            </span>
            <button
              v-if="showSetContinuation(msg)"
              type="button"
              class="continuation-btn"
              :disabled="agent.isChatProcessing"
              @click="setContinuation(msg)"
            >
              以此版本继续对话
            </button>
          </div>

          <div
            v-if="canShowActions(msg)"
            class="msg-actions"
            role="toolbar"
            aria-label="消息操作"
          >
            <button
              type="button"
              class="msg-action-btn"
              :class="{ active: copiedId === msg.id }"
              title="复制"
              @click="copyMessage(msg)"
            >
              <Copy :size="15" stroke-width="1.75" />
            </button>
            <button
              type="button"
              class="msg-action-btn"
              :class="{ liked: msg.feedback === 'like' }"
              title="点赞"
              @click="setFeedback(msg, 'like')"
            >
              <ThumbsUp :size="15" stroke-width="1.75" />
            </button>
            <button
              type="button"
              class="msg-action-btn"
              :class="{ disliked: msg.feedback === 'dislike' }"
              title="点踩"
              @click="setFeedback(msg, 'dislike')"
            >
              <ThumbsDown :size="15" stroke-width="1.75" />
            </button>
            <button
              type="button"
              class="msg-action-btn"
              title="重新生成"
              :disabled="agent.isChatProcessing"
              @click="regenerateMessage(msg)"
            >
              <RotateCw :size="15" stroke-width="1.75" />
            </button>
          </div>
        </div>
      </article>

      <article v-if="showThinkingForUserTurn" class="turn assistant">
        <div class="assistant-bubble assistant-bubble--thinking">
          <LoadingIndicator label="思考中" variant="thinking" :size="16" />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

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
  @include cosmic.cosmic-glass-frost(22px);
  max-width: min(85%, 32rem);
  padding: 12px 18px;
  background: var(--chat-user-bubble-bg, var(--glass-fill-gradient));
  border-radius: 22px 22px 6px 22px;

  .content,
  .file-list {
    position: relative;
    z-index: 1;
  }
}

.assistant-turn {
  max-width: min(92%, 42rem);

  &:hover .msg-actions,
  &:focus-within .msg-actions {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
}

.assistant-bubble {
  @include cosmic.cosmic-glass-frost(22px);
  padding: 14px 18px;
  background: var(--chat-assistant-bubble-bg, var(--glass-fill-gradient));
  border-radius: 22px 22px 22px 6px;

  &--thinking {
    display: inline-flex;
    align-items: center;
    min-width: 148px;
    padding: 12px 16px;
    background: var(--chat-thinking-bg, var(--glass-fill-gradient));
  }
}

.assistant-body {
  position: relative;
  z-index: 1;
  max-width: 100%;
  padding: 0;
}

.msg-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
  padding-left: 2px;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.msg-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: $text-muted;
  transition: color 0.15s ease, background 0.15s ease;

  &:hover:not(:disabled) {
    color: $text-primary;
    background: var(--composer-picker-hover, $accent-light);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.active {
    color: $accent;
  }

  &.liked,
  &.disliked {
    color: $accent;
    background: $accent-light;
  }
}

.assistant-bubble--inactive-branch {
  opacity: 0.92;
  border-left: 2px solid var(--composer-pill-border, $border-light);
  padding-left: 12px;
  margin-left: 2px;
}

.msg-meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 8px;
}

.version-badge {
  font-size: 11px;
  color: $text-muted;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--composer-pill-bg, $bg-elevated);
}

.continuation-hint {
  font-size: 11px;
  color: $accent;
}

.continuation-btn {
  font-size: 11px;
  color: $text-secondary;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover:not(:disabled) {
    color: $accent;
  }

  &:disabled {
    opacity: 0.45;
  }
}

@media (hover: none) {
  .assistant-turn .msg-actions {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}

.content {
  &.error {
    color: $color-warning;
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
  background: var(--composer-pill-bg, $bg-elevated);
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border, $glass-border);
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  padding: 4px 10px;
  background: rgba(184, 134, 11, 0.12);
  color: $text-muted;
  border-radius: 10px;
  font-size: 11px;
}
</style>
