import { onMounted, onUnmounted, ref } from 'vue'

type HoverPopperPlacement = 'below' | 'above'

export function useHoverPopper(opts?: {
  placement?: HoverPopperPlacement
  gap?: number
  /** 水平微调（负值向左） */
  offsetX?: number
}) {
  const placement = opts?.placement ?? 'below'
  const gap = opts?.gap ?? 8
  const offsetX = opts?.offsetX ?? 0

  const activeKey = ref<string | null>(null)
  const panelStyle = ref<Record<string, string>>({})
  let triggerEl: HTMLElement | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function updatePosition(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const style: Record<string, string> = {
      position: 'fixed',
      zIndex: '10005',
      left: `${r.left + r.width / 2 + offsetX}px`,
      transform: 'translateX(-50%)',
    }

    if (placement === 'below') {
      style.top = `${r.bottom + gap}px`
    } else {
      style.bottom = `${window.innerHeight - r.top + gap}px`
    }

    panelStyle.value = style
  }

  function show(key: string, el: HTMLElement) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    activeKey.value = key
    triggerEl = el
    updatePosition(el)
  }

  function hide() {
    hideTimer = setTimeout(() => {
      activeKey.value = null
      triggerEl = null
    }, 60)
  }

  function cancelHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function onViewportChange() {
    if (activeKey.value && triggerEl) updatePosition(triggerEl)
  }

  onMounted(() => {
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', onViewportChange, true)
    window.removeEventListener('resize', onViewportChange)
    if (hideTimer) clearTimeout(hideTimer)
  })

  return { activeKey, panelStyle, show, hide, cancelHide }
}
