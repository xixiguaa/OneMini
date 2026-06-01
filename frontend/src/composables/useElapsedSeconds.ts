import { type MaybeRefOrGetter, onUnmounted, ref, toValue, watch } from 'vue'

/** 在 active 为 true 时从 0 起每秒递增，结束后归零 */
export function useElapsedSeconds(active: MaybeRefOrGetter<boolean>) {
  const seconds = ref(0)
  let interval: ReturnType<typeof setInterval> | null = null
  let startedAt = 0

  function stop() {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
  }

  function tick() {
    seconds.value = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }

  watch(
    () => toValue(active),
    (on) => {
      stop()
      if (on) {
        startedAt = Date.now()
        seconds.value = 0
        tick()
        interval = setInterval(tick, 1000)
      } else {
        seconds.value = 0
      }
    },
    { immediate: true },
  )

  onUnmounted(stop)

  return seconds
}
