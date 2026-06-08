<script setup lang="ts">
import { Check, ChevronDown, Copy, RotateCcw, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AgentWorkspacePanel from './AgentWorkspacePanel.vue'
import { useAgentConfigStore } from '../stores/agentConfig'
import { RESTRICTION_PRESETS, TONE_OPTIONS } from '../types/agentPersona'
import {
  buildIntroPreview,
  composeSystemPromptPreview,
  composeSystemPromptSegments,
} from '../utils/agentPersonaCompose'

// 人设表单：语义化字段自动组装 System Prompt；场景模板 description 仅作代码侧文档
const agentConfig = useAgentConfigStore()
const showAdvanced = ref(false)
const customRestriction = ref('')
const copiedPrompt = ref(false)

const form = computed(() => agentConfig.persona)

const introPreview = computed(() => buildIntroPreview(form.value))
const systemPromptPreview = computed(() => composeSystemPromptPreview(form.value))
const promptSegments = computed(() => composeSystemPromptSegments(form.value))

const SEGMENT_COLORS: Record<string, string> = {
  identity: '#6366f1',
  soul: '#8b5cf6',
  user: '#0ea5e9',
  agents: '#10b981',
}

async function copySystemPrompt() {
  try {
    await navigator.clipboard.writeText(systemPromptPreview.value)
    copiedPrompt.value = true
    setTimeout(() => {
      copiedPrompt.value = false
    }, 2000)
  } catch {
    /* ignore */
  }
}

function patch(field: keyof typeof form.value, value: unknown) {
  agentConfig.updatePersona({ [field]: value } as Partial<typeof form.value>)
}

function pickTemplate(id: string) {
  agentConfig.applyPersonaTemplate(id)
}

function toggleRestriction(tag: string) {
  const set = new Set(form.value.restrictions)
  if (set.has(tag)) set.delete(tag)
  else set.add(tag)
  patch('restrictions', [...set])
}

function addCustomRestriction() {
  const text = customRestriction.value.trim()
  if (!text) return
  if (!form.value.restrictions.includes(text)) {
    patch('restrictions', [...form.value.restrictions, text])
  }
  customRestriction.value = ''
}

function removeRestriction(tag: string) {
  patch(
    'restrictions',
    form.value.restrictions.filter((r) => r !== tag),
  )
}
</script>

<template>
  <div class="persona-panel">
    <header class="persona-head">
      <button type="button" class="reset-btn" @click="agentConfig.resetWorkspace()">
        <RotateCcw :size="14" />
        恢复默认
      </button>
    </header>

    <div class="template-row">
      <span class="template-label">场景模板</span>
      <div class="template-chips">
        <button
          v-for="t in agentConfig.personaTemplates"
          :key="t.id"
          type="button"
          class="template-chip"
          :class="{ active: form.templateId === t.id }"
          @click="pickTemplate(t.id)"
        >
          {{ t.name }}
        </button>
      </div>
    </div>

    <div class="persona-split">
      <div class="persona-form">
        <section class="form-section">
          <h3 class="form-section-title">基本信息</h3>
          <label class="field">
            <span>助手名称</span>
            <input
              class="input"
              :value="form.name"
              @input="patch('name', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field">
            <span>角色定位</span>
            <textarea
              class="input"
              rows="2"
              :value="form.tagline"
              @input="patch('tagline', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </section>

        <section class="form-section">
          <h3 class="form-section-title">语气风格</h3>
          <div class="tone-grid">
            <button
              v-for="opt in TONE_OPTIONS"
              :key="opt.id"
              type="button"
              class="tone-card"
              :class="{ active: form.tone === opt.id }"
              @click="patch('tone', opt.id)"
            >
              <span class="tone-label">{{ opt.label }}</span>
            </button>
          </div>
        </section>

        <section class="form-section">
          <h3 class="form-section-title">能力边界</h3>
          <label class="field">
            <span>擅长</span>
            <input
              class="input"
              :value="form.strengths"
              @input="patch('strengths', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="field">
            <span>不擅长 / 局限</span>
            <input
              class="input"
              :value="form.weaknesses"
              @input="patch('weaknesses', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </section>

        <section class="form-section">
          <h3 class="form-section-title">用户设定</h3>
          <div class="field-row">
            <label class="field field--half">
              <span>称呼用户为</span>
              <input
                class="input"
                :value="form.userNickname"
                @input="patch('userNickname', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="field field--half">
              <span>回复语言</span>
              <input
                class="input"
                :value="form.language"
                @input="patch('language', ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
          <label class="field">
            <span>回复偏好</span>
            <input
              class="input"
              :value="form.responseStyle"
              @input="patch('responseStyle', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </section>

        <section class="form-section">
          <h3 class="form-section-title">禁止行为</h3>
          <div class="chip-grid">
            <button
              v-for="tag in RESTRICTION_PRESETS"
              :key="tag"
              type="button"
              class="chip"
              :class="{ active: form.restrictions.includes(tag) }"
              @click="toggleRestriction(tag)"
            >
              {{ tag }}
            </button>
          </div>
          <div v-if="form.restrictions.length" class="active-chips">
            <span
              v-for="tag in form.restrictions"
              :key="`active-${tag}`"
              class="chip chip--removable"
            >
              {{ tag }}
              <button type="button" aria-label="移除" @click="removeRestriction(tag)">×</button>
            </span>
          </div>
          <div class="custom-chip-row">
            <input
              v-model="customRestriction"
              class="input"
              @keydown.enter.prevent="addCustomRestriction"
            />
            <button type="button" class="add-chip-btn" @click="addCustomRestriction">添加</button>
          </div>
        </section>

        <section class="form-section">
          <h3 class="form-section-title">工作方式</h3>
          <div class="toggle-list">
            <label class="toggle-row">
              <input
                type="checkbox"
                :checked="form.clarifyFirst"
                @change="patch('clarifyFirst', ($event.target as HTMLInputElement).checked)"
              />
              <span>需求含糊时先澄清（1～2 个问题）</span>
            </label>
            <label class="toggle-row">
              <input
                type="checkbox"
                :checked="form.planComplexTasks"
                @change="patch('planComplexTasks', ($event.target as HTMLInputElement).checked)"
              />
              <span>复杂任务先给步骤规划（≤5 步）</span>
            </label>
            <label class="toggle-row">
              <input
                type="checkbox"
                :checked="form.conclusionFirst"
                @change="patch('conclusionFirst', ($event.target as HTMLInputElement).checked)"
              />
              <span>结论先行，细节放后</span>
            </label>
          </div>
          <label class="field">
            <span>额外指令（可选）</span>
            <textarea
              class="input"
              rows="3"
              :value="form.customInstructions"
              @input="patch('customInstructions', ($event.target as HTMLTextAreaElement).value)"
            />
          </label>
        </section>
      </div>

      <aside class="persona-preview">
        <div class="preview-card preview-card--intro">
          <div class="preview-head">
            <Sparkles :size="16" />
            <span>实时预览</span>
          </div>
          <div class="chat-bubble">{{ introPreview }}</div>
        </div>

        <div class="preview-card">
          <div v-if="form.restrictions.length" class="preview-chips">
            <span v-for="tag in form.restrictions" :key="`p-${tag}`" class="preview-chip">{{ tag }}</span>
          </div>
        </div>

        <div class="preview-card preview-card--muted">
          <ul class="preview-list">
            <li :class="{ off: !form.clarifyFirst }">先澄清需求</li>
            <li :class="{ off: !form.planComplexTasks }">复杂任务分步规划</li>
            <li :class="{ off: !form.conclusionFirst }">结论先行</li>
          </ul>
        </div>
      </aside>
    </div>

    <details class="advanced-block" :open="showAdvanced" @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open">
      <summary class="advanced-summary">
        <ChevronDown :size="16" class="advanced-chevron" />
        进阶：查看生成的 System Prompt
      </summary>
      <div class="prompt-preview-wrap">
        <div class="prompt-preview-toolbar">
          <div class="prompt-legend">
            <span
              v-for="seg in promptSegments"
              :key="seg.key"
              class="legend-chip"
              :style="{ '--seg-color': SEGMENT_COLORS[seg.key] }"
            >
              {{ seg.label }}
            </span>
          </div>
          <button type="button" class="copy-prompt-btn" @click="copySystemPrompt">
            <Check v-if="copiedPrompt" :size="14" />
            <Copy v-else :size="14" />
            {{ copiedPrompt ? '已复制' : '复制全文' }}
          </button>
        </div>
        <div class="prompt-segments">
          <div
            v-for="(seg, i) in promptSegments"
            :key="seg.key"
            class="prompt-segment"
            :style="{ '--seg-color': SEGMENT_COLORS[seg.key] }"
          >
            <div class="prompt-segment-head">
              <span class="prompt-segment-tag">{{ seg.label }}</span>
              <span class="prompt-segment-file">{{ seg.filename }}</span>
            </div>
            <pre class="prompt-segment-body">{{ seg.content }}</pre>
            <hr v-if="i < promptSegments.length - 1" class="prompt-segment-divider" />
          </div>
        </div>
      </div>
    </details>

    <details class="advanced-block advanced-block--files">
      <summary class="advanced-summary">
        <ChevronDown :size="16" class="advanced-chevron" />
        分文件 Markdown 编辑（进阶）
      </summary>
      <AgentWorkspacePanel embedded @manual-edit="agentConfig.syncPersonaFromWorkspace()" />
    </details>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.persona-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.persona-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  color: $text-muted;
  border: 1px solid $border-light;
  flex-shrink: 0;

  &:hover {
    color: $color-danger;
    border-color: color-mix(in srgb, $color-danger 35%, $border-light);
    background: $color-danger-soft;
  }
}

.template-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid $border-light;
}

.template-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-muted;
}

.template-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-chip {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover {
    border-color: color-mix(in srgb, $accent 35%, $border-light);
    color: $text-primary;
  }

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 45%, transparent);
    color: $accent-emphasis;
    font-weight: 600;
  }
}

.persona-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  gap: 20px;
  align-items: start;
}

.form-section {
  margin-bottom: 22px;
}

.form-section-title {
  font-size: 12px;
  font-weight: 600;
  color: $accent;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.field {
  display: block;
  margin-bottom: 12px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 6px;
  }
}

.field-row {
  display: flex;
  gap: 12px;
}

.field--half {
  flex: 1;
  min-width: 0;
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
    outline: none;
  }
}

.tone-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.tone-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, $bg-input 80%, transparent);
  text-align: left;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: color-mix(in srgb, $accent 30%, $border-light);
  }

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 45%, transparent);
  }
}

.tone-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.chip {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.35;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $border-light;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 40%, transparent);
    color: $accent-emphasis;
  }

  &--removable {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: color-mix(in srgb, $accent 10%, transparent);
    border-color: color-mix(in srgb, $accent 25%, transparent);
    color: $accent-emphasis;

    button {
      font-size: 14px;
      line-height: 1;
      opacity: 0.7;
      &:hover {
        opacity: 1;
      }
    }
  }
}

.active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.custom-chip-row {
  display: flex;
  gap: 8px;

  .input {
    flex: 1;
    min-width: 0;
  }
}

.add-chip-btn {
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 25%, transparent);
  flex-shrink: 0;

  &:hover {
    background: color-mix(in srgb, $accent 16%, transparent);
  }
}

.toggle-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: $text-primary;
  cursor: pointer;

  input {
    accent-color: $accent;
    width: 16px;
    height: 16px;
  }
}

.persona-preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, $bg-elevated 85%, transparent);

  &--intro {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, $accent 8%, transparent),
      color-mix(in srgb, $bg-elevated 90%, transparent)
    );
  }

  &--muted {
    opacity: 0.92;
  }
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: $accent-emphasis;
  margin-bottom: 10px;

  svg {
    flex-shrink: 0;
  }
}

.chat-bubble {
  padding: 12px 14px;
  border-radius: 12px 12px 12px 4px;
  background: var(--bg-card, rgba(255, 255, 255, 0.55));
  border: 1px solid color-mix(in srgb, $border-light 80%, transparent);
  font-size: 13px;
  line-height: 1.55;
  color: $text-primary;
  white-space: pre-wrap;
}

.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-chip {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, $color-danger 10%, transparent);
  color: color-mix(in srgb, $color-danger 80%, $text-primary);
  border: 1px solid color-mix(in srgb, $color-danger 20%, transparent);
}

.preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 12px;
  color: $text-secondary;

  li {
    padding: 4px 0;
    &::before {
      content: '✓ ';
      color: $accent;
      font-weight: 600;
    }
    &.off {
      opacity: 0.4;
      text-decoration: line-through;
      &::before {
        content: '○ ';
        color: $text-muted;
      }
    }
  }
}

.advanced-block {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed $border-light;
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }
}

.advanced-block[open] .advanced-chevron {
  transform: rotate(180deg);
}

.advanced-chevron {
  transition: transform 0.2s;
  color: $text-muted;
}

.advanced-block--files {
  margin-top: 12px;
}

.prompt-preview-wrap {
  margin-top: 10px;
}

.prompt-preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.prompt-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.legend-chip {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--seg-color) 12%, transparent);
  color: var(--seg-color);
  border: 1px solid color-mix(in srgb, var(--seg-color) 25%, transparent);
}

.copy-prompt-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 500;
  color: $accent-emphasis;
  background: $accent-light;
  border: 1px solid color-mix(in srgb, $accent 25%, transparent);
  border-radius: 8px;

  &:hover {
    background: color-mix(in srgb, $accent 16%, transparent);
  }
}

.prompt-segments {
  border-radius: 10px;
  border: 1px solid $border-light;
  background: $bg-input;
  overflow: hidden;
}

.prompt-segment {
  border-left: 3px solid var(--seg-color);
}

.prompt-segment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 0;
}

.prompt-segment-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--seg-color);
}

.prompt-segment-file {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: $text-muted;
}

.prompt-segment-body {
  margin: 0;
  padding: 8px 12px 12px;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
}

.prompt-segment-divider {
  border: none;
  border-top: 1px dashed $border-light;
  margin: 0 12px;
}

@media (max-width: 960px) {
  .persona-split {
    grid-template-columns: 1fr;
  }

  .persona-preview {
    position: static;
  }

  .tone-grid {
    grid-template-columns: 1fr;
  }
}
</style>
