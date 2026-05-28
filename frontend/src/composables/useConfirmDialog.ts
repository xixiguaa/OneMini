import { ref } from 'vue'

export interface ConfirmDialogOptions {
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const defaults: Required<Pick<ConfirmDialogOptions, 'title' | 'confirmLabel' | 'cancelLabel'>> = {
  title: '请确认',
  confirmLabel: '确定',
  cancelLabel: '取消',
}

/**
 * 命令式确认弹框：await confirm({ ... }) 返回用户是否点击确定
 * 需在页面挂载 <ConfirmDialog v-bind="confirmState" @confirm="onConfirm" @cancel="onCancel" />
 */
export function useConfirmDialog() {
  const open = ref(false)
  const loading = ref(false)
  const title = ref(defaults.title)
  const message = ref('')
  const confirmLabel = ref(defaults.confirmLabel)
  const cancelLabel = ref(defaults.cancelLabel)
  const danger = ref(false)

  let resolvePromise: ((value: boolean) => void) | null = null

  function close(confirmed: boolean) {
    resolvePromise?.(confirmed)
    resolvePromise = null
    open.value = false
    if (!confirmed) loading.value = false
  }

  function onConfirm() {
    close(true)
  }

  function onCancel() {
    if (loading.value) return
    close(false)
  }

  function confirm(opts: ConfirmDialogOptions = {}): Promise<boolean> {
    title.value = opts.title ?? defaults.title
    message.value = opts.message ?? ''
    confirmLabel.value = opts.confirmLabel ?? defaults.confirmLabel
    cancelLabel.value = opts.cancelLabel ?? defaults.cancelLabel
    danger.value = opts.danger ?? false
    loading.value = false
    open.value = true

    return new Promise<boolean>((resolve) => {
      resolvePromise = resolve
    })
  }

  function setLoading(v: boolean) {
    loading.value = v
  }

  function onOpenUpdate(v: boolean) {
    open.value = v
    if (!v && resolvePromise) onCancel()
  }

  return {
    open,
    loading,
    title,
    message,
    confirmLabel,
    cancelLabel,
    danger,
    confirm,
    setLoading,
    close,
    onConfirm,
    onCancel,
    onOpenUpdate,
  }
}
