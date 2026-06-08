<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  getModelConfigGroupById,
  MULTIMODAL_FEATURE_TAGS,
  VISION_MEDIA_TYPES,
  type ModelConfigGroupId,
} from '../config/defaults'
import { getProviderDefinition } from '../config/providers'
import {
  getModelOptions,
  getProvidersForCapability,
  type ProviderModelOption,
} from '../config/providerModels'
import { pickerOptionToProviderOption } from '../api/models'
import GlassSelect from './GlassSelect.vue'
import ModelPickerPopover from './ModelPickerPopover.vue'
import ProviderSelect from './ProviderSelect.vue'
import type { PickerModelOption } from '../types/modelCatalog'
import { useSettingsStore } from '../stores/settings'
import SecureApiKeyField from './SecureApiKeyField.vue'
import type { ModelCapability, ModelProvider } from '../types/agent'

const props = defineProps<{
  groupId: ModelConfigGroupId
}>()

const emit = defineEmits<{ saved: [id: string] }>()

const settings = useSettingsStore()
const savedModelId = ref<string | null>(null)
/** 从预设列表点选时的展示名（自定义填写模型 ID 时不强制绑定） */
const presetLabel = ref('')

const group = computed(() => getModelConfigGroupById(props.groupId)!)
const isVisionGroup = computed(() => props.groupId === 'vision')
const isMultimodalGroup = computed(() => props.groupId === 'multimodal')

const form = reactive({
  name: '',
  capability: 'chat' as ModelCapability,
  provider: 'deepseek' as ModelProvider,
  modelId: '',
  baseUrl: '',
  description: '',
})

const providers = computed(() => getProvidersForCapability(form.capability))

const modelOptions = computed(() => getModelOptions(form.provider, form.capability))

const topHint = computed(() => {
  if (props.groupId === 'language') {
    return '语言模型内置 DeepSeek；其它模型（MiniMax、GPT、Claude 等）可在此添加并填写 API Key。'
  }
  if (props.groupId === 'multimodal') {
    return '多模态模型支持文本对话、图片/视频理解与生成，并可读取用户上传的文件；启用后用于「文本对话」技能。'
  }
  if (props.groupId === 'vision') {
    return '视觉模型用于图片与视频生成，请先选择输出类型，再配置服务商与模型 ID。'
  }
  return '世界模型用于 3D 场景、具身智能与物理仿真，需配置对应服务商与 API Key。'
})

function firstRealOption(opts: ProviderModelOption[]) {
  return opts.find((o) => o.model?.trim())
}

function syncGroupDefaults() {
  form.capability = group.value.defaultCapability
  const list = getProvidersForCapability(form.capability)
  form.provider = list[0] ?? 'openai'
  presetLabel.value = ''
  form.name = ''
  form.modelId = ''
  form.baseUrl = ''
  form.description = ''
}

watch(
  () => props.groupId,
  () => {
    savedModelId.value = null
    syncGroupDefaults()
  },
  { immediate: true },
)

watch(
  () => form.capability,
  () => {
    const list = getProvidersForCapability(form.capability)
    if (!list.includes(form.provider)) form.provider = list[0] ?? 'openai'
  },
)

watch(
  [() => form.provider, () => form.capability],
  () => {
    presetLabel.value = ''
    form.modelId = ''
    form.name = ''
    form.description = ''
    const def = getProviderDefinition(form.provider)
    form.baseUrl = def.defaultBaseUrl ?? ''
  },
  { immediate: true },
)

function applyOptionDefaults(opt?: ProviderModelOption) {
  if (!opt) return
  if (opt.baseUrl) form.baseUrl = opt.baseUrl
  if (!form.name.trim()) form.name = opt.label
  if (opt.description) form.description = opt.description
}

function onPickerSelect(opt: PickerModelOption) {
  const mapped = pickerOptionToProviderOption(opt)
  form.modelId = mapped.model
  presetLabel.value = mapped.label
  applyOptionDefaults(mapped)
}

function onModelIdInput() {
  const match = modelOptions.value.find((o) => o.model === form.modelId.trim())
  if (match) {
    presetLabel.value = match.label
  } else {
    presetLabel.value = ''
  }
}

function saveModel() {
  const modelId = form.modelId.trim()
  if (!modelId && form.provider !== 'tencent') {
    alert('请填写模型 ID')
    return
  }
  if (!form.provider) {
    alert('请选择服务商')
    return
  }

  const preset = modelOptions.value.find((o) => o.model === modelId)
  const picked = preset
    ? pickerOptionToProviderOption({
        id: modelId,
        model: modelId,
        label: preset.label,
        baseUrl: preset.baseUrl,
        description: preset.description,
      })
    : null

  const id = settings.addCustomModel({
    name: form.name.trim() || presetLabel.value || picked?.label || modelId || '未命名模型',
    model: modelId,
    capability: form.capability,
    provider: form.provider,
    baseUrl: form.baseUrl.trim() || picked?.baseUrl,
    enabled: false,
    description: form.description.trim() || picked?.description || '',
  })

  savedModelId.value = id
  emit('saved', id)
}

function resetForm() {
  savedModelId.value = null
  syncGroupDefaults()
  const opts = getModelOptions(form.provider, form.capability)
  const first = firstRealOption(opts)
  form.modelId = first?.model ?? ''
  presetLabel.value = first?.label ?? ''
  applyOptionDefaults(first)
}

const pendingModel = computed(() =>
  savedModelId.value ? settings.getModel(savedModelId.value) : null,
)

async function onConfigurePending(payload: { apiKey?: string; enable: boolean }) {
  const m = pendingModel.value
  if (!m) return
  if (payload.apiKey) await settings.saveModelSecret(m.id, payload.apiKey)
  if (payload.enable) {
    settings.enableModel(m.id)
    settings.bindModelToSkill(m.id)
  }
}
</script>

<template>
  <div class="add-panel">
    <header class="panel-head">
      <h3>添加 {{ group.label }}</h3>
      <p class="hint top-hint">{{ topHint }}</p>
    </header>

    <template v-if="!savedModelId">
      <p v-if="isMultimodalGroup" class="capability-tags">
        <span v-for="tag in MULTIMODAL_FEATURE_TAGS" :key="tag" class="cap-tag">{{ tag }}</span>
      </p>

      <label v-if="isVisionGroup">
        <span>输出类型 <em>*</em></span>
        <GlassSelect
          :model-value="form.capability"
          :options="VISION_MEDIA_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))"
          aria-label="输出类型"
          @update:model-value="form.capability = $event as ModelCapability"
        />
        <p class="field-hint">同一视觉模型可按输出媒体分别配置图片或视频接入。</p>
      </label>

      <div class="field-block">
        <span class="field-label">服务商 <em>*</em></span>
        <ProviderSelect v-model="form.provider" :providers="providers" />
      </div>

      <div class="field-block">
        <span class="field-label">预设模型</span>
        <ModelPickerPopover
          v-model="form.modelId"
          :provider="form.provider"
          :capability="form.capability"
          :selected-label="presetLabel"
          @select="onPickerSelect"
        />
        <p class="field-hint">从推荐列表选择，将自动填入下方的模型 ID。</p>
      </div>

      <label>
        <span>模型 ID <em>*</em></span>
        <input
          v-model="form.modelId"
          placeholder="例如 deepseek-chat 或 ep-20241201xxxx"
          @input="onModelIdInput"
        />
        <p class="field-hint">
          调用 API 时传入的 <code>model</code> 参数；豆包等需在火山方舟控制台创建接入点后填写对应 ID。
        </p>
      </label>

      <label>
        <span>显示名称</span>
        <input v-model="form.name" placeholder="可选，默认使用模型名称" />
      </label>

      <label>
        <span>API Base URL</span>
        <input v-model="form.baseUrl" placeholder="选择模型后自动填充，可修改" />
      </label>

      <p v-if="form.provider === 'tencent'" class="hint block">腾讯云模型使用服务端 .env 密钥，添加后在右侧点击「启用」。</p>
      <p v-else class="hint block">API Key 在保存模型后于下方提交到服务端保险库并启用。</p>

      <label>
        <span>备注</span>
        <input v-model="form.description" placeholder="可选" />
      </label>

      <button type="button" class="save-btn" @click="saveModel">保存模型</button>
    </template>

    <template v-else-if="pendingModel">
      <p class="success">模型已保存，请粘贴 API Key 并点击「启用」。</p>
      <SecureApiKeyField
        :configured="!!pendingModel.secretConfigured"
        :hint="pendingModel.secretHint"
        :enabled="pendingModel.enabled"
        :provider="pendingModel.provider"
        :is-tencent="pendingModel.provider === 'tencent'"
        @configure="onConfigurePending"
        @cancel="settings.revokeModelApiKey(pendingModel.id)"
        @disable="settings.disableModel(pendingModel.id)"
      />
      <button type="button" class="ghost-btn" @click="resetForm">继续添加其他模型</button>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.add-panel {
  padding: 20px;
  height: 100%;
  overflow-y: auto;
}

.panel-head {
  margin-bottom: 18px;

  h3 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
  }
}

.capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 14px;
}

.cap-tag {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  background: $accent-light;
  color: $accent;
}

.hint {
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 0;

  &.top-hint {
    margin-top: 0;
  }

  &.block {
    margin: -8px 0 14px;
  }

  em {
    color: $color-danger;
    font-style: normal;
  }
}

.success {
  font-size: 13px;
  color: $accent;
  margin-bottom: 12px;
  font-weight: 500;
}

.field-block {
  margin-bottom: 14px;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: $text-muted;
  line-height: 1.45;

  code {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 4px;
    background: $accent-light;
    color: $accent;
  }
}

.field-label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;

  em {
    color: $color-danger;
    font-style: normal;
  }
}

label {
  display: block;
  margin-bottom: 14px;

  span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 6px;

    em {
      color: $color-danger;
      font-style: normal;
    }
  }

  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid $border-light;
    border-radius: 8px;
    font-size: 13px;
    color: $text-primary;

    &:focus {
      border-color: $accent;
      box-shadow: $shadow-focus;
    }
  }
}

.save-btn {
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  background: $accent;
  color: $btn-primary-text;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;

  &:hover {
    background: $btn-primary-hover-bg;
    box-shadow: $shadow-glow;
  }
}

.ghost-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  border: 1px dashed $btn-ghost-border;
  border-radius: 8px;
  font-size: 13px;
  background: $btn-ghost-bg;
  color: $btn-ghost-text;

  &:hover {
    border-color: $accent;
    background: $btn-ghost-hover-bg;
    color: $btn-ghost-hover-text;
  }
}
</style>
