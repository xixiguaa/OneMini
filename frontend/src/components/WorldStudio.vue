<script setup lang="ts">
import {
  Download,
  Globe,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Settings,
  Sparkles,
  Type,
} from 'lucide-vue-next'
import LoadingIndicator from './LoadingIndicator.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Viewport3D from './Viewport3D.vue'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import { useWorldHistoryStore } from '../stores/worldHistory'
const agent = useAgentStore()
const settings = useSettingsStore()
const worldHistory = useWorldHistoryStore()

const fullscreen = ref(false)
const worldMode = ref<'text' | 'image'>('text')
const prompt = ref('一条古老的石板小巷，两旁石墙与木桶，远处有石阶，写实风格')
const imagePreview = ref<string | null>(null)
const imageBase64 = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const boundWorldModel = computed(() => {
  const skill = settings.getSkill('world')
  const id = skill?.defaultModelId || settings.worldModels[0]?.id
  return id ? settings.getModel(id) : null
})

const queueText = computed(() => {
  if (agent.worldStatus === 'WAIT') return '排队中'
  if (agent.worldStatus === 'RUN') return '生成中'
  return ''
})

const activeWorld = computed(() => worldHistory.activeItem())

function statusLabel(status: string) {
  const map: Record<string, string> = {
    WAIT: '排队中',
    RUN: '生成中',
    DONE: '已完成',
    FAIL: '失败',
  }
  return map[status] || status
}

watch(
  () => agent.worldPreviewUrl,
  (url) => {
    if (url && worldHistory.activeId) {
      worldHistory.update(worldHistory.activeId, {
        previewUrl: url,
        status: 'DONE',
      })
    }
  },
)

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}

watch(fullscreen, async (on) => {
  document.body.style.overflow = on ? 'hidden' : ''
  await nextTick()
  window.dispatchEvent(new Event('resize'))
})

function openNew() {
  worldHistory.activeId = null
  prompt.value = '一条古老的石板小巷，两旁石墙与木桶，远处有石阶，写实风格'
  imagePreview.value = null
  imageBase64.value = null
  worldMode.value = 'text'
  agent.worldPreviewUrl = null
  agent.worldJobId = null
  agent.worldStatus = null
}

async function onImagePick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  imagePreview.value = URL.createObjectURL(file)
  const reader = new FileReader()
  reader.onload = () => {
    imageBase64.value = (reader.result as string).split(',')[1]
  }
  reader.readAsDataURL(file)
}

async function generate() {
  const model = boundWorldModel.value
  if (!model?.enabled) {
    alert('请先在「模型配置」添加并启用 3D 世界生成模型，并在「Agent 配置 → 技能」绑定')
    agent.setCurrentView('models')
    return
  }

  if (worldMode.value === 'image' && !imageBase64.value) {
    alert('请先上传参考图')
    return
  }

  const text =
    worldMode.value === 'text'
      ? prompt.value.trim()
      : prompt.value.trim() || '根据参考图生成 3D 场景'
  if (!text && worldMode.value === 'text') return

  const title = text.slice(0, 24) || '新世界'
  const entry = worldHistory.add({
    title,
    prompt: text,
    status: 'WAIT',
    previewUrl: imagePreview.value || undefined,
  })

  try {
    await agent.generateWorldFromStudio(text, {
      imageBase64: worldMode.value === 'image' ? imageBase64.value ?? undefined : undefined,
      previewUrl: imagePreview.value ?? undefined,
    })
    if (agent.worldJobId) {
      worldHistory.update(entry.id, {
        jobId: agent.worldJobId,
        status: agent.worldStatus || 'WAIT',
      })
    }
  } catch {
    worldHistory.update(entry.id, { status: 'FAIL' })
  }
}

function selectHistory(id: string) {
  worldHistory.select(id)
  const item = worldHistory.items.find((i) => i.id === id)
  if (item) {
    prompt.value = item.prompt
    agent.worldPreviewUrl = item.previewUrl ?? null
    agent.worldJobId = item.jobId ?? null
    agent.worldStatus = item.status
  }
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

onMounted(() => window.addEventListener('keydown', onEscape))
onUnmounted(() => {
  window.removeEventListener('keydown', onEscape)
  fullscreen.value = false
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="models-page">
    <div class="split-layout">
      <aside class="model-list card">
        <p class="group-label">
          生成记录
          <span v-if="boundWorldModel?.enabled" class="status-ok model-badge">{{ boundWorldModel.name }}</span>
          <span v-else class="status-warn model-badge">未绑定 3D 模型</span>
        </p>
        <p v-if="!worldHistory.items.length" class="list-empty">暂无记录</p>
        <button
          v-for="item in worldHistory.items"
          :key="item.id"
          type="button"
          class="model-item"
          :class="{
            active: worldHistory.activeId === item.id,
            enabled: item.status === 'DONE',
            pending: item.status === 'WAIT' || item.status === 'RUN',
          }"
          @click="selectHistory(item.id)"
        >
          <Globe :size="20" class="section-icon" />
          <div class="item-text">
            <span class="name">{{ item.title }}</span>
            <span class="state">
              <Loader2
                v-if="item.status === 'WAIT' || item.status === 'RUN'"
                :size="12"
                class="om-loading-spinner state-spinner"
                aria-hidden="true"
              />
              {{ statusLabel(item.status) }}
            </span>
          </div>
        </button>

        <button type="button" class="add-trigger" @click="openNew">
          <Plus :size="16" />
          新建世界
        </button>
        <button type="button" class="add-trigger secondary" @click="agent.setCurrentView('models')">
          <Settings :size="16" />
          模型配置
        </button>
      </aside>

      <section class="right-panel card">
        <div class="detail">
          <Teleport to="body" :disabled="!fullscreen">
            <div class="viewport-wrap" :class="{ 'is-fullscreen': fullscreen }">
              <Viewport3D class="viewport-layer" />
              <div class="viewport-tools">
                <button
                  type="button"
                  class="viewport-tool-btn"
                  :title="fullscreen ? '退出全屏' : '全屏'"
                  @click="toggleFullscreen"
                >
                  <Minimize2 v-if="fullscreen" :size="18" />
                  <Maximize2 v-else :size="18" />
                </button>
              </div>
              <div class="control-legend">
                <span class="legend-title">操作</span>
                <span><kbd>QWEASD</kbd> 移动</span>
                <span><kbd>Shift</kbd> 加速</span>
                <span><kbd>Space</kbd> 跳跃</span>
                <span>鼠标拖拽环顾</span>
              </div>
            </div>
          </Teleport>

          <div v-if="queueText" class="queue-banner">
            <LoadingIndicator :label="queueText" variant="inline" :size="16" />
            <span v-if="agent.worldStatus === 'WAIT'" class="queue-sub">预计还需数分钟</span>
          </div>

          <div class="gen-section">
            <label class="field">
              <span>生成方式</span>
              <div class="mode-row">
                <button type="button" class="mode-btn" :class="{ active: worldMode === 'text' }" @click="worldMode = 'text'">
                  <Type :size="15" />
                  文生场景
                </button>
                <button type="button" class="mode-btn" :class="{ active: worldMode === 'image' }" @click="worldMode = 'image'">
                  <ImageIcon :size="15" />
                  图生场景
                </button>
              </div>
            </label>

            <label v-if="worldMode === 'image'" class="field">
              <span>参考图</span>
              <button type="button" class="image-pick" @click="fileInput?.click()">
                <img v-if="imagePreview" :src="imagePreview" alt="参考图" />
                <span v-else>点击上传图片</span>
              </button>
              <input ref="fileInput" type="file" accept="image/*" hidden @change="onImagePick" />
            </label>

            <label class="field">
              <span>场景描述</span>
              <textarea
                v-model="prompt"
                class="input textarea"
                rows="3"
                :placeholder="
                  worldMode === 'text'
                    ? '描述你想生成的 3D 世界场景…'
                    : '可选：补充描述（不填则根据参考图生成）'
                "
                @keydown.enter.exact.prevent="generate"
              />
            </label>

            <div class="actions">
              <button type="button" class="btn-primary" :disabled="agent.isProcessing" @click="generate">
                <Loader2 v-if="agent.isProcessing" :size="16" class="om-loading-spinner" aria-hidden="true" />
                <Sparkles v-else :size="16" />
                {{ agent.isProcessing ? '生成中…' : '立即生成' }}
              </button>
            </div>
          </div>

          <div v-if="activeWorld?.files?.length" class="downloads">
            <p class="field-label">下载资源</p>
            <a
              v-for="f in activeWorld.files"
              :key="f.url"
              :href="f.url"
              target="_blank"
              rel="noopener"
              class="dl-link"
            >
              <Download :size="14" />
              {{ f.type }}
            </a>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.models-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px 28px;
}

.status-ok {
  color: $accent;
  font-weight: 500;
}

.status-warn {
  color: $accent-gold;
  font-weight: 500;
}

.group-label .model-badge {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.card {
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
  min-height: 0;
  overflow: hidden;
}

.model-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 8px 6px;
}

.list-empty {
  font-size: 12px;
  color: $text-muted;
  padding: 8px 10px 12px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  margin-bottom: 4px;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
    box-shadow: inset $active-indicator 0 0 $accent;

    .name {
      font-weight: 600;
    }
  }

  &.enabled .state {
    color: $accent;
    font-weight: 500;
  }

  &.pending .state {
    color: $accent-gold;
    font-weight: 500;
  }
}

.section-icon {
  flex-shrink: 0;
  color: $accent;
  opacity: 0.85;
}

.item-text {
  min-width: 0;

  .name {
    display: block;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: $text-secondary;
    margin-top: 2px;
  }

  .state-spinner {
    flex-shrink: 0;
  }
}

.add-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px dashed $border-light;
  border-radius: 10px;
  font-size: 13px;
  color: $text-secondary;

  &:hover {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
  }

  &.secondary {
    margin-top: 6px;
    border-style: solid;
  }
}

.right-panel {
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.detail {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.viewport-wrap {
  position: relative;
  flex: 1;
  min-height: 280px;
  max-height: min(52vh, 480px);
  border-radius: $radius-sm;
  overflow: hidden;
  background: #1a1f1c;
  border: 1px solid $border-light;
  margin-bottom: 16px;

  &.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 3000;
    width: 100vw;
    height: 100vh;
    max-height: none;
    min-height: 0;
    margin: 0;
    border: none;
    border-radius: 0;
    background: #0f1410;
  }
}

.viewport-layer {
  position: absolute !important;
  inset: 0;
  z-index: 0;

  :deep(canvas) {
    pointer-events: auto;
  }
}

.viewport-tools {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  display: flex;
  gap: 8px;
  pointer-events: auto;
}

.viewport-tool-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(15, 18, 16, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.88);

  &:hover {
    background: rgba(30, 36, 32, 0.95);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.28);
  }
}

.control-legend {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  max-width: calc(100% - 20px);
  padding: 6px 10px;
  background: rgba(15, 18, 16, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.75);
  pointer-events: none;

  .legend-title {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.45);
  }

  kbd {
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    font-size: 9px;
  }
}

.queue-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
  background: $accent-light;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $accent;
  flex-shrink: 0;

  .queue-sub {
    font-size: 12px;
    opacity: 0.85;
  }
}

.gen-section {
  flex-shrink: 0;
  padding-top: 4px;
  border-top: 1px solid $border-light;
}

.field {
  display: block;
  margin-bottom: 14px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 8px;
  }
}

.mode-row {
  display: flex;
  gap: 8px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: $radius-sm;
  border: 1px solid $border-light;
  font-size: 13px;
  color: $text-secondary;
  background: $bg-input;

  &.active {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
    font-weight: 600;
  }

  &:hover:not(.active) {
    border-color: rgba(45, 138, 78, 0.35);
    color: $text-primary;
  }
}

.image-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 200px;
  aspect-ratio: 4 / 3;
  border: 1px dashed $border-light;
  border-radius: $radius-sm;
  overflow: hidden;
  font-size: 12px;
  color: $text-muted;
  background: $bg-input;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover {
    border-color: $accent;
    color: $accent;
  }
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }

  &.textarea {
    resize: vertical;
    line-height: 1.5;
  }
}

.actions {
  margin-top: 4px;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: $radius-sm;
  font-size: 13px;
  font-weight: 600;
  background: $accent;
  color: $btn-primary-text;

  &:disabled {
    opacity: 1;
    background: $btn-primary-disabled-bg;
    color: $btn-primary-disabled-text;
  }

  &:not(:disabled):hover {
    background: $btn-primary-hover-bg;
    box-shadow: $shadow-glow;
  }
}

.downloads {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid $border-light;
}

.field-label {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.dl-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 12px;
  font-size: 13px;
  color: $accent;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }

  .viewport-wrap {
    max-height: 320px;
  }
}
</style>
