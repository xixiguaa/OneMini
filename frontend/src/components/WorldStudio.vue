<script setup lang="ts">
import {
  ChevronDown,
  Download,
  Maximize2,
  Minimize2,
  Settings,
  Sparkles,
  Type,
  Image as ImageIcon,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

const queueText = computed(() => {
  if (agent.worldStatus === 'WAIT') return '排队中'
  if (agent.worldStatus === 'RUN') return '生成中'
  return ''
})

const activeWorld = computed(() => worldHistory.activeItem())

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
  const skill = settings.getSkill('world')
  const modelId = skill?.defaultModelId || settings.worldModels[0]?.id || ''
  const model = settings.getModel(modelId)
  if (!model?.enabled) {
    alert('请先在「模型配置」添加并启用 3D 世界生成模型，并在「技能配置」绑定')
    agent.setCurrentView('models')
    return
  }

  if (worldMode.value === 'image' && !imageBase64.value) {
    alert('请先上传参考图')
    return
  }

  const text = worldMode.value === 'text' ? prompt.value.trim() : prompt.value.trim() || '根据参考图生成 3D 场景'
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
      worldHistory.update(entry.id, { jobId: agent.worldJobId, status: agent.worldStatus || 'WAIT' })
    }
  } catch {
    worldHistory.update(entry.id, { status: 'FAIL' })
  }
}

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

onMounted(() => window.addEventListener('keydown', onEscape))
onUnmounted(() => {
  window.removeEventListener('keydown', onEscape)
  fullscreen.value = false
})

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
</script>

<template>
  <div class="world-page" :class="{ 'is-fullscreen': fullscreen }">
    <div class="world-body">
      <div class="stage card">
        <Viewport3D class="viewport-layer" />

        <div class="stage-tools">
          <button type="button" class="stage-tool-btn" title="模型配置" @click="agent.setCurrentView('models')">
            <Settings :size="18" />
          </button>
          <button
            type="button"
            class="stage-tool-btn"
            :title="fullscreen ? '退出全屏' : '全屏'"
            @click="toggleFullscreen"
          >
            <Minimize2 v-if="fullscreen" :size="18" />
            <Maximize2 v-else :size="18" />
          </button>
        </div>

        <div class="control-legend">
          <span class="legend-title">操作</span>
          <span class="legend-item"><kbd>QWEASD</kbd> 移动</span>
          <span class="legend-item"><kbd>Shift</kbd> 加速</span>
          <span class="legend-item"><kbd>Space</kbd> 跳跃</span>
          <span class="legend-item">鼠标拖拽环顾</span>
        </div>

        <div class="gen-dock">
          <div class="gen-bar">
            <div class="mode-tabs">
              <button type="button" :class="{ active: worldMode === 'text' }" @click="worldMode = 'text'">
                <Type :size="15" />
                文生场景
              </button>
              <button type="button" :class="{ active: worldMode === 'image' }" @click="worldMode = 'image'">
                <ImageIcon :size="15" />
                图生场景
              </button>
            </div>

            <div class="gen-main">
              <button
                v-if="worldMode === 'image'"
                type="button"
                class="thumb-wrap"
                title="上传参考图"
                @click="fileInput?.click()"
              >
                <img v-if="imagePreview" :src="imagePreview" alt="参考" />
                <span v-else class="thumb-placeholder">参考图</span>
              </button>

              <input
                v-model="prompt"
                class="prompt-input"
                :placeholder="
                  worldMode === 'text'
                    ? '描述你想生成的 3D 世界场景…'
                    : '可选：补充场景描述（不填则根据参考图生成）'
                "
                @keydown.enter="generate"
              />
            </div>

            <button type="button" class="generate-btn" :disabled="agent.isProcessing" @click="generate">
              <Sparkles :size="17" />
              立即生成
            </button>

            <input ref="fileInput" type="file" accept="image/*" hidden @change="onImagePick" />
          </div>
        </div>
      </div>

      <aside class="history-panel card">
        <div class="panel-tabs">
          <button
            type="button"
            :class="{ active: worldHistory.rightTab === 'explore' }"
            @click="worldHistory.rightTab = 'explore'"
          >
            探索
          </button>
          <button
            type="button"
            :class="{ active: worldHistory.rightTab === 'create' }"
            @click="worldHistory.rightTab = 'create'"
          >
            创作
          </button>
        </div>

        <div v-if="queueText" class="queue-card">
          <span>{{ queueText }}</span>
          <span v-if="agent.worldStatus === 'WAIT'" class="queue-time">预计还需数分钟</span>
        </div>

        <div class="thumb-list">
          <button
            v-for="item in worldHistory.items"
            :key="item.id"
            type="button"
            class="history-thumb"
            :class="{ active: worldHistory.activeId === item.id }"
            @click="selectHistory(item.id)"
          >
            <img v-if="item.previewUrl" :src="item.previewUrl" alt="" />
            <div v-else class="thumb-empty">{{ item.title }}</div>
            <span class="thumb-status">{{ item.status }}</span>
          </button>
          <p v-if="!worldHistory.items.length" class="empty-hint">生成后将显示在这里</p>
        </div>

        <div v-if="activeWorld?.files?.length" class="download-row">
          <button type="button" class="download-btn">
            <Download :size="16" />
            下载
            <ChevronDown :size="14" />
          </button>
          <a
            v-for="f in activeWorld.files"
            :key="f.url"
            :href="f.url"
            target="_blank"
            rel="noopener"
            class="dl-link"
          >
            {{ f.type }}
          </a>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.world-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 16px 20px 20px;

  &.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 2000;
    padding: 12px;
    background: #0f1410;

    .history-panel {
      background: rgba(0, 0, 0, 0.45);
      border-color: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .stage {
      border-color: rgba(255, 255, 255, 0.12);
    }
  }
}

.world-body {
  flex: 1;
  display: flex;
  gap: 14px;
  min-height: 0;
}

.stage-tools {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  display: flex;
  gap: 8px;
  pointer-events: auto;
}

.stage-tool-btn {
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

.stage {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 320px;
  overflow: hidden;
  border-radius: $radius-md;
  background: #1a1f1c;
}

.viewport-layer {
  position: absolute !important;
  inset: 0;
  z-index: 0;
  pointer-events: none;

  :deep(canvas) {
    pointer-events: auto;
  }
}

.control-legend {
  position: absolute;
  top: 56px;
  left: 14px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  max-width: min(420px, calc(100% - 120px));
  padding: 8px 12px;
  background: rgba(15, 18, 16, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
  pointer-events: none;
}

.legend-title {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  margin-right: 2px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;

  kbd {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 4px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.9);
  }
}

.gen-dock {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 0 16px 14px;
  pointer-events: none;
}

.gen-bar {
  pointer-events: auto;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(15, 18, 16, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.mode-tabs {
  display: flex;
  flex-shrink: 0;
  align-self: center;
  padding: 3px;
  gap: 2px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;

  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 7px 12px;
    border-radius: 8px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.55);
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;

    &.active {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }

    &:hover:not(.active) {
      color: rgba(255, 255, 255, 0.85);
    }
  }
}

.gen-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.thumb-wrap {
  width: 52px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px dashed rgba(255, 255, 255, 0.28);
  background: rgba(0, 0, 0, 0.25);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.45);
  }
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
}

.prompt-input {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  line-height: 1.4;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  &:focus {
    border-color: rgba(59, 130, 246, 0.5);
    outline: none;
  }
}

.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  gap: 6px;
  padding: 0 20px;
  min-height: 40px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.history-panel {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  min-height: 0;
  overflow: hidden;
}

.panel-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;

  button {
    flex: 1;
    padding: 8px;
    font-size: 12px;
    border-radius: 8px;
    color: $text-secondary;

    &.active {
      background: $accent-light;
      color: $accent;
      font-weight: 600;
    }
  }
}

.queue-card {
  padding: 10px 12px;
  background: $accent-light;
  border-radius: 8px;
  font-size: 12px;
  color: $accent;
  flex-shrink: 0;

  .queue-time {
    display: block;
    font-size: 11px;
    opacity: 0.8;
    margin-top: 4px;
  }
}

.thumb-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.history-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;

  &.active {
    border-color: $accent;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-input;
  font-size: 11px;
  color: $text-muted;
  padding: 8px;
  text-align: center;
}

.thumb-status {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 9px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  color: #fff;
}

.empty-hint {
  font-size: 11px;
  color: $text-muted;
  text-align: center;
  padding: 16px 0;
}

.download-row {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: linear-gradient(135deg, $accent, $accent-magic);
  color: #fff;
  border-radius: 18px;
  font-size: 12px;
  font-weight: 600;
}

.dl-link {
  font-size: 11px;
  color: $accent;
  text-align: center;
  text-decoration: none;
}

.is-fullscreen .panel-tabs button {
  color: rgba(255, 255, 255, 0.55);

  &.active {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
}

.is-fullscreen .thumb-empty {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
}

.is-fullscreen .empty-hint,
.is-fullscreen .queue-card {
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.35);
}

@media (max-width: 900px) {
  .world-body {
    flex-direction: column;
  }

  .history-panel {
    width: 100%;
    max-height: 200px;
  }

  .stage {
    min-height: 280px;
  }

  .gen-bar {
    flex-wrap: wrap;
  }

  .mode-tabs {
    width: 100%;
    justify-content: center;
  }

  .gen-main {
    width: 100%;
  }

  .generate-btn {
    width: 100%;
  }

  .control-legend {
    top: 52px;
    max-width: calc(100% - 28px);
  }
}
</style>
