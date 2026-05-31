<script setup lang="ts">
import { Eye, EyeOff, Loader2, Lock, Mail, Moon, MoreHorizontal, Smartphone, Sun } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  detectLoginInteractions,
  provideLoginPointer,
} from '../composables/useLoginPointer'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'
import { useUiPrefsStore } from '../stores/uiPrefs'
import LoginCustomCursor from './LoginCustomCursor.vue'
import LoginNightSky from './LoginNightSky.vue'
import { BRAND_NAME } from '../utils/modelLogo'
import {
  parseRegisterPayload,
  validatePasswordConfirm,
  validateRegisterIdentifier,
} from '../utils/authValidation'

const auth = useAuthStore()
const toast = useToastStore()
const ui = useUiPrefsStore()
const skyTheme = computed(() => ui.resolvedTheme)

const interactionsEnabled = ref(detectLoginInteractions())
const pointer = provideLoginPointer(interactionsEnabled, skyTheme)

const mode = ref<'login' | 'register'>('login')
const showPassword = ref(false)

const loginForm = ref({ identifier: '', password: '' })
const registerForm = ref({ identifier: '', password: '', confirmPassword: '' })
const honeypot = ref('')

const smoothNx = ref(0)
const smoothNy = ref(0)
let tiltRafId = 0

const isLight = computed(() => skyTheme.value === 'light')

function onPointerMove(e: PointerEvent) {
  if (!interactionsEnabled.value) return
  pointer.nx.value = (e.clientX / window.innerWidth) * 2 - 1
  pointer.ny.value = (e.clientY / window.innerHeight) * 2 - 1
}

function tickTilt() {
  smoothNx.value += (pointer.nx.value - smoothNx.value) * 0.08
  smoothNy.value += (pointer.ny.value - smoothNy.value) * 0.08
  tiltRafId = requestAnimationFrame(tickTilt)
}

onMounted(() => {
  if (!interactionsEnabled.value) return
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  tiltRafId = requestAnimationFrame(tickTilt)
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  cancelAnimationFrame(tiltRafId)
})

const cardTiltStyle = computed(() => {
  if (!interactionsEnabled.value) return undefined
  const tiltX = smoothNy.value * -5.5
  const tiltY = smoothNx.value * 5.5
  const highlightX = 50 + smoothNx.value * 22
  const highlightY = isLight.value ? 22 + smoothNy.value * 16 : 28 + smoothNy.value * 18
  return {
    transform: `perspective(920px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
    '--highlight-x': `${highlightX}%`,
    '--highlight-y': `${highlightY}%`,
  }
})

function toggleTheme() {
  ui.toggleTheme()
}

function onCardEnter() {
  pointer.isOverCard.value = true
}

function onCardLeave() {
  pointer.isOverCard.value = false
}

watch([mode, loginForm, registerForm], () => {
  if (auth.error) auth.error = null
  showPassword.value = false
}, { deep: true })

const canSubmit = computed(() => {
  if (auth.loading) return false
  if (mode.value === 'login') {
    const { identifier, password } = loginForm.value
    return identifier.trim().length > 0 && password.length > 0
  }
  const { identifier, password, confirmPassword } = registerForm.value
  return identifier.trim().length > 0 && password.length > 0 && confirmPassword.length > 0
})

function validateForm(): string | null {
  if (mode.value === 'login') {
    const { identifier, password } = loginForm.value
    const id = identifier.trim()
    if (!id) return '请输入邮箱或手机号'
    if (id.length < 3) return '账号至少 3 个字符'
    if (!password) return '请输入密码'
    return null
  }
  const { identifier, password, confirmPassword } = registerForm.value
  const idErr = validateRegisterIdentifier(identifier)
  if (idErr) return idErr
  return validatePasswordConfirm(password, confirmPassword)
}

function showValidationError(message: string) {
  toast.showError(message)
}

async function onSubmit() {
  if (auth.error) auth.error = null
  if (!canSubmit.value) {
    showValidationError('请填写完整信息')
    return
  }
  const validationError = validateForm()
  if (validationError) {
    showValidationError(validationError)
    return
  }
  try {
    if (mode.value === 'login') {
      const { identifier, password } = loginForm.value
      await auth.login(identifier.trim(), password)
    } else {
      const { identifier, password } = registerForm.value
      await auth.register({
        ...parseRegisterPayload(identifier),
        password,
        website: honeypot.value,
      })
    }
  } catch {
    if (auth.error) showValidationError(auth.error)
  }
}

function onForgotPassword() {
  toast.showError('密码重置功能即将上线')
}

function onSocialLogin(provider: 'wechat' | 'google' | 'sms') {
  const labels = { wechat: '微信', google: 'Google', sms: '短信' }
  toast.showError(`${labels[provider]} 登录暂未开放`)
}

function onPageMenu() {
  toast.showError('帮助与设置即将上线')
}
</script>

<template>
  <div
    class="login-page"
    :class="[
      `login-page--${skyTheme}`,
      { 'login-page--interactive': interactionsEnabled },
    ]"
  >
    <LoginNightSky />
    <LoginCustomCursor v-if="interactionsEnabled" />

    <div class="login-page-toolbar">
      <button
        type="button"
        class="login-theme-toggle"
        :aria-label="isLight ? '切换暗色' : '切换亮色'"
        @click="toggleTheme"
      >
        <Sun v-if="isLight" :size="16" />
        <Moon v-else :size="16" />
      </button>
      <button
        type="button"
        class="login-page-menu"
        aria-label="更多选项"
        @click="onPageMenu"
      >
        <MoreHorizontal :size="18" />
      </button>
    </div>

    <div class="login-card-scene">
      <div
        class="login-card-float"
        :class="{ 'login-card-float--static': !interactionsEnabled }"
      >
        <div
          class="login-card"
          :style="cardTiltStyle"
          @pointerenter="onCardEnter"
          @pointerleave="onCardLeave"
        >
          <div class="login-brand">
            <div class="login-brand-mark" aria-hidden="true">OM</div>
            <h1>{{ BRAND_NAME }}</h1>
          </div>

          <div class="mode-tabs">
            <button
              type="button"
              class="mode-tab"
              :class="{ active: mode === 'login' }"
              @click="mode = 'login'"
            >
              登录
            </button>
            <button
              type="button"
              class="mode-tab"
              :class="{ active: mode === 'register' }"
              @click="mode = 'register'"
            >
              注册
            </button>
          </div>

          <form class="login-form" novalidate @submit.prevent="onSubmit">
            <input
              v-model="honeypot"
              type="text"
              name="om_hp"
              class="hp-field"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
            />

            <label class="field-label" :for="mode === 'login' ? 'login-identifier' : 'register-identifier'">
              邮箱或手机号
            </label>
            <div class="field-wrap field-wrap--icon">
              <Mail :size="16" class="field-icon" />
              <input
                v-if="mode === 'login'"
                id="login-identifier"
                v-model="loginForm.identifier"
                type="text"
                name="login-identifier"
                class="field-input login-field-input"
                placeholder="user@example.com 或 13..."
                autocomplete="username"
              />
              <input
                v-else
                id="register-identifier"
                v-model="registerForm.identifier"
                type="text"
                name="register-identifier"
                class="field-input login-field-input"
                placeholder="user@example.com 或 13..."
                autocomplete="email"
              />
            </div>

            <label class="field-label" :for="mode === 'login' ? 'login-password' : 'register-password'">
              密码
            </label>
            <div class="field-wrap field-wrap--icon field-wrap--toggle">
              <Lock :size="16" class="field-icon" />
              <input
                v-if="mode === 'login'"
                id="login-password"
                v-model="loginForm.password"
                :type="showPassword ? 'text' : 'password'"
                name="login-password"
                class="field-input login-field-input"
                placeholder="请输入密码"
                autocomplete="current-password"
              />
              <input
                v-else
                id="register-password"
                v-model="registerForm.password"
                :type="showPassword ? 'text' : 'password'"
                name="register-password"
                class="field-input login-field-input"
                placeholder="8 位以上，含字母与特殊字符"
                autocomplete="new-password"
              />
              <button
                type="button"
                class="field-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <EyeOff v-if="showPassword" :size="16" />
                <Eye v-else :size="16" />
              </button>
            </div>

            <button
              v-if="mode === 'login'"
              type="button"
              class="forgot-link"
              @click="onForgotPassword"
            >
              忘记密码?
            </button>

            <template v-if="mode === 'register'">
              <label class="field-label" for="register-confirm-password">确认密码</label>
              <div class="field-wrap field-wrap--icon">
                <Lock :size="16" class="field-icon" />
                <input
                  id="register-confirm-password"
                  v-model="registerForm.confirmPassword"
                  :type="showPassword ? 'text' : 'password'"
                  name="register-confirm-password"
                  class="field-input login-field-input"
                  placeholder="再次输入密码"
                  autocomplete="new-password"
                />
              </div>
            </template>

            <button type="submit" class="submit-btn" :disabled="auth.loading">
              <Loader2 v-if="auth.loading" :size="18" class="om-loading-spinner" />
              <span v-else>{{ mode === 'login' ? '登录' : '注册并登录' }}</span>
            </button>
          </form>

          <div class="social-divider">
            <span class="social-divider__line" />
            <span class="social-divider__text">其他方式</span>
            <span class="social-divider__line" />
          </div>

          <div class="social-btns">
            <button type="button" class="social-btn" @click="onSocialLogin('wechat')">
              <img src="/logos/微信.svg" alt="" class="social-btn__icon" width="16" height="16" />
              微信
            </button>
            <button type="button" class="social-btn" @click="onSocialLogin('google')">
              <svg class="social-btn__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>
            <button type="button" class="social-btn" @click="onSocialLogin('sms')">
              <Smartphone :size="16" class="social-btn__icon social-btn__icon--lucide" />
              短信
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  transition: background 0.4s ease;

  &--dark {
    background: #060412;
  }

  &--light {
    background: #eeeaf8;
  }

  &--interactive {
    cursor: none;

    input, textarea, button, a, .field-toggle {
      cursor: none;
    }
  }
}

.login-page-toolbar {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2;
  display: flex;
  gap: 8px;
}

.login-theme-toggle,
.login-page-menu {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.login-page--dark {
  .login-theme-toggle,
  .login-page-menu {
    color: rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);

    &:hover {
      color: rgba(255, 255, 255, 0.85);
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

.login-page--light {
  .login-theme-toggle,
  .login-page-menu {
    color: rgba(80, 55, 160, 0.55);
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.85);

    &:hover {
      color: #2d1e6b;
      background: rgba(255, 255, 255, 0.75);
    }
  }
}

.login-card-scene {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
}

.login-card-float {
  animation: float-card 6s ease-in-out infinite;

  &--static {
    animation: none;
  }
}

@keyframes float-card {
  0%, 100% { margin-top: 0; }
  50% { margin-top: -8px; }
}

// ── 卡片：暗色 Cosmic Glass ──
.login-page--dark .login-card {
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 0.5px solid rgba(255, 255, 255, 0.13);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);

  &::before {
    background: radial-gradient(
      ellipse 75% 50% at var(--highlight-x, 50%) var(--highlight-y, 28%),
      rgba(255, 255, 255, 0.13) 0%,
      rgba(255, 255, 255, 0.03) 42%,
      transparent 70%
    );
  }

  &::after {
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      inset 1px 0 0 rgba(255, 255, 255, 0.04);
  }
}

// ── 卡片：亮色（白 82% + 浅紫 70% 叠加 + saturate 1.8）──
.login-page--light .login-card {
  background: linear-gradient(
    145deg,
    rgba(238, 230, 255, 0.70) 0%,
    rgba(255, 255, 255, 0.82) 55%,
    rgba(255, 255, 255, 0.78) 100%
  );
  backdrop-filter: blur(18px) saturate(1.8);
  -webkit-backdrop-filter: blur(18px) saturate(1.8);
  border: 1px solid rgba(255, 255, 255, 0.90);
  box-shadow:
    0 12px 36px rgba(100, 80, 180, 0.12),
    0 4px 16px rgba(80, 55, 160, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);

  &::before {
    background: radial-gradient(
      ellipse 80% 55% at var(--highlight-x, 50%) var(--highlight-y, 22%),
      rgba(255, 255, 255, 0.95) 0%,
      rgba(255, 255, 255, 0.35) 35%,
      transparent 68%
    );
  }

  &::after {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
  }
}

.login-card {
  position: relative;
  width: 100%;
  padding: 32px 28px 24px;
  border-radius: 22px;
  transition: box-shadow 0.2s ease, background 0.4s ease, border-color 0.4s ease;
  isolation: isolate;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }

  > * {
    position: relative;
    z-index: 1;
  }
}

.login-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 26px;

  h1 {
    margin: 0;
    font-size: 21px;
    font-weight: 600;
    line-height: 1;
  }
}

.login-page--dark .login-brand h1 {
  color: rgba(255, 255, 255, 0.96);
}

.login-page--light .login-brand h1 {
  color: #2d1e6b;
}

.login-brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #7c5fe8 0%, #5338c0 100%);
  box-shadow: 0 4px 14px rgba(124, 95, 232, 0.4);
}

.mode-tabs {
  display: flex;
  margin-bottom: 24px;
  border-bottom: 1px solid transparent;
}

.login-page--dark .mode-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.login-page--light .mode-tabs {
  border-bottom-color: rgba(80, 55, 160, 0.12);
}

.mode-tab {
  flex: 1;
  padding: 10px 8px 14px;
  font-size: 14px;
  font-weight: 500;
  background: transparent;
  position: relative;
  transition: color 0.15s;

  &.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%);
    width: 52px;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, rgba(124, 95, 232, 0.95), transparent);
    box-shadow: 0 0 10px rgba(124, 95, 232, 0.45);
  }
}

.login-page--dark .mode-tab {
  color: rgba(255, 255, 255, 0.48);

  &.active { color: rgba(255, 255, 255, 0.95); }
  &:not(.active):hover { color: rgba(255, 255, 255, 0.72); }
}

.login-page--light .mode-tab {
  color: rgba(80, 55, 160, 0.45);

  &.active { color: #2d1e6b; }
  &:not(.active):hover { color: rgba(45, 30, 107, 0.75); }
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hp-field {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  margin-top: 6px;
}

.login-page--dark .field-label {
  color: rgba(255, 255, 255, 0.35);
}

.login-page--light .field-label {
  color: rgba(80, 55, 160, 0.55);
}

.field-wrap {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus-within {
    border-color: rgba(124, 95, 232, 0.55);
    box-shadow: 0 0 0 1px rgba(124, 95, 232, 0.22);
  }

  &--icon .field-input { padding-left: 40px; }
  &--toggle .field-input { padding-right: 40px; }
}

.login-page--dark .field-wrap {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.28);
}

.login-page--light .field-wrap {
  border: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.55);
}

.field-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px;
  transition: color 0.15s;
}

.login-page--dark .field-toggle {
  color: rgba(255, 255, 255, 0.38);
  &:hover { color: rgba(255, 255, 255, 0.65); }
}

.login-page--light .field-toggle {
  color: rgba(80, 55, 160, 0.4);
  &:hover { color: rgba(45, 30, 107, 0.7); }
}

.forgot-link {
  align-self: flex-end;
  margin-top: 2px;
  font-size: 12px;
  color: rgba(140, 110, 255, 0.75);
  transition: color 0.15s;

  &:hover { color: #7c5fe8; }
}

.field-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.login-page--dark .field-icon {
  color: rgba(255, 255, 255, 0.4);
}

.login-page--light .field-icon {
  color: rgba(80, 55, 160, 0.4);
}

.field-input {
  display: block;
  width: 100%;
  min-width: 0;
  padding: 12px 14px;
  font-size: 14px;
  background: transparent;
  border: none;
  outline: none;

  &:focus {
    outline: none;
    box-shadow: none;
  }
}

.login-page--dark .field-input {
  color: rgba(255, 255, 255, 0.92);

  &::placeholder { color: rgba(255, 255, 255, 0.32); }

  &:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 1000px rgba(20, 18, 45, 0.85) inset !important;
    -webkit-text-fill-color: rgba(255, 255, 255, 0.92) !important;
  }
}

.login-page--light .field-input {
  color: #2d1e6b;

  &::placeholder { color: rgba(80, 55, 160, 0.38); }

  &:-webkit-autofill {
    -webkit-box-shadow: 0 0 0 1000px rgba(255, 255, 255, 0.85) inset !important;
    -webkit-text-fill-color: #2d1e6b !important;
  }
}

.submit-btn {
  position: relative;
  margin-top: 18px;
  width: 100%;
  padding: 13px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  overflow: visible;
  transition: box-shadow 0.2s, border-color 0.2s;

  &::after {
    content: '';
    position: absolute;
    left: 12%;
    right: 12%;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, rgba(124, 95, 232, 0.95) 20%, rgba(124, 95, 232, 1) 50%, rgba(124, 95, 232, 0.95) 80%, transparent);
    box-shadow: 0 0 10px rgba(124, 95, 232, 0.6), 0 4px 16px rgba(83, 56, 192, 0.3);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.login-page--dark .submit-btn {
  color: rgba(255, 255, 255, 0.96);
  background: linear-gradient(135deg, #7c5fe8 0%, #5338c0 100%);
  border: 0.5px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 24px rgba(83, 56, 192, 0.45);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, transparent 48%);
    pointer-events: none;
  }
}

.login-page--light .submit-btn {
  color: #fff;
  background: linear-gradient(135deg, #7c5fe8 0%, #5338c0 100%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 6px 20px rgba(124, 95, 232, 0.35);
}

.social-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  margin-bottom: 16px;
}

.social-divider__line {
  flex: 1;
  height: 1px;
}

.login-page--dark .social-divider__line {
  background: rgba(255, 255, 255, 0.1);
}

.login-page--light .social-divider__line {
  background: rgba(80, 55, 160, 0.12);
}

.social-divider__text {
  font-size: 12px;
  white-space: nowrap;
}

.login-page--dark .social-divider__text {
  color: rgba(255, 255, 255, 0.38);
}

.login-page--light .social-divider__text {
  color: rgba(80, 55, 160, 0.45);
}

.social-btns {
  display: flex;
  gap: 10px;
}

.social-btn {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.login-page--dark .social-btn {
  color: rgba(255, 255, 255, 0.62);
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.08);

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.88);
  }
}

.login-page--light .social-btn {
  color: rgba(80, 55, 160, 0.6);
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.85);

  &:hover {
    background: rgba(255, 255, 255, 0.75);
    color: #2d1e6b;
  }
}

.login-page--dark .social-btn__icon--lucide {
  color: rgba(255, 255, 255, 0.55);
}

.login-page--light .social-btn__icon--lucide {
  color: rgba(80, 55, 160, 0.5);
}

.social-btn__icon {
  display: block;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .login-card-float {
    animation: none;
  }
}
</style>
