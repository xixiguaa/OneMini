<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useLoginPointer } from '../composables/useLoginPointer'
import { useUiPrefsStore } from '../stores/uiPrefs'
import { createNightSkyEngine, supportsWebGL, type NightSkyEngine } from '../utils/loginNightSkyEngine'

const ui = useUiPrefsStore()

const CLOUD_SHAPES = {
  a: 'M 14 54 C 4 40 10 24 34 26 C 44 8 70 10 86 24 C 106 12 130 16 146 32 C 166 34 178 46 168 54 L 16 54 Z',
  b: 'M 8 48 C 2 34 14 18 38 20 C 52 6 78 8 96 22 C 118 10 142 14 158 28 C 172 32 180 44 170 50 L 10 50 Z',
  c: 'M 18 56 C 8 42 16 28 40 30 C 54 14 72 16 88 28 C 108 18 132 20 148 34 C 162 38 170 50 158 56 L 20 56 Z',
  d: 'M 6 52 C 0 38 12 22 36 24 C 50 8 76 10 94 24 C 116 12 140 16 156 30 C 170 34 178 46 168 52 L 8 52 Z',
} as const

type CloudShapeId = keyof typeof CLOUD_SHAPES

const CLOUDS = [
  { id: 1, layer: 'far', shape: 'a' as CloudShapeId, top: '8%', left: '-4%', width: 280, height: 96, delay: 0, duration: 48, sway: 28 },
  { id: 2, layer: 'far', shape: 'b' as CloudShapeId, top: '62%', left: '52%', width: 300, height: 100, delay: -14, duration: 52, sway: 34 },
  { id: 3, layer: 'mid', shape: 'c' as CloudShapeId, top: '24%', left: '58%', width: 240, height: 84, delay: -8, duration: 38, sway: 42 },
  { id: 4, layer: 'mid', shape: 'd' as CloudShapeId, top: '70%', left: '6%', width: 270, height: 90, delay: -20, duration: 44, sway: 36 },
  { id: 5, layer: 'near', shape: 'a' as CloudShapeId, top: '16%', left: '24%', width: 220, height: 78, delay: -11, duration: 32, sway: 52 },
  { id: 6, layer: 'near', shape: 'b' as CloudShapeId, top: '44%', left: '-2%', width: 250, height: 86, delay: -17, duration: 36, sway: 48 },
] as const

const PARALLAX_MAP = { far: 14, mid: 28, near: 48 } as const

const containerRef = ref<HTMLDivElement | null>(null)
const useStaticFallback = ref(true)

const { nx, ny, interactionsEnabled, skyTheme } = useLoginPointer()

const isLight = computed(() => skyTheme.value === 'light')
const isDark = computed(() => skyTheme.value === 'dark')

let engine: NightSkyEngine | null = null
let resizeObserver: ResizeObserver | null = null

const cloudParallaxStyle = computed(() => {
  const x = nx.value
  const y = ny.value
  return {
    '--cloud-far-x': `${x * PARALLAX_MAP.far}px`,
    '--cloud-far-y': `${-y * PARALLAX_MAP.far * 0.7}px`,
    '--cloud-mid-x': `${x * PARALLAX_MAP.mid}px`,
    '--cloud-mid-y': `${-y * PARALLAX_MAP.mid * 0.7}px`,
    '--cloud-near-x': `${x * PARALLAX_MAP.near}px`,
    '--cloud-near-y': `${-y * PARALLAX_MAP.near * 0.7}px`,
  }
})

function cloudStyle(cloud: (typeof CLOUDS)[number]) {
  return {
    top: cloud.top,
    left: cloud.left,
    width: `${cloud.width}px`,
    height: `${cloud.height}px`,
  }
}

function cloudFloatStyle(cloud: (typeof CLOUDS)[number]) {
  return {
    animationDelay: `${cloud.delay}s`,
    animationDuration: `${cloud.duration}s`,
    '--cloud-sway': `${cloud.sway}px`,
  }
}

function disposeEngine() {
  engine?.dispose()
  engine = null
  resizeObserver?.disconnect()
  resizeObserver = null
}

async function initDarkEngine() {
  if (ui.lowPerformanceMode || !interactionsEnabled.value || !supportsWebGL() || !isDark.value) {
    useStaticFallback.value = ui.lowPerformanceMode || !interactionsEnabled.value || !supportsWebGL()
    if (!isDark.value) useStaticFallback.value = false
    disposeEngine()
    return
  }

  await nextTick()
  const container = containerRef.value
  if (!container) {
    useStaticFallback.value = true
    return
  }

  disposeEngine()
  engine = createNightSkyEngine(container)
  if (!engine) {
    useStaticFallback.value = true
    return
  }

  useStaticFallback.value = false
  engine.setPointer(nx.value, ny.value)

  resizeObserver = new ResizeObserver(() => engine?.resize())
  resizeObserver.observe(container.parentElement ?? container)
}

watch([nx, ny], ([x, y]) => {
  engine?.setPointer(x, y)
})

watch(skyTheme, (theme) => {
  if (theme === 'dark') {
    void initDarkEngine()
  } else {
    disposeEngine()
    useStaticFallback.value = false
  }
})

watch(
  () => ui.lowPerformanceMode,
  () => {
    void initDarkEngine()
  }
)

onMounted(() => {
  void initDarkEngine()
})

onUnmounted(() => {
  disposeEngine()
})
</script>

<template>
  <div
    class="login-sky"
    :class="[
      `login-sky--${skyTheme}`,
      { 'login-sky--static': useStaticFallback && isDark },
    ]"
    aria-hidden="true"
  >
    <div class="login-sky__base" />

    <!-- 暗色：Three.js 星空 -->
    <div
      v-show="isDark"
      ref="containerRef"
      class="login-sky__three"
      :class="{ 'login-sky__three--hidden': useStaticFallback || !isDark }"
    />

    <!-- 暗色静态降级星点 -->
    <div v-if="useStaticFallback && isDark" class="login-sky__static-stars">
      <span
        v-for="n in 28"
        :key="n"
        class="static-star"
        :class="{ 'static-star--bright': n % 3 === 0 }"
        :style="{
          top: `${((n * 17 + 7) % 100)}%`,
          left: `${((n * 23 + 11) % 100)}%`,
          opacity: 0.3 + (n % 7) * 0.1,
          animationDelay: `${-n * 0.17}s`,
          animationDuration: `${2 + (n % 5) * 0.9}s`,
        }"
      />
    </div>

    <!-- 亮色：漂浮云层 -->
    <div
      v-if="isLight"
      class="login-sky__clouds"
      :style="cloudParallaxStyle"
    >
      <div
        v-for="cloud in CLOUDS"
        :key="cloud.id"
        class="cloud"
        :class="`cloud--${cloud.layer}`"
        :style="cloudStyle(cloud)"
      >
        <div class="cloud__float" :style="cloudFloatStyle(cloud)">
          <svg viewBox="0 0 180 70" class="cloud__svg" preserveAspectRatio="none" aria-hidden="true">
            <path class="cloud__body" :d="CLOUD_SHAPES[cloud.shape]" />
          </svg>
        </div>
      </div>
    </div>

    <div v-if="isDark" class="login-sky__moon">
      <div class="moon__surface" />
      <div class="moon__crater moon__crater--1" />
      <div class="moon__crater moon__crater--2" />
      <div class="moon__crater moon__crater--3" />
    </div>
    <div v-else class="login-sky__sun">
      <div class="sun__glow" />
      <div class="sun__core" />
    </div>

    <div class="login-sky__aurora login-sky__aurora--1" />
    <div class="login-sky__aurora login-sky__aurora--2" />
  </div>
</template>

<style scoped lang="scss">
.login-sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.login-sky--dark .login-sky__base {
  background:
    radial-gradient(ellipse 120% 80% at 50% 110%, rgba(80, 40, 180, 0.18) 0%, transparent 55%),
    radial-gradient(ellipse 80% 50% at 80% 10%, rgba(80, 50, 220, 0.12) 0%, transparent 50%),
    linear-gradient(145deg, #060412 0%, #0d0822 50%, #060412 100%);
}

.login-sky--dark.login-sky--static .login-sky__base {
  background:
    radial-gradient(2px 2px at 12% 18%, #d8d0ff 0%, transparent 100%),
    radial-gradient(1.5px 1.5px at 62% 55%, #faf8ff 0%, transparent 100%),
    radial-gradient(3px 3px at 88% 68%, #d8d0ff 0%, transparent 100%),
    radial-gradient(ellipse 120% 80% at 50% 110%, rgba(80, 40, 180, 0.18) 0%, transparent 55%),
    linear-gradient(145deg, #060412 0%, #0d0822 50%, #060412 100%);
}

.login-sky--light .login-sky__base {
  background:
    radial-gradient(ellipse 90% 60% at 20% 80%, rgba(150, 120, 255, 0.13) 0%, transparent 55%),
    radial-gradient(ellipse 70% 50% at 85% 20%, rgba(13, 207, 176, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse 60% 40% at 50% 0%, rgba(150, 120, 255, 0.1) 0%, transparent 60%),
    #eeeaf8;
}

.login-sky__three {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &--hidden {
    visibility: hidden;
  }

  :deep(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
    pointer-events: none !important;
  }
}

.login-sky__static-stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.static-star {
  position: absolute;
  border-radius: 50%;
  background: #d8d0ff;
  animation: static-twinkle ease-in-out infinite alternate;
  width: 3px;
  height: 3px;

  &--bright {
    width: 5px;
    height: 5px;
    background: #faf8ff;
    box-shadow: 0 0 10px rgba(216, 208, 255, 0.55), 0 0 4px rgba(250, 248, 255, 0.8);
  }
}

@keyframes static-twinkle {
  0% { opacity: 0.2; transform: scale(0.75); }
  45% { opacity: 0.95; transform: scale(1.15); }
  100% { opacity: 0.35; transform: scale(0.9); }
}

// ── 手绘风云朵 ──
.login-sky__clouds {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cloud {
  position: absolute;
  will-change: transform;
}

.cloud--far {
  transform: translate(var(--cloud-far-x, 0), var(--cloud-far-y, 0));
  opacity: 0.58;

  .cloud__body {
    fill: rgba(255, 255, 255, 0.82);
  }
}

.cloud--mid {
  transform: translate(var(--cloud-mid-x, 0), var(--cloud-mid-y, 0));
  opacity: 0.74;

  .cloud__body {
    fill: rgba(255, 255, 255, 0.9);
  }
}

.cloud--near {
  transform: translate(var(--cloud-near-x, 0), var(--cloud-near-y, 0));
  opacity: 0.92;

  .cloud__body {
    fill: rgba(255, 255, 255, 0.97);
  }
}

.cloud__float {
  width: 100%;
  height: 100%;
  animation: cloud-sway-x ease-in-out infinite;
  will-change: transform;
}

.cloud__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.cloud__body {
  fill: rgba(255, 255, 255, 0.94);
  filter: drop-shadow(0 4px 12px rgba(150, 120, 255, 0.08));
}

@keyframes cloud-sway-x {
  0%, 100% {
    transform: translateX(calc(var(--cloud-sway, 30px) * -1));
  }
  50% {
    transform: translateX(var(--cloud-sway, 30px));
  }
}

.login-sky__moon {
  position: absolute;
  top: 8%;
  right: 10%;
  width: clamp(72px, 14vw, 110px);
  height: clamp(72px, 14vw, 110px);
  border-radius: 50%;
  overflow: hidden;
  filter: drop-shadow(0 0 28px rgba(220, 225, 255, 0.18));
  pointer-events: none;
}

.moon__surface {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 38% 32%, rgba(255, 255, 255, 0.95) 0%, rgba(230, 232, 245, 0.85) 18%, transparent 42%),
    radial-gradient(circle at 50% 50%, #d8dae8 0%, #b8bccf 55%, #9094aa 100%);
}

.moon__crater {
  position: absolute;
  border-radius: 50%;
  background: rgba(120, 125, 150, 0.22);

  &--1 { width: 20%; height: 14%; top: 28%; left: 22%; transform: rotate(-18deg); }
  &--2 { width: 13%; height: 9%; top: 52%; left: 48%; }
  &--3 { width: 10%; height: 7%; top: 38%; left: 62%; opacity: 0.7; }
}

.login-sky__sun {
  position: absolute;
  top: 7%;
  right: 9%;
  width: clamp(76px, 14vw, 112px);
  height: clamp(76px, 14vw, 112px);
  pointer-events: none;
}

.sun__glow {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.35) 0%, rgba(253, 230, 138, 0.12) 45%, transparent 70%);
}

.sun__core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #fff9e8 0%, #fde68a 42%, #fbbf24 100%);
  box-shadow: 0 0 32px rgba(251, 191, 36, 0.45);
}

.login-sky__aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  will-change: transform, opacity;
  pointer-events: none;
}

.login-sky--dark .login-sky__aurora {
  &--1 {
    width: 70%;
    height: 45%;
    top: -8%;
    left: -12%;
    background: radial-gradient(ellipse at center, rgba(80, 50, 220, 0.15) 0%, rgba(80, 40, 180, 0.08) 45%, transparent 72%);
    animation: aurora-breathe-1 9s ease-in-out infinite;
  }

  &--2 {
    width: 60%;
    height: 40%;
    bottom: -6%;
    right: -10%;
    background: radial-gradient(ellipse at center, rgba(30, 150, 190, 0.1) 0%, rgba(30, 150, 190, 0.04) 50%, transparent 72%);
    animation: aurora-breathe-2 11s ease-in-out infinite;
  }
}

.login-sky--light .login-sky__aurora {
  &--1 {
    width: 75%;
    height: 48%;
    top: -5%;
    left: -14%;
    background: radial-gradient(ellipse at center, rgba(150, 120, 255, 0.13) 0%, rgba(180, 150, 255, 0.06) 50%, transparent 72%);
    animation: aurora-breathe-1 9s ease-in-out infinite;
  }

  &--2 {
    width: 65%;
    height: 42%;
    bottom: -5%;
    right: -8%;
    background: radial-gradient(ellipse at center, rgba(13, 207, 176, 0.1) 0%, rgba(150, 120, 255, 0.08) 50%, transparent 72%);
    animation: aurora-breathe-2 11s ease-in-out infinite;
  }
}

@keyframes aurora-breathe-1 {
  0%, 100% { opacity: 0.18; transform: translate(0, 0) scale(1) rotate(-8deg); }
  50% { opacity: 0.32; transform: translate(3%, 2%) scale(1.06) rotate(-4deg); }
}

@keyframes aurora-breathe-2 {
  0%, 100% { opacity: 0.15; transform: translate(0, 0) scale(1) rotate(12deg); }
  50% { opacity: 0.28; transform: translate(-2%, -3%) scale(1.08) rotate(6deg); }
}

@media (prefers-reduced-motion: reduce) {
  .login-sky__aurora {
    animation: none !important;
    opacity: 0.22;
  }

  .static-star,
  .cloud__float {
    animation: none !important;
  }
}
</style>
