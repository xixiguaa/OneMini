import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  message: string
  kind?: ToastKind
  /** 自动关闭毫秒，默认 error 8s / 其它 4s */
  duration?: number
  action?: ToastAction
}

export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  const kind = ref<ToastKind>('info')
  const visible = ref(false)
  const action = ref<ToastAction | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null

  function dismiss() {
    visible.value = false
    action.value = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function show(options: ToastOptions | string) {
    const opts = typeof options === 'string' ? { message: options } : options
    message.value = opts.message
    kind.value = opts.kind ?? 'info'
    action.value = opts.action ?? null
    visible.value = true

    if (timer) clearTimeout(timer)
    const duration = opts.duration ?? (kind.value === 'error' ? 8000 : 4000)
    timer = setTimeout(() => dismiss(), duration)
  }

  function showError(msg: string, duration?: number) {
    const text = (msg || '').trim()
    if (!text) return
    // 连续报错时先隐藏再显示，避免 Transition 不刷新
    if (visible.value) {
      visible.value = false
      requestAnimationFrame(() => {
        show({ message: text, kind: 'error', duration })
      })
      return
    }
    show({ message: text, kind: 'error', duration })
  }

  function showSuccess(msg: string, duration?: number) {
    show({ message: msg, kind: 'success', duration })
  }

  return {
    message,
    kind,
    visible,
    action,
    show,
    showError,
    showSuccess,
    dismiss,
  }
})
