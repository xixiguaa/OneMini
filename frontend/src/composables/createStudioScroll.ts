import type { InjectionKey } from 'vue'
import type { CreateMode } from '../types/agent'

export const createStudioScrollToComposerKey: InjectionKey<() => void> = Symbol(
  'createStudioScrollToComposer',
)

export type OpenFloatingComposerOptions = {
  prompt: string
  mode: Extract<CreateMode, 'image' | 'video'>
  /** 预填作品图作为唯一参考图 */
  referenceImageUrl?: string
  referenceImageName?: string
}

export const createStudioOpenFloatingComposerKey: InjectionKey<
  (opts: OpenFloatingComposerOptions) => void | Promise<void>
> = Symbol('createStudioOpenFloatingComposer')
