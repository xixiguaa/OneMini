<script setup lang="ts">
import {
  Camera,
  Database,
  FileText,
  Mail,
  Monitor,
  Moon,
  Pencil,
  Settings,
  Smartphone,
  Sun,
  User,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLocale } from '../composables/useLocale'
import { useAuthStore } from '../stores/auth'
import {
  creatorAvatarInitial,
  creatorDisplayName,
  useCreatorProfileStore,
} from '../stores/creatorProfile'
import { useConversationsStore } from '../stores/conversations'
import { useToastStore } from '../stores/toast'
import { useUiPrefsStore } from '../stores/uiPrefs'
import { APP_VERSION } from '../types/agent'
import { maskAccountLabel } from '../utils/maskAccount'
import { BRAND_NAME } from '../utils/modelLogo'
import ConfirmDialog from './ConfirmDialog.vue'
import GlassSelect from './GlassSelect.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

type TabId = 'general' | 'account' | 'data' | 'legal'

const auth = useAuthStore()
const creatorProfile = useCreatorProfileStore()
const ui = useUiPrefsStore()
const avatarFileInput = ref<HTMLInputElement | null>(null)
const nicknameInputRef = ref<HTMLInputElement | null>(null)
const conversations = useConversationsStore()
const toast = useToastStore()
const { t } = useLocale()

const activeTab = ref<TabId>('general')
const nicknameEditing = ref(false)
const nicknameDraft = ref('')
const deleteAllOpen = ref(false)
const deletingAll = ref(false)
const exporting = ref(false)

const tabs = computed(() => [
  { id: 'general' as const, label: t('settings.general'), icon: Settings },
  { id: 'account' as const, label: t('settings.account'), icon: User },
  { id: 'data' as const, label: t('settings.data'), icon: Database },
  { id: 'legal' as const, label: t('settings.legal'), icon: FileText },
])

const maskedEmail = computed(() => maskAccountLabel(auth.user))

const creatorPreviewName = computed(() =>
  creatorDisplayName(auth.user, creatorProfile.prefs),
)
const creatorPreviewInitial = computed(() =>
  creatorAvatarInitial(auth.user, creatorProfile.prefs),
)

const AVATAR_MAX_BYTES = 512 * 1024

function startNicknameEdit() {
  nicknameDraft.value = creatorProfile.prefs.nickname
  nicknameEditing.value = true
  nextTick(() => {
    nicknameInputRef.value?.focus()
    nicknameInputRef.value?.select()
  })
}

function commitNicknameEdit() {
  if (!nicknameEditing.value) return
  const next = nicknameDraft.value.trim()
  if (next !== creatorProfile.prefs.nickname) {
    creatorProfile.setNickname(next)
    if (auth.user?.id) creatorProfile.syncPublicProfile(auth.user.id)
    toast.showSuccess(t('settings.creatorSaved'))
  }
  nicknameEditing.value = false
}

function onNicknameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitNicknameEdit()
  } else if (e.key === 'Escape') {
    nicknameEditing.value = false
  }
}

function triggerAvatarPick() {
  avatarFileInput.value?.click()
}

async function onAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (avatarFileInput.value) avatarFileInput.value.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.showError(t('settings.creatorAvatarInvalid'))
    return
  }
  if (file.size > AVATAR_MAX_BYTES) {
    toast.showError(t('settings.creatorAvatarTooLarge'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result
    if (typeof result === 'string') {
      creatorProfile.setAvatarUrl(result)
      if (auth.user?.id) creatorProfile.syncPublicProfile(auth.user.id)
      toast.showSuccess(t('settings.creatorSaved'))
    }
  }
  reader.onerror = () => toast.showError(t('settings.creatorAvatarInvalid'))
  reader.readAsDataURL(file)
}

const hasPhone = computed(() => {
  const phone = auth.user?.phone?.replace(/\D/g, '') ?? ''
  return phone.length > 0
})

const maskedPhoneValue = computed(() => {
  const phone = auth.user?.phone?.replace(/\D/g, '') ?? ''
  if (!phone) return ''
  if (phone.length >= 7) return `${phone.slice(0, 3)}****${phone.slice(-4)}`
  return phone
})

watch(
  () => props.open,
  (visible) => {
    document.body.style.overflow = visible ? 'hidden' : ''
    if (visible) {
      activeTab.value = 'general'
      nicknameEditing.value = false
    }
  },
)

function close() {
  emit('update:open', false)
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (props.open) document.body.style.overflow = ''
})

function setTheme(mode: 'light' | 'dark' | 'system') {
  ui.setTheme(mode)
}

async function exportConversations() {
  if (exporting.value) return
  exporting.value = true
  try {
    await conversations.hydrate()
    const payload = {
      exportedAt: new Date().toISOString(),
      user: auth.user,
      conversations: conversations.list,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `onemini-conversations-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.showSuccess(t('settings.exportDone'))
  } catch {
    toast.showError(t('settings.exportFailed'))
  } finally {
    exporting.value = false
  }
}

async function confirmDeleteAll() {
  if (deletingAll.value) return
  deletingAll.value = true
  try {
    await conversations.hydrate()
    const ids = [...conversations.list.map((c) => c.id)]
    for (const id of ids) {
      await conversations.deleteConversation(id)
    }
    toast.showSuccess(t('settings.deleteAllDone'))
    deleteAllOpen.value = false
  } catch {
    toast.showError(t('settings.deleteAllFailed'))
  } finally {
    deletingAll.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-fade">
      <div
        v-if="open"
        class="settings-overlay"
        role="presentation"
        @click.self="close"
      >
        <div class="settings-dialog" role="dialog" aria-modal="true" :aria-label="t('settings.title')">
          <header class="settings-header">
            <h2>{{ t('settings.title') }}</h2>
            <button type="button" class="close-btn" :aria-label="t('settings.close')" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="settings-body">
            <nav class="settings-nav">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                class="settings-nav-item"
                :class="{ active: activeTab === tab.id }"
                @click="activeTab = tab.id"
              >
                <component :is="tab.icon" :size="16" />
                <span>{{ tab.label }}</span>
              </button>
            </nav>

            <div class="settings-panel">
              <template v-if="activeTab === 'general'">
                <section class="settings-section">
                  <h3>{{ t('settings.theme') }}</h3>
                  <div class="theme-grid">
                    <button
                      type="button"
                      class="theme-card theme-card--light"
                      :class="{ active: ui.theme === 'light' }"
                      @click="setTheme('light')"
                    >
                      <Sun :size="22" />
                      <span>{{ t('settings.themeLight') }}</span>
                    </button>
                    <button
                      type="button"
                      class="theme-card theme-card--dark"
                      :class="{ active: ui.theme === 'dark' }"
                      @click="setTheme('dark')"
                    >
                      <Moon :size="22" />
                      <span>{{ t('settings.themeDark') }}</span>
                    </button>
                    <button
                      type="button"
                      class="theme-card theme-card--system"
                      :class="{ active: ui.theme === 'system' }"
                      @click="setTheme('system')"
                    >
                      <Monitor :size="22" />
                      <span>{{ t('settings.themeSystem') }}</span>
                    </button>
                  </div>
                </section>

                <section class="settings-section">
                  <div class="settings-row">
                    <div>
                      <h3>{{ t('settings.language') }}</h3>
                    </div>
                    <GlassSelect
                      class="settings-select"
                      :model-value="ui.locale"
                      :options="[
                        { value: 'zh', label: t('footer.langZh') },
                        { value: 'en', label: t('footer.langEn') },
                      ]"
                      :aria-label="t('settings.language')"
                      menu-align="right"
                      @update:model-value="ui.setLocale($event as 'zh' | 'en')"
                    />
                  </div>
                </section>
              </template>

              <template v-else-if="activeTab === 'account'">
                <div class="account-panel">
                  <section class="account-hero">
                    <button
                      type="button"
                      class="creator-avatar-btn"
                      :aria-label="t('settings.creatorAvatarUpload')"
                      @click="triggerAvatarPick"
                    >
                      <span class="creator-profile-avatar" aria-hidden="true">
                        <img
                          v-if="creatorProfile.prefs.avatarUrl"
                          :src="creatorProfile.prefs.avatarUrl"
                          alt=""
                        />
                        <span v-else class="creator-profile-avatar-fallback">{{
                          creatorPreviewInitial
                        }}</span>
                      </span>
                      <span class="creator-avatar-overlay" aria-hidden="true">
                        <Camera :size="20" />
                      </span>
                    </button>
                    <div class="account-hero-meta">
                      <div class="creator-name-wrap">
                        <input
                          v-if="nicknameEditing"
                          ref="nicknameInputRef"
                          v-model="nicknameDraft"
                          type="text"
                          class="creator-name-input"
                          :placeholder="t('settings.creatorNicknamePlaceholder')"
                          maxlength="24"
                          @blur="commitNicknameEdit"
                          @keydown="onNicknameKeydown"
                        />
                        <button
                          v-else
                          type="button"
                          class="creator-name-btn"
                          :aria-label="t('settings.creatorNickname')"
                          @click="startNicknameEdit"
                        >
                          <span class="creator-name-text">{{ creatorPreviewName }}</span>
                          <Pencil :size="14" class="creator-name-edit-icon" aria-hidden="true" />
                        </button>
                      </div>
                      <p class="account-hero-desc">{{ t('settings.creatorProfileDesc') }}</p>
                    </div>
                    <input
                      ref="avatarFileInput"
                      type="file"
                      accept="image/*"
                      hidden
                      @change="onAvatarFile"
                    />
                  </section>

                  <section class="account-contact">
                    <div class="contact-row">
                      <div class="contact-label">
                        <Mail :size="16" aria-hidden="true" />
                        <span>{{ t('settings.email') }}</span>
                      </div>
                      <span class="contact-value">{{ maskedEmail }}</span>
                    </div>
                    <div class="contact-row">
                      <div class="contact-label">
                        <Smartphone :size="16" aria-hidden="true" />
                        <span>{{ t('settings.phone') }}</span>
                      </div>
                      <span v-if="hasPhone" class="contact-value">{{ maskedPhoneValue }}</span>
                      <span v-else class="contact-badge">{{ t('settings.notBound') }}</span>
                    </div>
                  </section>

                  <p class="settings-note settings-note--center">{{ BRAND_NAME }} · {{ APP_VERSION }}</p>
                </div>
              </template>

              <template v-else-if="activeTab === 'data'">
                <div class="settings-row">
                  <div class="row-main">
                    <span class="row-label">{{ t('settings.exportAll') }}</span>
                    <p class="row-desc">{{ t('settings.exportAllDesc') }}</p>
                  </div>
                  <button
                    type="button"
                    class="row-action"
                    :disabled="exporting"
                    @click="exportConversations"
                  >
                    {{ exporting ? t('settings.exporting') : t('settings.export') }}
                  </button>
                </div>
                <div class="settings-row">
                  <div class="row-main">
                    <span class="row-label">{{ t('settings.deleteAll') }}</span>
                  </div>
                  <button type="button" class="row-action row-action--danger" @click="deleteAllOpen = true">
                    {{ t('settings.delete') }}
                  </button>
                </div>
              </template>

              <template v-else>
                <div class="settings-row">
                  <span class="row-label">{{ t('settings.userAgreement') }}</span>
                  <button type="button" class="row-action" disabled>{{ t('settings.view') }}</button>
                </div>
                <div class="settings-row">
                  <span class="row-label">{{ t('settings.privacyPolicy') }}</span>
                  <button type="button" class="row-action row-action--ghost" disabled>
                    {{ t('settings.view') }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    v-model:open="deleteAllOpen"
    :title="t('settings.deleteAllConfirmTitle')"
    :message="t('settings.deleteAllConfirmMsg')"
    :confirm-label="t('settings.delete')"
    :cancel-label="t('settings.cancel')"
    danger
    :loading="deletingAll"
    @confirm="confirmDeleteAll"
  />
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as *;

.settings-overlay {
  @include cosmic-modal-overlay(10050);
}

.settings-dialog {
  @include cosmic-modal-panel-wide(720px);
  max-height: min(560px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid $glass-border;

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: $text-primary;
  }
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: $text-muted;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }
}

.settings-body {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  min-height: 360px;
}

.settings-nav {
  padding: 12px 10px;
  border-right: 1px solid $glass-border;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  color: $text-secondary;
  text-align: left;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    background: $bg-input;
    color: $text-primary;
    font-weight: 500;
  }
}

.settings-panel {
  padding: 18px 22px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-section + .settings-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid $glass-border;
}

.settings-section h3 {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 92px;
  padding: 14px 10px;
  border-radius: 12px;
  border: 1px solid $glass-border;
  background: $bg-input;
  font-size: 13px;
  font-weight: 500;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  svg {
    flex-shrink: 0;
  }

  &--light {
    background:
      radial-gradient(ellipse 80% 60% at 30% 20%, rgba(150, 120, 255, 0.15), transparent),
      linear-gradient(145deg, #e8e4f5, #eeeaf8);
    border-color: rgba(124, 95, 232, 0.22);
    color: #2d1e6b;

    &:hover:not(.disabled) {
      border-color: #7c5fe8;
    }

    &.active {
      border-color: #7c5fe8;
      box-shadow: 0 0 0 2px rgba(124, 95, 232, 0.28);
      color: #1f1450;
    }
  }

  &--dark {
    background:
      radial-gradient(1px 1px at 20% 30%, #d8d0ff, transparent),
      radial-gradient(1px 1px at 70% 60%, #faf8ff, transparent),
      radial-gradient(ellipse 80% 50% at 50% 100%, rgba(80, 50, 220, 0.2), transparent),
      linear-gradient(145deg, #060412, #0d0822);
    border-color: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.92);

    &:hover:not(.disabled) {
      border-color: rgba(124, 95, 232, 0.55);
    }

    &.active {
      border-color: #7c5fe8;
      box-shadow: 0 0 0 2px rgba(124, 95, 232, 0.35);
      color: #ffffff;
    }
  }

  &--system {
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse 90% 70% at 50% 30%, rgba(124, 95, 232, 0.16), transparent 65%),
      linear-gradient(160deg, rgba(245, 242, 255, 0.96) 0%, rgba(228, 220, 252, 0.92) 100%);
    border-color: rgba(124, 95, 232, 0.28);
    color: #2d1e6b;

    &::before,
    &::after {
      content: '';
      position: absolute;
      border-radius: 50%;
      pointer-events: none;
    }

    /* 装饰：小太阳 */
    &::before {
      top: 18px;
      left: 22%;
      width: 16px;
      height: 16px;
      background: radial-gradient(circle at 35% 35%, #fff9e8, #fbbf24);
      box-shadow: 0 0 10px rgba(251, 191, 36, 0.35);
      opacity: 0.85;
    }

    /* 装饰：小月亮 */
    &::after {
      top: 20px;
      right: 22%;
      width: 14px;
      height: 14px;
      background: radial-gradient(circle at 38% 38%, #faf8ff, #c8c0e8);
      box-shadow: inset -3px -2px 0 rgba(6, 4, 18, 0.28);
      opacity: 0.9;
    }

    svg {
      position: relative;
      z-index: 1;
      filter: drop-shadow(0 1px 2px rgba(124, 95, 232, 0.12));
    }

    span {
      position: relative;
      z-index: 1;
    }

    &:hover:not(.disabled) {
      border-color: #7c5fe8;
    }

    &.active {
      border-color: #7c5fe8;
      box-shadow: 0 0 0 2px rgba(124, 95, 232, 0.28);
      color: #1f1450;
    }
  }
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid $glass-border;

  &:last-child {
    border-bottom: none;
  }
}

.row-main {
  min-width: 0;
}

.row-label {
  font-size: 14px;
  color: $text-primary;
}

.row-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: $text-muted;
}

.row-value {
  font-size: 14px;
  color: $text-secondary;
}

.settings-select {
  min-width: 140px;
  width: auto;
}

.row-action {
  flex-shrink: 0;
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid $glass-border;
  background: $bg-input;
  font-size: 13px;
  color: $text-primary;

  &:hover:not(:disabled) {
    border-color: $accent;
    color: $accent;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--danger {
    color: #e03131;
    border-color: rgba(224, 49, 49, 0.35);

    &:hover:not(:disabled) {
      background: rgba(224, 49, 49, 0.08);
      border-color: rgba(224, 49, 49, 0.5);
      color: #e03131;
    }
  }

  &--ghost {
    color: $text-secondary;
  }
}

.account-panel {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  gap: 20px;
}

.account-hero {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 6px 0 4px;
}

.account-hero-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding-top: 6px;
}

.account-hero-desc {
  margin: 0;
  max-width: 340px;
  font-size: 12px;
  line-height: 1.55;
  color: $text-muted;
}

.creator-avatar-btn {
  position: relative;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  cursor: pointer;

  &:hover .creator-avatar-overlay,
  &:focus-visible .creator-avatar-overlay {
    opacity: 1;
  }
}

.creator-profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $accent-light;
  border: 1px solid $glass-border;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.creator-profile-avatar-fallback {
  font-size: 28px;
  font-weight: 700;
  color: $accent;
}

.creator-avatar-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.creator-name-wrap {
  min-width: 0;
}

.creator-name-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border: none;
  background: none;
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  cursor: pointer;
  max-width: 100%;

  &:hover .creator-name-text,
  &:focus-visible .creator-name-text {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  &:hover .creator-name-edit-icon,
  &:focus-visible .creator-name-edit-icon {
    opacity: 1;
  }
}

.creator-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.creator-name-edit-icon {
  flex-shrink: 0;
  color: $text-muted;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.creator-name-input {
  width: 100%;
  max-width: 260px;
  padding: 2px 0;
  border: none;
  border-bottom: 1px solid $accent;
  background: transparent;
  color: $text-primary;
  font-size: 18px;
  font-weight: 600;

  &::placeholder {
    color: $text-muted;
    font-weight: 400;
  }

  &:focus {
    outline: none;
  }
}

.account-contact {
  padding: 4px 16px;
  border-radius: 12px;
  border: 1px solid $glass-border;
  background: $bg-input;
}

.contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;

  & + & {
    border-top: 1px solid $glass-border;
  }
}

.contact-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: $text-primary;

  svg {
    flex-shrink: 0;
    color: $text-muted;
  }
}

.contact-value {
  font-size: 13px;
  color: $text-secondary;
  text-align: right;
}

.contact-badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(80, 60, 10, 0.92);
  background: rgba(220, 170, 50, 0.55);
}

.settings-note {
  margin-top: auto;
  padding-top: 8px;
  font-size: 12px;
  color: $text-muted;

  &--center {
    text-align: center;
  }
}

@include cosmic-modal-fade-transition('settings-fade', '.settings-dialog');
</style>
