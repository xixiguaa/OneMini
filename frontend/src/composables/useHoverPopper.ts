import { onMounted, onUnmounted, ref } from 'vue'

type HoverPopperPlacement = 'below' | 'above'
type HoverPopperHorizontalAlign = 'start' | 'center' | 'end'

export function useHoverPopper(opts?: {
  placement?: HoverPopperPlacement
  gap?: number
  /** 水平微调（负值向左） */
  offsetX?: number
  /** 水平对齐：start=左缘对齐，center=居中，end=右缘对齐 */
  horizontalAlign?: HoverPopperHorizontalAlign
  /** 视口内边距，防止 popper 贴边 */
  viewportPadding?: number
  /** 用于边界计算的预估宽度 */
  estimatedWidth?: number
}) {
  const placement = opts?.placement ?? 'below'
  const gap = opts?.gap ?? 8
  const offsetX = opts?.offsetX ?? 0
  const horizontalAlign = opts?.horizontalAlign ?? 'center'
  const viewportPadding = opts?.viewportPadding ?? 16
  const estimatedWidth = opts?.estimatedWidth ?? 280

  const activeKey = ref<string | null>(null)
  const panelStyle = ref<Record<string, string>>({})
  let triggerEl: HTMLElement | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clampHorizontal(left: number, panelWidth: number) {
    if (horizontalAlign === 'center') {
      const half = panelWidth / 2
      const minLeft = viewportPadding + half
      const maxLeft = window.innerWidth - viewportPadding - half
      return Math.min(Math.max(left, minLeft), maxLeft)
    }
    if (horizontalAlign === 'start') {
      const minLeft = viewportPadding
      const maxLeft = window.innerWidth - viewportPadding - panelWidth
      return Math.min(Math.max(left, minLeft), maxLeft)
    }
    if (horizontalAlign === 'end') {
      const anchorRight = left
      const leftEdge = anchorRight - panelWidth
      if (leftEdge < viewportPadding) {
        return anchorRight
      }
      if (anchorRight > window.innerWidth - viewportPadding) {
        return window.innerWidth - viewportPadding
      }
      return anchorRight
    }
    return left
  }

  function updatePosition(el: HTMLElement, panelWidth = estimatedWidth) {
    const r = el.getBoundingClientRect()
    const style: Record<string, string> = {
      position: 'fixed',
      zIndex: '10005',
    }

    if (horizontalAlign === 'start') {
      style.left = `${clampHorizontal(r.left + offsetX, panelWidth)}px`
      style.transform = 'none'
    } else if (horizontalAlign === 'end') {
      style.left = `${clampHorizontal(r.right + offsetX, panelWidth)}px`
      style.transform = 'translateX(-100%)'
    } else {
      style.left = `${clampHorizontal(r.left + r.width / 2 + offsetX, panelWidth)}px`
      style.transform = 'translateX(-50%)'
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

  function remeasure(panelEl: HTMLElement | null) {
    if (!triggerEl || !panelEl) return
    updatePosition(triggerEl, panelEl.offsetWidth || estimatedWidth)
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

  return { activeKey, panelStyle, show, hide, cancelHide, remeasure }
}
