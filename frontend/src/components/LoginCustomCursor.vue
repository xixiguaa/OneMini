<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLoginPointer } from '../composables/useLoginPointer'

const { isOverCard, interactionsEnabled, skyTheme } = useLoginPointer()

const dotX = ref(0)
const dotY = ref(0)
const ringX = ref(0)
const ringY = ref(0)
const visible = ref(false)

let rafId = 0

const isLight = computed(() => skyTheme.value === 'light')

function onPointerMove(e: PointerEvent) {
  dotX.value = e.clientX
  dotY.value = e.clientY
  if (!visible.value) visible.value = true
}

function onPointerLeave() {
  visible.value = false
}

function tick() {
  ringX.value += (dotX.value - ringX.value) * 0.11
  ringY.value += (dotY.value - ringY.value) * 0.11
  rafId = requestAnimationFrame(tick)
}

watch(interactionsEnabled, (enabled) => {
  if (!enabled) visible.value = false
})

onMounted(() => {
  if (!interactionsEnabled.value) return
  ringX.value = window.innerWidth / 2
  ringY.value = window.innerHeight / 2
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave)
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerleave', onPointerLeave)
})
</script>

<template>
  <div
    v-if="interactionsEnabled && visible"
    class="login-cursor"
    :class="{ 'login-cursor--light': isLight }"
    aria-hidden="true"
  >
    <div
      class="login-cursor__ring"
      :class="{ 'login-cursor__ring--card': isOverCard }"
      :style="{ transform: `translate(${ringX}px, ${ringY}px)` }"
    />
    <div
      class="login-cursor__dot"
      :style="{ transform: `translate(${dotX}px, ${dotY}px)` }"
    />
  </div>
</template>

<style scoped lang="scss">
.login-cursor {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
}

.login-cursor__dot,
.login-cursor__ring {
  position: fixed;
  top: 0;
  left: 0;
  will-change: transform;
  margin: 0;
}

.login-cursor__dot {
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 8px rgba(200, 210, 255, 0.55);
}

.login-cursor__ring {
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.38);
  transition: width 0.25s ease, height 0.25s ease, margin 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;

  &--card {
    width: 48px;
    height: 48px;
    margin: -24px 0 0 -24px;
    border-color: rgba(123, 95, 255, 0.72);
    box-shadow: 0 0 16px rgba(123, 95, 255, 0.35);
  }
}

.login-cursor--light {
  .login-cursor__dot {
    background: rgba(96, 64, 184, 0.88);
    box-shadow: 0 0 8px rgba(124, 95, 232, 0.35);
  }

  .login-cursor__ring {
    border-color: rgba(96, 64, 184, 0.35);

    &--card {
      border-color: rgba(124, 95, 232, 0.65);
      box-shadow: 0 0 14px rgba(124, 95, 232, 0.28);
    }
  }
}
</style>
