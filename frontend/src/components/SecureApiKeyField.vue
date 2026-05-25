<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModelProvider } from '../types/agent'
import {
  getApiKeyFormatHint,
  maskApiKey,
  preventCopy,
  validateApiKey,
} from '../utils/apiKey'

const props = defineProps<{
  apiKey: string
  enabled: boolean
  provider?: ModelProvider
  isTencent?: boolean
}>()

const emit = defineEmits<{
  save: [key: string]
  enable: []
  cancel: []
  disable: []
}>()

const draft = ref('')
const validationError = ref('')

const hasKey = computed(() => !!props.apiKey?.trim())
const showEditor = computed(() => !props.enabled && !props.isTencent && !hasKey.value)
const showPending = computed(
  () => !props.enabled && !props.isTencent && hasKey.value,
)
const showLocked = computed(() => props.enabled && !props.isTencent && hasKey.value)
const masked = computed(() => maskApiKey(props.apiKey))

const draftValidation = computed(() => {
  const key = draft.value.trim() || props.apiKey?.trim() || ''
  if (!key || props.isTencent) return { valid: true as const }
  return validateApiKey(key, props.provider ?? 'custom')
})

const canEnable = computed(() => draftValidation.value.valid && !!(draft.value.trim() || props.apiKey?.trim()))

const formatHint = computed(() =>
  props.isTencent ? '' : getApiKeyFormatHint(props.provider ?? 'custom'),
)

function onDraftInput() {
  const key = draft.value.trim()
  if (!key) {
    validationError.value = ''
    return
  }
  const result = validateApiKey(key, props.provider ?? 'custom')
  if (result.valid) {
    validationError.value = ''
    emit('save', key)
  } else {
    validationError.value = result.message ?? '格式不正确'
  }
}

function enableKey() {
  const key = draft.value.trim() || props.apiKey?.trim()
  if (!key && !props.isTencent) return

  const result = validateApiKey(key, props.provider ?? 'custom')
  if (!result.valid) {
    validationError.value = result.message ?? '格式不正确'
    return
  }

  validationError.value = ''
  if (key !== props.apiKey) emit('save', key)
  emit('enable')
  draft.value = ''
}

function cancelKey() {
  draft.value = ''
  validationError.value = ''
  emit('cancel')
}

function disableKey() {
  draft.value = ''
  validationError.value = ''
  emit('disable')
}
</script>

<template>
  <div class="secure-key">
    <span class="label">API Key</span>

    <template v-if="isTencent">
      <p class="hint">使用服务器环境变量中的腾讯云密钥。</p>
      <div class="actions">
        <button v-if="!enabled" type="button" class="btn enable" @click="emit('enable')">启用</button>
        <button v-else type="button" class="btn ghost" @click="disableKey">停用</button>
      </div>
    </template>

    <template v-else-if="showEditor">
      <input
        v-model="draft"
        type="password"
        class="key-input"
        :class="{ invalid: validationError }"
        placeholder="粘贴 API Key"
        autocomplete="off"
        spellcheck="false"
        @input="onDraftInput"
        @keydown.enter="enableKey"
      />
      <p v-if="validationError" class="error">{{ validationError }}</p>
      <p v-else class="hint">{{ formatHint }}。粘贴后点击「启用」。</p>
      <div class="actions">
        <button type="button" class="btn enable" :disabled="!canEnable" @click="enableKey">
          启用
        </button>
        <button type="button" class="btn ghost" @click="cancelKey">取消</button>
      </div>
    </template>

    <template v-else-if="showPending">
      <input
        readonly
        :value="masked"
        class="key-input is-pending"
        tabindex="-1"
        @copy="preventCopy"
        @cut="preventCopy"
        @contextmenu.prevent
      />
      <div class="actions">
        <button type="button" class="btn enable" @click="enableKey">启用</button>
        <button type="button" class="btn ghost" @click="cancelKey">取消</button>
      </div>
    </template>

    <template v-else-if="showLocked">
      <input
        readonly
        :value="masked"
        class="key-input is-locked"
        tabindex="-1"
        @copy="preventCopy"
        @cut="preventCopy"
        @contextmenu.prevent
      />
      <p class="hint">停用后需重新粘贴 API Key 配置。</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="disableKey">停用</button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.secure-key {
  margin-bottom: 16px;
}

.label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.key-input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  font-family: ui-monospace, monospace;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }

  &.invalid {
    border-color: $color-danger;
    box-shadow: $shadow-focus-danger;
  }

  &.is-pending,
  &.is-locked {
    background: $input-muted-bg;
    color: $input-muted-text;
    border-color: $input-muted-border;
    cursor: not-allowed;
    box-shadow: none;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  }

  &.is-locked {
    opacity: 0.92;
  }
}

.hint {
  font-size: 11px;
  color: $text-muted;
  margin-top: 8px;
  line-height: 1.4;
}

.error {
  font-size: 11px;
  color: $color-danger;
  margin-top: 8px;
  line-height: 1.4;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
