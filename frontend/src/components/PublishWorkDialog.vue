<script setup lang="ts">
import { Loader2, X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

const TITLE_MAX = 20
const DESC_MAX = 500

const props = withDefaults(
  defineProps<{
    open: boolean
    imageUrl?: string
    prompt?: string
    isVideo?: boolean
    aspectRatio?: string
    publishing?: boolean
  }>(),
  {
    imageUrl: '',
    prompt: '',
    isVideo: false,
    aspectRatio: '1 / 1',
    publishing: false,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [payload: { title: string; description: string }]
}>()

const title = ref('')
const description = ref('')

const titleCount = computed(() => title.value.length)
const descCount = computed(() => description.value.length)
const canSubmit = computed(() => title.value.trim().length > 0 && !props.publishing)

const promptLabel = computed(() => (props.isVideo ? '视频提示词' : '图片提示词'))

function close() {
  if (props.publishing) return
  emit('update:open', false)
}

function onSubmit() {
  if (!canSubmit.value) return
  emit('submit', {
    title: title.value.trim(),
    description: description.value.trim(),
  })
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
}

watch(
  () => props.open,
  (visible) => {
    if (!visible) return
    title.value = ''
    description.value = ''
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="publish-work-fade">
      <div v-if="open" class="publish-work-overlay" role="presentation" @click.self="close">
        <div class="publish-work-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-work-title">
          <header class="publish-work-head">
            <h2 id="publish-work-title" class="publish-work-title">发布作品</h2>
            <button type="button" class="publish-work-close" title="关闭" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="publish-work-body">
            <section class="publish-work-preview-col">
              <p class="publish-work-label">预览</p>
              <div class="publish-work-preview" :style="{ aspectRatio }">
                <video
                  v-if="isVideo && imageUrl"
                  :src="imageUrl"
                  class="publish-work-media"
                  muted
                  playsinline
                  preload="metadata"
                />
                <img v-else-if="imageUrl" :src="imageUrl" alt="" class="publish-work-media" />
                <div v-else class="publish-work-preview-empty" />
              </div>
            </section>

            <section class="publish-work-form-col">
              <label class="publish-work-field">
                <span class="publish-work-label">标题 <span class="publish-work-required">*</span></span>
                <div class="publish-work-input-wrap">
                  <input
                    v-model="title"
                    type="text"
                    class="publish-work-input"
                    placeholder="给作品起个标题吧"
                    :maxlength="TITLE_MAX"
                    :disabled="publishing"
                  />
                  <span class="publish-work-counter">{{ titleCount }}/{{ TITLE_MAX }}</span>
                </div>
              </label>

              <label class="publish-work-field">
                <span class="publish-work-label">作品描述</span>
                <div class="publish-work-input-wrap publish-work-input-wrap--area">
                  <textarea
                    v-model="description"
                    class="publish-work-textarea"
                    placeholder="聊聊你的作品灵感吧"
                    :maxlength="DESC_MAX"
                    rows="4"
                    :disabled="publishing"
                  />
                  <span class="publish-work-counter">{{ descCount }}/{{ DESC_MAX }}</span>
                </div>
              </label>

              <div class="publish-work-field publish-work-field--readonly">
                <span class="publish-work-label">{{ promptLabel }}</span>
                <p class="publish-work-prompt">{{ prompt || '暂无提示词' }}</p>
              </div>
            </section>
          </div>

          <footer class="publish-work-foot">
            <button
              type="button"
              class="publish-work-submit"
              :disabled="!canSubmit"
              @click="onSubmit"
            >
              <Loader2 v-if="publishing" :size="16" class="om-loading-spinner" />
              <span>{{ publishing ? '发布中…' : '发布' }}</span>
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.publish-work-overlay {
  @include cosmic.cosmic-modal-overlay(280);
}

.publish-work-dialog {
  @include cosmic.cosmic-modal-panel-wide(860px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 16px;
  width: min(860px, calc(100vw - 40px));
  max-height: min(90vh, 720px);
}

.publish-work-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.publish-work-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

.publish-work-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  color: $text-muted;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--composer-option-hover, $accent-light);
    color: $text-primary;
  }
}

.publish-work-body {
  display: grid;
  grid-template-columns: minmax(0, 280px) minmax(0, 1fr);
  gap: 20px;
  min-height: 0;
}

.publish-work-preview-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.publish-work-preview {
  flex: 1;
  min-height: 280px;
  border-radius: var(--glass-radius-sm, 14px);
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid $border-light;
}

.publish-work-media {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.publish-work-preview-empty {
  width: 100%;
  height: 100%;
  min-height: 280px;
  background: color-mix(in srgb, var(--bg-elevated) 80%, $text-muted 5%);
}

.publish-work-form-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.publish-work-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  &--readonly {
    flex: 1;
    min-height: 0;
  }
}

.publish-work-label {
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
}

.publish-work-required {
  color: $color-danger;
}

.publish-work-input-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
}

.publish-work-input,
.publish-work-textarea {
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1px solid $border-light;
  background: var(--bg-elevated);
  color: $text-primary;
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    outline: none;
    border-color: color-mix(in srgb, $accent 45%, $border-light);
    box-shadow: $shadow-focus;
  }

  &:disabled {
    opacity: 0.65;
  }
}

.publish-work-input {
  height: 44px;
  padding: 0 52px 0 14px;
}

.publish-work-textarea {
  min-height: 108px;
  padding: 12px 52px 12px 14px;
  resize: vertical;
  line-height: 1.55;
}

.publish-work-input-wrap--area .publish-work-counter {
  top: auto;
  bottom: 10px;
}

.publish-work-counter {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
  pointer-events: none;
}

.publish-work-prompt {
  margin: 0;
  flex: 1;
  min-height: 96px;
  max-height: 180px;
  overflow-y: auto;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid $border-light;
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  font-size: 13px;
  line-height: 1.6;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
  scrollbar-width: thin;
}

.publish-work-foot {
  display: flex;
  justify-content: flex-end;
}

.publish-work-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 96px;
  height: 40px;
  padding: 0 22px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: var(--btn-primary-text);
  background: var(--btn-primary-gradient);
  box-shadow: var(--btn-primary-shadow);
  transition: opacity 0.15s, transform 0.15s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    box-shadow: none;
  }
}

.publish-work-fade-enter-active,
.publish-work-fade-leave-active {
  transition: opacity 0.2s ease;

  .publish-work-dialog {
    transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
  }
}

.publish-work-fade-enter-from,
.publish-work-fade-leave-to {
  opacity: 0;

  .publish-work-dialog {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}

@media (max-width: 720px) {
  .publish-work-body {
    grid-template-columns: 1fr;
  }

  .publish-work-preview {
    min-height: 220px;
  }
}
</style>
