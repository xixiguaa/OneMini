import { type MaybeRefOrGetter, onUnmounted, ref, toValue, watch } from 'vue'

export interface UseTypewriterOptions {
  /** 每个字符间隔（毫秒） */
  speed?: number
  /** 开始打字前的延迟（毫秒） */
  startDelay?: number
  /** 打完后是否循环（退格 → 重打） */
  loop?: boolean
  /** 打完后停留时间（毫秒） */
  pauseAfterType?: number
  /** 退格每个字符间隔（毫秒） */
  deleteSpeed?: number
  /** 退格完成后、重新打字前的停留（毫秒） */
  pauseAfterDelete?: number
}

/** 将文本以打字机方式逐字输出，可选循环退格重打 */
export function useTypewriter(source: MaybeRefOrGetter<string>, options: UseTypewriterOptions = {}) {
  const {
    speed = 90,
    startDelay = 120,
    loop = false,
    pauseAfterType = 1800,
    deleteSpeed = 55,
    pauseAfterDelete = 400,
  } = options

  const displayText = ref('')
  const isTyping = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let activeText = ''

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(fn: () => void, delay: number) {
    timer = setTimeout(fn, delay)
  }

  function runTypewriter(text: string) {
    clearTimer()
    activeText = text

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayText.value = text
      isTyping.value = false
      return
    }

    displayText.value = ''
    isTyping.value = false
    let index = 0

    const typeNext = () => {
      if (activeText !== text) return

      if (index < text.length) {
        isTyping.value = true
        index += 1
        displayText.value = text.slice(0, index)
        schedule(typeNext, speed)
        return
      }

      isTyping.value = false
      if (loop && text.length > 0) {
        schedule(deleteNext, pauseAfterType)
      }
    }

    const deleteNext = () => {
      if (activeText !== text) return

      if (index > 0) {
        isTyping.value = true
        index -= 1
        displayText.value = text.slice(0, index)
        schedule(deleteNext, deleteSpeed)
        return
      }

      isTyping.value = false
      if (loop) {
        schedule(typeNext, pauseAfterDelete)
      }
    }

    schedule(typeNext, startDelay)
  }

  watch(
    () => toValue(source),
    (text) => {
      runTypewriter(text || '')
    },
    { immediate: true },
  )

  onUnmounted(clearTimer)

  return { displayText, isTyping }
}
