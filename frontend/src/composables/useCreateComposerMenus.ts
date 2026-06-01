import { inject, nextTick, type InjectionKey, type Ref } from 'vue'

export type CreateComposerMenuCloseAll = () => void

export const createComposerMenuCloseAllKey: InjectionKey<CreateComposerMenuCloseAll> =
  Symbol('createComposerMenuCloseAll')

/** 递增时关闭所有创作页弹出菜单 */
export const createMenuCloseSignalKey: InjectionKey<Ref<number>> =
  Symbol('createMenuCloseSignal')

/** 子组件（生成偏好 / 技能）上报展开状态，用于抬高输入区层级 */
export const composerSubmenuOpenKey: InjectionKey<(id: string, open: boolean) => void> =
  Symbol('composerSubmenuOpen')

export function useCreateComposerMenuCloseAll() {
  return inject(createComposerMenuCloseAllKey, () => {})
}

/** 互斥打开：递增关闭信号后，仅当信号仍等于本次 ticket 时才打开面板 */
export function requestExclusiveComposerMenuOpen(
  closeSignal: Ref<number>,
  openPanel: () => void | Promise<void>,
) {
  const ticket = ++closeSignal.value
  void nextTick(() => {
    if (closeSignal.value !== ticket) return
    void openPanel()
  })
}

type ComposerPopover = {
  open: Ref<boolean>
  close: () => void
  openPanel: () => void | Promise<void>
}

/** 点击触发器：已开则关（并作废待打开），未开则互斥打开 */
export function toggleExclusiveComposerMenu(
  closeSignal: Ref<number>,
  popover: ComposerPopover,
  e: MouseEvent,
) {
  e.stopPropagation()
  if (popover.open.value) {
    popover.close()
    closeSignal.value += 1
    return
  }
  requestExclusiveComposerMenuOpen(closeSignal, () => popover.openPanel())
}
