<script setup lang="ts">
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import mermaid from 'mermaid'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import LoadingIndicator from './LoadingIndicator.vue'
import { ensureMermaidInit } from '../utils/mermaidConfig'
import { highlightMermaidCode } from '../utils/mermaidHighlight'
import { applyReferenceChartStyle } from '../utils/mermaidStyle'
import { normalizeMermaidForHorizontal } from '../utils/mermaidSource'
import { randomUUID } from '../utils/uuid'

const props = defineProps<{
  source: string
}>()

const normalizedSource = computed(() => normalizeMermaidForHorizontal(props.source))

type TabId = 'chart' | 'code'

const activeTab = ref<TabId>('chart')
const chartRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const zoom = ref(1)
const fitZoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const userZoomed = ref(false)
const isFullscreen = ref(false)
const isDragging = ref(false)
const renderError = ref<string | null>(null)

const canPan = computed(() => zoom.value > fitZoom.value + 0.008)

const chartTransform = computed(() => {
  const t = `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`
  const origin = 'left center'
  const transition = isDragging.value ? 'none' : 'transform 0.15s ease'
  return { transform: t, transformOrigin: origin, transition }
})

let dragStart = { x: 0, y: 0, panX: 0, panY: 0 }
const isRendering = ref(false)
const copied = ref(false)

const highlightedCode = computed(() => highlightMermaidCode(props.source))

let renderSeq = 0
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function renderChart() {
  const el = chartRef.value
  if (!el || !normalizedSource.value.trim()) return

  const seq = ++renderSeq
  isRendering.value = true
  renderError.value = null

  try {
    ensureMermaidInit()
    const id = `mermaid-${randomUUID().replace(/-/g, '')}`
    const { svg, bindFunctions } = await mermaid.render(id, normalizedSource.value)
    if (seq !== renderSeq) return
    el.innerHTML = svg
    bindFunctions?.(el)
    await nextTick()
    applyReferenceChartStyle(el)
    if (!userZoomed.value) fitChartToViewport()
  } catch (e) {
    if (seq !== renderSeq) return
    renderError.value = e instanceof Error ? e.message : '图表渲染失败'
    el.innerHTML = ''
  } finally {
    if (seq === renderSeq) isRendering.value = false
  }
}

function fitChartToViewport() {
  const scroll = scrollRef.value
  const svg = chartRef.value?.querySelector('svg') as SVGSVGElement | null
  if (!scroll || !svg) return

  zoom.value = 1
  void nextTick().then(() => {
    const pad = 24
    const availH = scroll.clientHeight - pad
    const availW = scroll.clientWidth - pad
    if (availH <= 0) return

    let naturalW = 0
    let naturalH = 0
    try {
      const box = svg.getBBox()
      naturalW = box.width
      naturalH = box.height
    } catch {
      const r = svg.getBoundingClientRect()
      naturalW = r.width
      naturalH = r.height
    }
    if (naturalH <= 0 || naturalW <= 0) return

    const scaleH = availH / naturalH
    const scaleW = availW / naturalW
    const fit = Math.min(scaleH, scaleW)
    const nextZoom = Math.max(0.18, Math.round(fit * 100) / 100)
    fitZoom.value = nextZoom
    zoom.value = nextZoom
    panX.value = 0
    panY.value = 0
  })
}

function resetPan() {
  panX.value = 0
  panY.value = 0
}

function onPointerDown(e: PointerEvent) {
  if (!canPan.value || e.button !== 0) return
  isDragging.value = true
  dragStart = { x: e.clientX, y: e.clientY, panX: panX.value, panY: panY.value }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!isDragging.value) return
  panX.value = dragStart.panX + (e.clientX - dragStart.x)
  panY.value = dragStart.panY + (e.clientY - dragStart.y)
}

function onPointerUp(e: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  try {
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
}

function zoomIn() {
  userZoomed.value = true
  zoom.value = Math.min(2, Math.round((zoom.value + 0.12) * 100) / 100)
}

function zoomOut() {
  userZoomed.value = true
  zoom.value = Math.max(0.18, Math.round((zoom.value - 0.12) * 100) / 100)
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.source)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    /* ignore */
  }
}

function download() {
  if (activeTab.value === 'chart') {
    downloadSvg()
  } else {
    downloadSource()
  }
}

function downloadSvg() {
  const svg = chartRef.value?.querySelector('svg')
  if (!svg) return
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const blob = new Blob(
    [`<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`],
    { type: 'image/svg+xml;charset=utf-8' },
  )
  triggerDownload(blob, `diagram-${Date.now()}.svg`)
}

function downloadSource() {
  const blob = new Blob([props.source], { type: 'text/plain;charset=utf-8' })
  triggerDownload(blob, `diagram-${Date.now()}.mmd`)
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function syncFullscreenState() {
  isFullscreen.value = document.fullscreenElement === wrapRef.value
  if (activeTab.value === 'chart' && !userZoomed.value) {
    void nextTick(() => fitChartToViewport())
  }
}

async function toggleFullscreen() {
  const el = wrapRef.value
  if (!el) return
  if (!document.fullscreenElement) {
    await el.requestFullscreen()
  } else {
    await document.exitFullscreen()
  }
  syncFullscreenState()
}

watch(zoom, (z) => {
  if (z <= fitZoom.value + 0.008) resetPan()
})

watch(
  () => props.source,
  async () => {
    userZoomed.value = false
    if (activeTab.value === 'chart') await renderChart()
  },
)

let resizeObserver: ResizeObserver | null = null

function setupResizeObserver() {
  resizeObserver?.disconnect()
  const scroll = scrollRef.value
  if (!scroll) return
  resizeObserver = new ResizeObserver(() => {
    if (activeTab.value === 'chart' && !userZoomed.value) fitChartToViewport()
  })
  resizeObserver.observe(scroll)
}

watch(activeTab, async (tab) => {
  if (tab === 'chart') {
    userZoomed.value = false
    await nextTick()
    setupResizeObserver()
    await renderChart()
  }
})

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreenState)
  setupResizeObserver()
  if (activeTab.value === 'chart') void renderChart()
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  resizeObserver?.disconnect()
})
</script>

<template>
  <div ref="wrapRef" class="mermaid-card">
    <header class="mermaid-toolbar">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'chart' }"
          @click="activeTab = 'chart'"
        >
          图表
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'code' }"
          @click="activeTab = 'code'"
        >
          代码
        </button>
      </div>

      <div class="actions">
        <template v-if="activeTab === 'chart'">
          <button type="button" class="icon-btn" title="缩小" @click="zoomOut">
            <ZoomOut :size="18" />
          </button>
          <button type="button" class="icon-btn" title="放大" @click="zoomIn">
            <ZoomIn :size="18" />
          </button>
          <span class="divider" />
        </template>
        <template v-else>
          <button type="button" class="text-btn" @click="copyCode">
            <Check v-if="copied" :size="15" />
            <Copy v-else :size="15" />
            {{ copied ? '已复制' : '复制' }}
          </button>
        </template>
        <button type="button" class="text-btn" @click="download">
          <Download :size="15" />
          下载
        </button>
        <button type="button" class="text-btn" @click="toggleFullscreen">
          <Minimize2 v-if="isFullscreen" :size="15" />
          <Maximize2 v-else :size="15" />
          {{ isFullscreen ? '缩小' : '全屏' }}
        </button>
      </div>
    </header>

    <div v-show="activeTab === 'chart'" class="chart-panel">
      <div v-if="renderError" class="chart-error">{{ renderError }}</div>
      <LoadingIndicator v-else-if="isRendering" label="渲染中…" variant="block" class="chart-loading" />
      <div
        ref="scrollRef"
        class="chart-viewport"
        :class="{ draggable: canPan, dragging: isDragging }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div class="chart-zoom-wrap" :style="chartTransform">
          <div ref="chartRef" class="chart-canvas" />
        </div>
      </div>
    </div>

    <pre v-show="activeTab === 'code'" class="code-panel"><code v-html="highlightedCode" /></pre>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.mermaid-card {
  margin: 0.85em 0 1em;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #f7f7f8;
  overflow: hidden;
  box-shadow: $shadow-sm;

  &:fullscreen {
    border-radius: 0;
    display: flex;
    flex-direction: column;

    .chart-panel,
    .code-panel {
      flex: 1;
      max-height: none;
    }

    .chart-panel {
      height: auto;
      flex: 1;
    }

    .chart-viewport {
      overflow: hidden;
    }
  }
}

.mermaid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
}

.tab {
  padding: 6px 16px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: $text-secondary;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;

  &:hover:not(.active) {
    color: $text-primary;
  }

  &.active {
    background: #fff;
    color: $text-primary;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
}

.actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-btn,
.text-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 13px;
  color: $text-secondary;
  cursor: pointer;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: $text-primary;
  }
}

.icon-btn {
  padding: 6px 8px;
}

.divider {
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: rgba(0, 0, 0, 0.12);
}

.chart-panel {
  height: 240px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
}

.chart-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 12px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  touch-action: none;
  user-select: none;

  &.draggable {
    cursor: grab;
  }

  &.dragging {
    cursor: grabbing;
  }
}

.chart-zoom-wrap {
  display: inline-block;
  flex-shrink: 0;
  will-change: transform;
}

.chart-canvas {
  display: inline-block;
  padding: 0;

  :deep(svg) {
    display: block;
    margin: 0;
  }

  :deep(.cluster rect) {
    fill: #fffef5 !important;
    stroke: #d9cc6b !important;
    stroke-width: 1px !important;
  }

  :deep(.node rect),
  :deep(.node polygon) {
    fill: #f0ecfa !important;
    stroke: #b5a3d6 !important;
    stroke-width: 1px !important;
  }

  :deep(.edgePath .path),
  :deep(path.flowchart-link) {
    stroke: #222 !important;
    stroke-width: 1.2px !important;
  }

  :deep(.nodeLabel),
  :deep(.cluster-label) {
    color: #1a1a1a !important;
    font-family: $font-sans !important;
  }

  :deep(.cluster-label .nodeLabel) {
    font-weight: 600 !important;
  }
}

.chart-error {
  padding: 16px;
  color: $color-warning;
  font-size: 13px;
}

.chart-loading {
  padding: 28px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}

.code-panel {
  margin: 0;
  padding: 16px 18px;
  background: #f5f5f6;
  font-size: 13px;
  line-height: 1.65;
  overflow: auto;
  max-height: min(70vh, 480px);

  code {
    display: block;
    font-family: ui-monospace, 'SF Mono', Menlo, 'Consolas', monospace;
    white-space: pre;
    color: #1a1a1a;

    :deep(.hl-kw) {
      color: #7c3aed;
      font-weight: 500;
    }

    :deep(.hl-id),
    :deep(.hl-label) {
      color: #16a34a;
    }

    :deep(.hl-arrow) {
      color: #1a1a1a;
    }
  }
}
</style>
