import { nextTick, onMounted, onUnmounted, ref } from 'vue'

export type PopoverAlign = 'left' | 'right'
export type PopoverPlacement = 'auto' | 'above' | 'below' | 'left' | 'right'

export function useAnchoredPopover(opts?: {
  align?: PopoverAlign
  minWidth?: number
  /** 面板最大高度（px）；fitContent 为 true 时不生效 */
  maxPanelHeight?: number
  /** 按内容自然高度展示，不限制 maxHeight */
  fitContent?: boolean
  /** auto：触发器在视口上半区 → 下方展开，下半区 → 上方展开；默认 above */
  placement?: PopoverPlacement | (() => PopoverPlacement)
  /** 全屏透明层，点击即可关闭（用于 Teleport 面板） */
  backdrop?: boolean
}) {
  const align = opts?.align ?? 'left'
  const minWidth = opts?.minWidth ?? 200
  const maxPanelHeight = opts?.maxPanelHeight ?? 0
  const fitContent = opts?.fitContent ?? false
  const placementOption = opts?.placement ?? 'above'
  const getPlacementPref = (): PopoverPlacement =>
    typeof placementOption === 'function' ? placementOption() : placementOption
  const backdrop = opts?.backdrop ?? false

  const triggerRef = ref<HTMLElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const open = ref(false)
  const panelStyle = ref<Record<string, string>>({})
  const resolvedPlacement = ref<PopoverPlacement>('above')

  function resolveAutoPlacement(r: DOMRect): 'above' | 'below' {
    const triggerMid = r.top + r.height / 2
    return triggerMid < window.innerHeight * 0.5 ? 'below' : 'above'
  }

  function updatePosition() {
    const el = triggerRef.value
    const panel = panelRef.value
    if (!el) return

    const r = el.getBoundingClientRect()
    const gap = 8
    const width = Math.max(r.width, minWidth)
    const placementPref = getPlacementPref()

    if (placementPref === 'left' || placementPref === 'right') {
      resolvedPlacement.value = placementPref

      const panelHeight = panel?.offsetHeight ?? 0
      const panelWidth = panel?.offsetWidth ?? width
      let top = r.top + r.height / 2 - panelHeight / 2
      top = Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8))

      const base: Record<string, string> = {
        position: 'fixed',
        zIndex: '10005',
        minWidth: `${width}px`,
        maxWidth: `${Math.min(Math.max(width, minWidth), window.innerWidth - 16)}px`,
        top: `${top}px`,
      }

      if (placementPref === 'right') {
        base.left = `${r.right + gap}px`
      } else {
        base.left = `${Math.max(8, r.left - panelWidth - gap)}px`
      }

      panelStyle.value = base
      return
    }

    let placement: 'above' | 'below' =
      placementPref === 'auto' ? resolveAutoPlacement(r) : placementPref

    const panelHeight = panel?.offsetHeight ?? 0
    const spaceBelow = window.innerHeight - r.bottom - gap - 12
    const spaceAbove = r.top - gap - 12

    // 仅 auto 模式根据可视空间翻转；显式 above/below 保持用户指定方向
    if (panelHeight > 0 && placementPref === 'auto') {
      if (placement === 'below' && panelHeight > spaceBelow && spaceAbove >= panelHeight) {
        placement = 'above'
      } else if (placement === 'above' && panelHeight > spaceAbove && spaceBelow >= panelHeight) {
        placement = 'below'
      }
    }

    resolvedPlacement.value = placement

    const base: Record<string, string> = {
      position: 'fixed',
      zIndex: '10005',
      minWidth: `${width}px`,
      maxWidth: `${Math.min(Math.max(width, minWidth), window.innerWidth - 16)}px`,
    }

    if (!fitContent && maxPanelHeight > 0) {
      const maxH = maxPanelHeight
      const panelH = Math.min(maxH, Math.max(120, placement === 'above' ? spaceAbove : spaceBelow))
      base.maxHeight = `${panelH}px`
      if (placement === 'below') {
        base.top = `${r.bottom + gap}px`
      } else {
        base.bottom = `${window.innerHeight - r.top + gap}px`
      }
    } else if (placement === 'below') {
      base.top = `${r.bottom + gap}px`
    } else {
      base.bottom = `${window.innerHeight - r.top + gap}px`
    }

    if (align === 'right') {
      base.right = `${Math.max(8, window.innerWidth - r.right)}px`
    } else {
      base.left = `${Math.max(8, r.left)}px`
    }

    panelStyle.value = base
  }

  async function measureAndPosition() {
    await nextTick()
    updatePosition()
    requestAnimationFrame(() => updatePosition())
  }

  function close() {
    open.value = false
  }

  async function openPanel() {
    open.value = true
    await measureAndPosition()
  }

  function toggle(e?: MouseEvent) {
    e?.stopPropagation()
    if (open.value) {
      close()
      return
    }
    void openPanel()
  }

  function containsTarget(target: Node) {
    return triggerRef.value?.contains(target) || panelRef.value?.contains(target)
  }

  function onViewportChange() {
    if (open.value) updatePosition()
  }

  onMounted(() => {
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onViewportChange)
    window.removeEventListener('scroll', onViewportChange, true)
  })

  return {
    triggerRef,
    panelRef,
    open,
    panelStyle,
    resolvedPlacement,
    backdrop,
    toggle,
    close,
    openPanel,
    updatePosition,
    containsTarget,
  }
}
