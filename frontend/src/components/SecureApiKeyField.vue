<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import type { ModelProvider } from '../types/agent'
import {
  getApiKeyFormatHint,
  preventCopy,
  validateApiKey,
} from '../utils/apiKey'
import ConfirmDialog from './ConfirmDialog.vue'
import LoadingIndicator from './LoadingIndicator.vue'

const props = defineProps<{
  /** 服务端是否已保存密钥 */
  configured: boolean
  /** 服务端返回的掩码 */
  hint?: string
  enabled: boolean
  provider?: ModelProvider
  isTencent?: boolean
}>()

const emit = defineEmits<{
  /** 保存到服务端后可选择立即启用 */
  configure: [payload: { apiKey?: string; enable: boolean }]
  cancel: []
  disable: []
}>()

const draft = ref('')
const validationError = ref('')
const saving = ref(false)
const isReplacing = ref(false)
const pendingKeyAction = ref<'revoke' | 'disable' | null>(null)

const {
  open: confirmOpen,
  title: confirmTitle,
  message: confirmMessage,
  confirmLabel: confirmConfirmLabel,
  cancelLabel: confirmCancelLabel,
  danger: confirmDanger,
  confirm: showConfirm,
  onConfirm: onConfirmOk,
  onCancel: onConfirmCancel,
  onOpenUpdate: onConfirmOpenUpdate,
} = useConfirmDialog()

const hasKey = computed(() => props.configured)
/** 未配置密钥，或正在更换密钥 */
const showEditor = computed(() => !props.isTencent && (!hasKey.value || isReplacing.value))
const showPending = computed(
  () => !props.isTencent && hasKey.value && !props.enabled && !isReplacing.value,
)
const showLocked = computed(
  () => !props.isTencent && hasKey.value && props.enabled && !isReplacing.value,
)
const needsKeyWarning = computed(() => props.enabled && !hasKey.value && !props.isTencent)
const masked = computed(() => props.hint?.trim() || '••••••••')

const draftValidation = computed(() => {
  const key = draft.value.trim()
  if (!key || props.isTencent) return { valid: true as const }
  return validateApiKey(key, props.provider ?? 'custom')
})

const canEnable = computed(
  () =>
    draftValidation.value.valid &&
    (!!draft.value.trim() || hasKey.value),
)

const formatHint = computed(() =>
  props.isTencent ? '' : getApiKeyFormatHint(props.provider ?? 'custom'),
)

const saveButtonLabel = computed(() => {
  if (isReplacing.value) return '保存新密钥'
  if (hasKey.value && !props.enabled) return '启用'
  if (needsKeyWarning.value) return '保存密钥'
  return '保存并启用'
})

function onDraftInput() {
  const key = draft.value.trim()
  if (!key) {
    validationError.value = ''
    return
  }
  const result = validateApiKey(key, props.provider ?? 'custom')
  validationError.value = result.valid ? '' : (result.message ?? '格式不正确')
}

async function enableKey() {
  const key = draft.value.trim()
  if (!key && !hasKey.value && !props.isTencent) return

  if (key) {
    const result = validateApiKey(key, props.provider ?? 'custom')
    if (!result.valid) {
      validationError.value = result.message ?? '格式不正确'
      return
    }
  }

  validationError.value = ''
  saving.value = true
  try {
    emit('configure', {
      apiKey: key || undefined,
      enable: !props.enabled || !hasKey.value || isReplacing.value,
    })
    draft.value = ''
    isReplacing.value = false
  } finally {
    saving.value = false
  }
}

function cancelKey() {
  draft.value = ''
  validationError.value = ''
  emit('cancel')
}

function cancelEditor() {
  draft.value = ''
  validationError.value = ''
  isReplacing.value = false
}

function startReplaceKey() {
  isReplacing.value = true
  draft.value = ''
  validationError.value = ''
}

function disableKey() {
  draft.value = ''
  validationError.value = ''
  emit('disable')
}

function requestRevokeKey() {
  pendingKeyAction.value = 'revoke'
  void showConfirm({
    title: '撤销密钥',
    message: '确定撤销已保存的 API Key？\n\n服务端密钥将被删除，需重新粘贴配置。',
    confirmLabel: '撤销',
    danger: true,
  })
}

function requestDisableKey() {
  pendingKeyAction.value = 'disable'
  void showConfirm({
    title: '停用模型',
    message: props.isTencent
      ? '确定停用此模型？'
      : '确定停用此模型？\n\n服务端 API Key 将被删除，需重新粘贴配置。',
    confirmLabel: '停用',
    danger: true,
  })
}

function onKeyActionConfirm() {
  const action = pendingKeyAction.value
  pendingKeyAction.value = null
  if (action === 'revoke') cancelKey()
  else if (action === 'disable') disableKey()
  onConfirmOk()
}

function onKeyActionCancel() {
  pendingKeyAction.value = null
  onConfirmCancel()
}
</script>

<template>
  <div class="secure-key">
    <span class="label">API Key</span>
    <p v-if="!isTencent" class="vault-hint">密钥仅保存于服务端加密保险库，不会写入浏览器本地存储。</p>

    <p v-if="needsKeyWarning" class="warn-hint">模型已启用但尚未配置密钥，对话与知识图谱构建将无法调用 LLM。</p>

    <template v-if="isTencent">
      <p class="hint">使用服务器环境变量中的腾讯云密钥。</p>
      <div class="actions">
        <button v-if="!enabled" type="button" class="btn enable" @click="enableKey">启用</button>
        <button v-else type="button" class="btn ghost" @click="requestDisableKey">停用</button>
      </div>
    </template>

    <template v-else-if="showEditor">
      <input
        v-model="draft"
        type="password"
        class="key-input"
        :class="{ invalid: validationError }"
        placeholder="粘贴 API Key（仅提交到服务端）"
        autocomplete="off"
        spellcheck="false"
        @input="onDraftInput"
        @keydown.enter="enableKey"
      />
      <p v-if="validationError" class="error">{{ validationError }}</p>
      <p v-else-if="isReplacing" class="hint">粘贴新密钥后将覆盖服务端已保存的旧密钥。</p>
      <p v-else class="hint">{{ formatHint }}。点击「{{ saveButtonLabel }}」后明文不会留在本页。</p>
      <div class="actions">
        <button type="button" class="btn enable" :disabled="!canEnable || saving" @click="enableKey">
          <LoadingIndicator v-if="saving" label="保存中…" variant="button" :size="13" />
          <template v-else>{{ saveButtonLabel }}</template>
        </button>
        <button type="button" class="btn ghost" @click="cancelEditor">
          {{ isReplacing ? '取消更换' : '取消' }}
        </button>
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
        <button type="button" class="btn ghost" @click="requestRevokeKey">撤销密钥</button>
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
      <p class="hint">停用后将删除服务端密钥，需重新粘贴配置。</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="startReplaceKey">更换密钥</button>
        <button type="button" class="btn ghost" @click="requestDisableKey">停用</button>
      </div>
    </template>

    <ConfirmDialog
      :open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="confirmConfirmLabel"
      :cancel-label="confirmCancelLabel"
      :danger="confirmDanger"
      @update:open="onConfirmOpenUpdate"
      @confirm="onKeyActionConfirm"
      @cancel="onKeyActionCancel"
    />
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

.vault-hint {
  font-size: 11px;
  color: $accent;
  margin-bottom: 10px;
  line-height: 1.4;
}

.warn-hint {
  font-size: 12px;
  color: $color-danger;
  margin-bottom: 10px;
  line-height: 1.45;
  padding: 8px 10px;
  border-radius: 8px;
  background: $color-danger-soft;
  border: 1px solid color-mix(in srgb, $color-danger 22%, transparent);
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
