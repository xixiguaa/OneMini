<script setup lang="ts">
import * as d3 from 'd3'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { WikiGraphEdge, WikiGraphNode } from '../api/wiki'

const props = defineProps<{
  nodes: WikiGraphNode[]
  edges: WikiGraphEdge[]
  selectedId?: string | null
}>()

const emit = defineEmits<{
  select: [id: string | null]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)

/** 深空极光图谱色板 */
const TYPE_COLORS: Record<string, string> = {
  raw: '#6b6b8a',
  raw_extract: '#5a5a78',
  entity: '#7b5fff',
  concept: '#1fffd4',
  source: '#ffb830',
  synthesis: '#826afb',
  query: '#ff5c7a',
  meta: '#a0a0c0',
  unknown: '#6b6b8a',
}

const BG_GRAPH = '#0d0d1a'
/** 默认连线/箭头（无 hover） */
const DIM_LINK = '#2a2a4a'
const LINK_IDLE_OPACITY = 0.38
const ARROW_IDLE_OPACITY = 0.34
/** 图谱聚焦/悬停高亮色（连线） */
const OBSIDIAN_FOCUS = '#7b5fff'
/** Obsidian 图谱悬停/聚焦过渡（偏慢、ease-out） */
const HOVER_ANIM_MS = 280
const HOVER_EASE = d3.easeCubicOut
/** 聚焦时非相邻元素的淡化强度 */
const DIM_LINK_OPACITY = 0.14
const DIM_ARROW_OPACITY = 0.22
const DIM_NODE_OPACITY = 0.48
/** 静止时几乎不加热力模拟（Obsidian 图谱默认较稳） */
const LIVING_ALPHA_TARGET = 0.006
/** 缩小到此比例以下隐藏标签（Obsidian 风格） */
const LABEL_ZOOM_MIN = 0.52
/** 轻微布朗运动（仅布局稳定后、非拖拽时） */
const BROWNIAN_FORCE = 0.0035
const BREATH_AMP = 0.012
const PULSE_AMP = 0.022
const SIM_VELOCITY_IDLE = 0.62
const SIM_VELOCITY_DRAG = 0.72
const MAX_NODE_SPEED_IDLE = 0.72
const MAX_NODE_SPEED_DRAG = 1.85
/** llm-wiki/.obsidian/graph.json 近似参数 */
const OBS_LINK_DISTANCE = 250
const OBS_LINK_STRENGTH = 0.92
const OBS_REPEL_STRENGTH = -10 * 18
const OBS_CENTER_STRENGTH = 0.52
const DRAG_ALPHA_TARGET = 0.14
const SETTLE_ALPHA = 0.22
/** 松手后邻居轻微惯性（Obsidian 拖放余波） */
const RIPPLE_ON_DROP = 0.028
/** 碰撞留白（略加大间距，减轻拥挤） */
const COLLISION_PAD = 46
/** 发丝连线 */
const LINK_STROKE_WIDTH = 0.38

const TYPE_LABELS: Record<string, string> = {
  raw: 'Raw 原始文件',
  raw_extract: 'Raw 提取文本',
  entity: '实体',
  concept: '概念',
  source: '来源摘要',
  synthesis: '综合输出',
  query: '查询沉淀',
  meta: '目录页',
  unknown: '未知',
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  type: string
  r: number
  depth: number
  showLabel: boolean
  /** 节点脉动相位 */
  pulsePhase?: number
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  edgeType: string
}

let simulation: d3.Simulation<SimNode, SimLink> | null = null
let linkForce: d3.ForceLink<SimNode, SimLink> | null = null
let chargeForce: d3.ForceManyBody<SimNode> | null = null
let collisionForce: d3.ForceCollide<SimNode> | null = null
let hubIdRef: string | null = null
let animTime = 0
let layoutSettled = false
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let gMain: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let linkSel: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null = null
let arrowDimSel: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown> | null = null
let linkHotSel: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null = null
let arrowHotSel: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown> | null = null
let nodeSel: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null = null
let labelSel: d3.Selection<SVGTextElement, SimNode, SVGGElement, unknown> | null = null
let graphLinks: SimLink[] = []
let nodeById = new Map<string, SimNode>()
let hoverId: string | null = null
/** 拖动中的焦点节点（紫色连线，保留类型色） */
let dragFocusId: string | null = null
/** 拖动任一节点时禁用其它节点的 hover */
let dragHoverLocked = false
/** 邻接表：加速聚焦高亮判断 */
let neighborIndex = new Map<string, Set<string>>()
let dragPaintQueued = false
let pointerDownX = 0
let pointerDownY = 0
let pointerMoved = false
const CLICK_DRAG_THRESHOLD = 5
let zoomScale = 1
let labelsWereVisible = true
let width = 0
let height = 0
let tickRaf = 0
let idleStopTimer: ReturnType<typeof setTimeout> | null = null
let simulationPaused = false
/** 箭头长度；底边半宽按 45° 顶角（tan(22.5°)）计算 */
const ARROW_LEN = 2
const ARROW_HALF_WIDTH = ARROW_LEN * Math.tan(Math.PI / 8)

/** 拖动 > 悬停 > 点击选中 */
function focusId() {
  return dragFocusId ?? hoverId ?? props.selectedId ?? null
}

function typeColor(d: SimNode) {
  return TYPE_COLORS[d.type] || TYPE_COLORS.unknown
}

function zoomShowsLabels() {
  return zoomScale >= LABEL_ZOOM_MIN
}

function syncZoomScaleFromSvg() {
  const svg = svgRef.value
  if (!svg || !zoomBehavior) return
  zoomScale = d3.zoomTransform(svg).k
  labelsWereVisible = zoomShowsLabels()
}

function setHoverHighlight(nodeId: string) {
  if (dragHoverLocked || hoverId === nodeId) return
  if (simulationPaused) wakeSimulation()
  hoverId = nodeId
  updateFocus(true)
}

function clearHoverHighlight() {
  if (dragHoverLocked || !hoverId) return
  hoverId = null
  updateFocus(true)
}

function withHoverAnim<T extends d3.BaseType, D, P extends d3.BaseType, U>(
  sel: d3.Selection<T, D, P, U> | null | undefined,
  animate: boolean,
  apply: (target: d3.Selection<T, D, P, U>) => void,
) {
  if (!sel?.size()) return
  const target = animate
    ? sel.transition().duration(HOVER_ANIM_MS).ease(HOVER_EASE)
    : sel
  apply(target as d3.Selection<T, D, P, U>)
}

function pulseScale(node: SimNode) {
  const phase = node.pulsePhase ?? 0
  return 1 + PULSE_AMP * Math.sin(animTime * 0.00115 + phase)
}

function nodeDrawRadius(node: SimNode) {
  return node.r * pulseScale(node)
}

function breathFactor() {
  return 1 + BREATH_AMP * Math.sin(animTime * 0.00072)
}

function forceBrownian() {
  let nodes: SimNode[] = []
  const force = (alpha: number) => {
    if (dragFocusId || !layoutSettled) return
    const scale = BROWNIAN_FORCE * alpha
    for (const n of nodes) {
      if (n.fx != null && n.fy != null) continue
      if (n.id === hubIdRef) continue
      n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * scale
      n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * scale
    }
  }
  force.initialize = (n: SimNode[]) => {
    nodes = n
  }
  return force
}

function rebuildNeighborIndex() {
  neighborIndex = new Map()
  const touch = (a: string, b: string) => {
    if (!neighborIndex.has(a)) neighborIndex.set(a, new Set())
    neighborIndex.get(a)!.add(b)
  }
  for (const l of graphLinks) {
    const s = linkEndpointId(l.source)
    const t = linkEndpointId(l.target)
    touch(s, t)
    touch(t, s)
  }
}

function scheduleDragPaint() {
  if (dragPaintQueued) return
  dragPaintQueued = true
  requestAnimationFrame(() => {
    dragPaintQueued = false
    if (!dragFocusId) return
    syncGraphVisuals(true)
  })
}

function collisionRadius(d: SimNode) {
  return d.r + COLLISION_PAD
}

function zeroNodeVelocities(keepHub = true) {
  for (const n of simulation?.nodes() ?? []) {
    if (keepHub && n.id === hubIdRef) continue
    n.vx = 0
    n.vy = 0
  }
}

function clearIdleStopTimer() {
  if (idleStopTimer) {
    clearTimeout(idleStopTimer)
    idleStopTimer = null
  }
}

function pauseSimulationWhenIdle() {
  clearIdleStopTimer()
  idleStopTimer = setTimeout(() => {
    if (!simulation || dragFocusId || hoverId) return
    simulation.alphaTarget(0)
    simulation.stop()
    simulationPaused = true
  }, 1800)
}

function wakeSimulation() {
  if (!simulation) return
  simulationPaused = false
  simulation.alphaTarget(LIVING_ALPHA_TARGET)
  if (simulation.alpha() < 0.02) simulation.alpha(0.08).restart()
  pauseSimulationWhenIdle()
}

function enableLivingMotion() {
  if (!simulation) return
  layoutSettled = true
  wakeSimulation()
}

function rippleNeighbors(node: SimNode, strength: number) {
  for (const nbId of neighborIndex.get(node.id) || []) {
    if (nbId === hubIdRef) continue
    const other = nodeById.get(nbId)
    if (!other || (other.fx != null && other.fy != null)) continue
    const dx = (other.x ?? 0) - (node.x ?? 0)
    const dy = (other.y ?? 0) - (node.y ?? 0)
    const len = Math.hypot(dx, dy) || 1
    other.vx = (other.vx ?? 0) + (dx / len) * strength
    other.vy = (other.vy ?? 0) + (dy / len) * strength
  }
}

function trimmedEndpoints(from: SimNode, to: SimNode, withArrow = true) {
  const x1 = from.x ?? 0
  const y1 = from.y ?? 0
  const x2 = to.x ?? 0
  const y2 = to.y ?? 0
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const startPad = nodeDrawRadius(from)
  /** 线段终点 = 箭头底边；尖端在目标圆周 */
  const endPad = nodeDrawRadius(to) + (withArrow ? ARROW_LEN : 0)
  if (len <= startPad + endPad) {
    return { x1, y1, x2, y2 }
  }
  return {
    x1: x1 + ux * startPad,
    y1: y1 + uy * startPad,
    x2: x2 - ux * endPad,
    y2: y2 - uy * endPad,
  }
}

/** 高亮时箭头指向焦点节点（Obsidian 风格） */
function orientedForFocus(d: SimLink, focus: string) {
  const s = d.source as SimNode
  const t = d.target as SimNode
  if (t.id === focus) return { from: s, to: t }
  if (s.id === focus) return { from: t, to: s }
  return { from: s, to: t }
}

function arrowPathAtBase(baseX: number, baseY: number, ux: number, uy: number) {
  const tipX = baseX + ux * ARROW_LEN
  const tipY = baseY + uy * ARROW_LEN
  const px = -uy * ARROW_HALF_WIDTH
  const py = ux * ARROW_HALF_WIDTH
  return `M${baseX - px},${baseY - py}L${tipX},${tipY}L${baseX + px},${baseY + py}Z`
}

function orientedLink(d: SimLink, focus?: string) {
  const s = d.source as SimNode
  const t = d.target as SimNode
  if (focus) return orientedForFocus(d, focus)
  return { from: s, to: t }
}

function linkEndpointId(endpoint: string | number | SimNode | undefined) {
  if (typeof endpoint === 'object' && endpoint && 'id' in endpoint) return endpoint.id
  return String(endpoint ?? '')
}

function nodeRadius(type: string) {
  if (type === 'meta') return 16
  if (type === 'source') return 11
  if (type === 'synthesis') return 9
  if (type === 'entity') return 8
  if (type === 'concept') return 11
  if (type === 'raw' || type === 'raw_extract') return 4
  return 6
}

function formatLabel(node: SimNode) {
  let t = node.title || node.id.split('/').pop() || node.id
  if (node.type === 'concept' && !t.startsWith('#')) {
    const slug = node.id.split('/').pop() || t
    if (slug.length <= 22) t = `#${slug}`
  }
  const max = node.type === 'source' || node.type === 'meta' ? 22 : 14
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function shouldShowLabel(type: string, _depth: number, degree: number) {
  if (type === 'meta' || type === 'source') return true
  if (type === 'synthesis' || type === 'entity') return degree >= 3
  if (type === 'concept') return degree >= 4
  return false
}

function computeDepths(
  hubId: string,
  nodeIds: Set<string>,
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const depth = new Map<string, number>()
  if (!nodeIds.has(hubId)) {
    for (const id of nodeIds) depth.set(id, 2)
    return depth
  }
  const q: string[] = [hubId]
  depth.set(hubId, 0)
  while (q.length) {
    const cur = q.shift()!
    const d = depth.get(cur)!
    for (const nb of adj.get(cur) || []) {
      if (!nodeIds.has(nb) || depth.has(nb)) continue
      depth.set(nb, d + 1)
      q.push(nb)
    }
  }
  for (const id of nodeIds) {
    if (!depth.has(id)) depth.set(id, 4)
  }
  return depth
}

function hashAngle(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h % 1000) / 1000) * Math.PI * 2
}

function buildGraphData(): { nodes: SimNode[]; links: SimLink[]; hubId: string | null } {
  const visible = props.nodes.filter((n) => n.type !== 'raw' && n.type !== 'raw_extract')
  const visibleIds = new Set(visible.map((n) => n.id))

  const degree = new Map<string, number>()
  for (const id of visibleIds) degree.set(id, 0)

  const adj = new Map<string, Set<string>>()
  const ensure = (id: string) => {
    if (!adj.has(id)) adj.set(id, new Set())
  }

  const links: SimLink[] = []
  for (const e of props.edges) {
    if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) continue
    if (e.type === 'extract_of') continue
    ensure(e.source)
    ensure(e.target)
    adj.get(e.source)!.add(e.target)
    adj.get(e.target)!.add(e.source)
    degree.set(e.source, (degree.get(e.source) || 0) + 1)
    degree.set(e.target, (degree.get(e.target) || 0) + 1)
    links.push({ source: e.source, target: e.target, edgeType: e.type } as SimLink)
  }

  let hubId: string | null = null
  if (visibleIds.has('wiki/index')) hubId = 'wiki/index'
  else {
    let best = 0
    for (const [id, deg] of degree) {
      if (deg > best) {
        best = deg
        hubId = id
      }
    }
  }

  const depths = computeDepths(hubId || '', visibleIds, adj)
  const cx = width / 2 || 400
  const cy = height / 2 || 300

  const nodes: SimNode[] = visible.map((n) => {
    const d = depths.get(n.id) ?? 3
    const deg = degree.get(n.id) || 0
    const r = nodeRadius(n.type)
    const angle = hashAngle(n.id)
    const ring = 130 + d * 156
    return {
      id: n.id,
      title: n.title || n.id.split('/').pop() || n.id,
      type: n.type || 'unknown',
      r,
      depth: d,
      showLabel: shouldShowLabel(n.type || 'unknown', d, deg),
      pulsePhase: hashAngle(n.id) * 2,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
    }
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const l of links) {
    const s = byId.get(linkEndpointId(l.source))
    const t = byId.get(linkEndpointId(l.target))
    if (s && t) {
      l.source = s
      l.target = t
    }
  }

  return { nodes, links, hubId }
}

function linkCoords(
  sel: d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null,
  opts?: { arrowTowardFocus?: string; withArrow?: boolean },
) {
  const withArrow = opts?.withArrow !== false
  sel?.each(function (d) {
    const oriented = orientedLink(d, opts?.arrowTowardFocus)
    const { x1, y1, x2, y2 } = trimmedEndpoints(oriented.from, oriented.to, withArrow)
    d3.select(this).attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
  })
}

function arrowCoords(
  sel: d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown> | null,
  opts?: { arrowTowardFocus?: string; withArrow?: boolean },
) {
  const withArrow = opts?.withArrow !== false
  sel?.each(function (d) {
    if (!withArrow) {
      d3.select(this).attr('d', null)
      return
    }
    const oriented = orientedLink(d, opts?.arrowTowardFocus)
    const { x2, y2 } = trimmedEndpoints(oriented.from, oriented.to, true)
    const dx = (oriented.to.x ?? 0) - (oriented.from.x ?? 0)
    const dy = (oriented.to.y ?? 0) - (oriented.from.y ?? 0)
    const len = Math.hypot(dx, dy) || 1
    d3.select(this).attr('d', arrowPathAtBase(x2, y2, dx / len, dy / len))
  })
}

function clampNodeVelocities() {
  const dragging = dragFocusId != null
  const maxV = dragging ? MAX_NODE_SPEED_DRAG : MAX_NODE_SPEED_IDLE
  for (const n of simulation?.nodes() ?? []) {
    if (n.id === hubIdRef) continue
    if (n.fx != null && n.fy != null && dragFocusId === n.id) continue
    let vx = n.vx ?? 0
    let vy = n.vy ?? 0
    const mag = Math.hypot(vx, vy)
    if (mag > maxV) {
      const s = maxV / mag
      n.vx = vx * s
      n.vy = vy * s
    }
  }
}

function updateLivingForces() {
  if (dragFocusId) {
    simulation?.alphaTarget(DRAG_ALPHA_TARGET)
    return
  }
  const breath = breathFactor()
  linkForce?.strength(OBS_LINK_STRENGTH * breath)
  chargeForce?.strength(OBS_REPEL_STRENGTH * breath)
  if (layoutSettled) {
    simulation?.alphaTarget(LIVING_ALPHA_TARGET)
  } else {
    simulation?.alphaTarget(0)
  }
}

function updateNodePulseVisuals() {
  const aid = focusId()
  if (!aid && simulationPaused) return
  nodeSel?.select('circle.halo').attr('r', (d) => d.r * pulseScale(d) * 1.75)
  nodeSel?.select('circle.core').attr('r', (d) => d.r * pulseScale(d))
  if (nodeSel) {
    nodeSel.select('circle.core').attr('opacity', (d) => nodeOpacity(d, aid))
    nodeSel.select('circle.halo').attr('opacity', (d) => {
      const base = nodeOpacity(d, aid) * 0.28
      return base + 0.06 * Math.sin(animTime * 0.0014 + (d.pulsePhase ?? 0))
    })
  }
}

function syncGraphVisuals(lite = false) {
  if (!lite) animTime = performance.now()
  const aid = focusId()
  const dimArrow = aid ? { withArrow: false } : undefined
  linkCoords(linkSel, dimArrow)
  arrowCoords(arrowDimSel, dimArrow)
  linkCoords(linkHotSel, aid ? { arrowTowardFocus: aid } : undefined)
  arrowCoords(arrowHotSel, aid ? { arrowTowardFocus: aid } : undefined)
  nodeSel?.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
  if (!lite || zoomShowsLabels()) {
    labelSel
      ?.attr('x', (d) => d.x ?? 0)
      .attr('y', (d) => (d.y ?? 0) + nodeDrawRadius(d) + 11)
  }
  if (!lite) updateNodePulseVisuals()
}

function ticked() {
  if (tickRaf) return
  tickRaf = requestAnimationFrame(() => {
    tickRaf = 0
    if (!simulation) return
    updateLivingForces()
    syncGraphVisuals()
    clampNodeVelocities()
  })
}

function isNodeNearFocus(nodeId: string) {
  const aid = focusId()
  if (!aid) return true
  if (nodeId === aid) return true
  return neighborIndex.get(aid)?.has(nodeId) ?? false
}

function nodeOpacity(d: SimNode, aid: string | null) {
  if (!aid) {
    if (d.type === 'meta' || d.type === 'source') return 0.92
    if (d.depth <= 1) return 0.78
    return 0.42
  }
  if (d.id === aid) return 1
  if (isNodeNearFocus(d.id)) return 0.96
  return DIM_NODE_OPACITY
}

function labelOpacity(d: SimNode, aid: string | null) {
  if (!zoomShowsLabels()) return 0
  const near = !!aid && (d.id === aid || isNodeNearFocus(d.id))
  if (aid) {
    if (!near) return d.showLabel ? 0.22 : 0
    return d.id === aid ? 1 : 0.88
  }
  if (!d.showLabel) return 0
  if (d.type === 'meta' || d.type === 'source') return 0.72
  return 0.38
}

function labelFill(d: SimNode, aid: string | null) {
  if (aid && (d.id === aid || isNodeNearFocus(d.id))) return '#e8eaed'
  return 'rgba(180, 188, 184, 0.75)'
}

function updateFocus(animate = false) {
  const aid = focusId()

  const hotLinks = aid ? graphLinks.filter(isLinkedToFocus) : []
  const linkKey = (d: SimLink) => `${linkEndpointId(d.source)}-${linkEndpointId(d.target)}`

  if (linkHotSel) {
    const joined = linkHotSel.data(hotLinks, linkKey).join(
      (enter) =>
        enter
          .append('line')
          .attr('stroke', OBSIDIAN_FOCUS)
          .attr('stroke-linecap', 'butt')
          .attr('stroke-width', LINK_STROKE_WIDTH)
          .attr('stroke-opacity', 0)
          .attr('pointer-events', 'none'),
      (update) => update,
      (exit) => exit.remove(),
    )
    linkHotSel = joined as typeof linkHotSel
    linkCoords(linkHotSel, aid ? { arrowTowardFocus: aid } : undefined)
    linkHotSel.raise()
    withHoverAnim(linkHotSel, animate, (t) => t.attr('stroke-opacity', 0.85))
  }

  if (arrowHotSel) {
    const joined = arrowHotSel.data(hotLinks, linkKey).join(
      (enter) =>
        enter
          .append('path')
          .attr('fill', OBSIDIAN_FOCUS)
          .attr('fill-opacity', 0)
          .attr('pointer-events', 'none'),
      (update) => update,
      (exit) => exit.remove(),
    )
    arrowHotSel = joined as typeof arrowHotSel
    arrowCoords(arrowHotSel, aid ? { arrowTowardFocus: aid } : undefined)
    arrowHotSel.raise()
    withHoverAnim(arrowHotSel, animate, (t) => t.attr('fill-opacity', 0.85))
  }

  const dimArrow = aid ? { withArrow: false } : undefined
  const dimLinkOpacity = aid ? DIM_LINK_OPACITY : LINK_IDLE_OPACITY
  const dimArrowOpacity = aid ? DIM_ARROW_OPACITY : ARROW_IDLE_OPACITY
  withHoverAnim(linkSel, animate, (t) => {
    t.attr('stroke', DIM_LINK)
      .attr('stroke-opacity', dimLinkOpacity)
      .attr('stroke-width', LINK_STROKE_WIDTH)
  })
  linkCoords(linkSel, dimArrow)
  withHoverAnim(arrowDimSel, animate, (t) => {
    t.attr('fill', DIM_LINK).attr('fill-opacity', dimArrowOpacity)
  })
  arrowCoords(arrowDimSel, dimArrow)

  nodeSel?.each(function (d) {
    const g = d3.select(this)
    const near = !aid || d.id === aid || isNodeNearFocus(d.id)
    if (aid && near) g.raise()
  })

  withHoverAnim(nodeSel?.select('circle.core'), animate, (t) => {
    t.attr('r', (d) => d.r * pulseScale(d))
      .attr('fill', (d) => typeColor(d))
      .attr('opacity', (d) => nodeOpacity(d, aid))
      .attr('stroke', 'none')
  })
  nodeSel?.select('circle.halo').attr('opacity', (d) => nodeOpacity(d, aid) * 0.26)

  labelSel?.each(function (d) {
    const near = !aid || d.id === aid || isNodeNearFocus(d.id)
    if (aid && near) d3.select(this).raise()
  })

  withHoverAnim(labelSel, animate, (t) => {
    t.attr('opacity', (d) => labelOpacity(d, aid))
      .attr('fill', (d) => labelFill(d, aid))
      .attr('font-weight', 400)
      .attr('font-size', (d) => (d.type === 'source' ? 10.5 : 9.5))
  })
}

function isLinkedToFocus(d: SimLink) {
  const aid = focusId()
  if (!aid) return false
  return linkEndpointId(d.source) === aid || linkEndpointId(d.target) === aid
}

function renderGraph() {
  const svg = svgRef.value
  const container = containerRef.value
  if (!svg || !container) return

  width = container.clientWidth
  height = container.clientHeight
  d3.select(svg).attr('width', width).attr('height', height)

  const { nodes, links, hubId } = buildGraphData()
  graphLinks = links
  nodeById = new Map(nodes.map((n) => [n.id, n]))
  hoverId = null
  dragFocusId = null
  dragHoverLocked = false
  dragPaintQueued = false
  zoomScale = 1
  labelsWereVisible = true
  layoutSettled = false
  hubIdRef = hubId
  rebuildNeighborIndex()

  if (simulation) simulation.stop()
  clearIdleStopTimer()
  if (tickRaf) {
    cancelAnimationFrame(tickRaf)
    tickRaf = 0
  }
  simulationPaused = false

  const svgSel = d3.select(svg)
  svgSel.selectAll('*').remove()

  const defs = svgSel.append('defs')
  const vignette = defs
    .append('radialGradient')
    .attr('id', 'bg-vignette')
    .attr('cx', '50%')
    .attr('cy', '50%')
    .attr('r', '68%')
  vignette.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(18, 22, 28, 0)')
  vignette.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(0, 0, 0, 0.55)')
  const glowFilter = defs
    .append('filter')
    .attr('id', 'node-glow')
    .attr('x', '-120%')
    .attr('y', '-120%')
    .attr('width', '340%')
    .attr('height', '340%')
  glowFilter.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '3.2').attr('result', 'b')
  glowFilter
    .append('feColorMatrix')
    .attr('in', 'b')
    .attr('type', 'matrix')
    .attr('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0')
    .attr('result', 'g')
  const glowMerge = glowFilter.append('feMerge')
  glowMerge.append('feMergeNode').attr('in', 'g')
  glowMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  svgSel.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', BG_GRAPH)
  svgSel
    .append('rect')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('fill', 'url(#bg-vignette)')
    .attr('pointer-events', 'none')

  gMain = svgSel.append('g').attr('class', 'graph-root')

  linkSel = gMain
    .append('g')
    .attr('class', 'links-dim')
    .selectAll<SVGLineElement, SimLink>('line')
    .data(links)
    .join('line')
    .attr('stroke', DIM_LINK)
    .attr('stroke-linecap', 'round')
    .attr('stroke-width', LINK_STROKE_WIDTH)
    .attr('stroke-opacity', LINK_IDLE_OPACITY)
    .attr('pointer-events', 'none')

  arrowDimSel = gMain
    .append('g')
    .attr('class', 'arrows-dim')
    .selectAll<SVGPathElement, SimLink>('path')
    .data(links)
    .join('path')
    .attr('fill', DIM_LINK)
    .attr('fill-opacity', ARROW_IDLE_OPACITY)
    .attr('pointer-events', 'none')

  nodeSel = gMain
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGGElement, SimNode>('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .call(
      d3
        .drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (event.sourceEvent) event.sourceEvent.stopPropagation()
          clearIdleStopTimer()
          simulationPaused = false
          pointerDownX = event.x
          pointerDownY = event.y
          pointerMoved = false
          dragHoverLocked = true
          dragFocusId = d.id
          d.vx = 0
          d.vy = 0
          updateFocus(false)
          collisionForce?.iterations(1)
          simulation?.velocityDecay(SIM_VELOCITY_DRAG)
          if (!event.active) simulation?.alphaTarget(DRAG_ALPHA_TARGET).alpha(0.35).restart()
          d.fx = d.x
          d.fy = d.y
          scheduleDragPaint()
        })
        .on('drag', (event, d) => {
          if (
            Math.hypot(event.x - pointerDownX, event.y - pointerDownY) > CLICK_DRAG_THRESHOLD
          ) {
            pointerMoved = true
          }
          d.fx = event.x
          d.fy = event.y
          d.x = event.x
          d.y = event.y
          d.vx = 0
          d.vy = 0
          scheduleDragPaint()
        })
        .on('end', (event, d) => {
          dragHoverLocked = false
          dragFocusId = null
          collisionForce?.iterations(3)
          if (d.id === hubId) {
            d.fx = width / 2
            d.fy = height / 2
            d.x = width / 2
            d.y = height / 2
          } else {
            d.fx = null
            d.fy = null
            rippleNeighbors(d, RIPPLE_ON_DROP)
          }
          simulation?.velocityDecay(SIM_VELOCITY_IDLE)
          if (!event.active) {
            simulation?.alphaTarget(0).alpha(SETTLE_ALPHA).restart()
          }
          updateFocus(true)
          syncGraphVisuals()
          if (!pointerMoved) {
            emit('select', d.id)
          }
        }),
    )
    .on('mouseenter', (_event, d) => {
      setHoverHighlight(d.id)
    })
    .on('mouseleave', () => {
      clearHoverHighlight()
    })

  nodeSel
    .append('circle')
    .attr('class', 'hit')
    .attr('r', (d) => d.r + 14)
    .attr('fill', 'transparent')
    .attr('stroke', 'none')
    .attr('pointer-events', 'all')

  nodeSel
    .append('circle')
    .attr('class', 'halo')
    .attr('r', (d) => d.r * 1.75)
    .attr('fill', (d) => typeColor(d))
    .attr('opacity', 0.24)
    .attr('filter', 'url(#node-glow)')
    .attr('pointer-events', 'none')

  nodeSel
    .append('circle')
    .attr('class', 'core')
    .attr('r', (d) => d.r)
    .attr('fill', (d) => TYPE_COLORS[d.type] || TYPE_COLORS.unknown)
    .attr('pointer-events', 'none')

  nodeSel
    .append('title')
    .text((d) => `${d.title}\n${TYPE_LABELS[d.type] || d.type}\n${d.id}`)

  linkHotSel = gMain
    .append('g')
    .attr('class', 'links-hot')
    .selectAll<SVGLineElement, SimLink>('line')
    .data([] as SimLink[])
    .join('line') as d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>

  arrowHotSel = gMain
    .append('g')
    .attr('class', 'arrows-hot')
    .selectAll<SVGPathElement, SimLink>('path')
    .data([] as SimLink[])
    .join('path') as d3.Selection<SVGPathElement, SimLink, SVGGElement, unknown>

  labelSel = gMain
    .append('g')
    .attr('class', 'labels')
    .attr('pointer-events', 'none')
    .selectAll<SVGTextElement, SimNode>('text')
    .data(nodes)
    .join('text')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'hanging')
    .attr('font-family', 'system-ui, -apple-system, sans-serif')
    .attr('font-size', (d) => (d.type === 'meta' || d.type === 'source' ? 10.5 : 9.5))
    .attr('font-weight', 400)
    .attr('fill', 'rgba(180, 188, 184, 0.75)')
    .text((d) => formatLabel(d))

  const hub = hubId ? nodes.find((n) => n.id === hubId) : null
  if (hub) {
    hub.fx = width / 2
    hub.fy = height / 2
  }

  linkForce = d3
    .forceLink<SimNode, SimLink>(links)
    .id((d) => d.id)
    .distance((d) => {
      const a = d.source as SimNode
      const b = d.target as SimNode
      const gap = Math.abs(a.depth - b.depth)
      return OBS_LINK_DISTANCE + gap * 18 + (a.type === 'source' || b.type === 'source' ? 24 : 0)
    })
    .strength(OBS_LINK_STRENGTH)

  chargeForce = d3.forceManyBody<SimNode>().strength(OBS_REPEL_STRENGTH).distanceMax(720)

  collisionForce = d3
    .forceCollide<SimNode>()
    .radius(collisionRadius)
    .strength(0.85)
    .iterations(3)

  simulation = d3
    .forceSimulation(nodes)
    .force('link', linkForce)
    .force('charge', chargeForce)
    .force('brownian', forceBrownian())
    .force(
      'radial',
      d3
        .forceRadial<SimNode>(
          (d) => 100 + d.depth * 138,
          width / 2,
          height / 2,
        )
        .strength(0.42),
    )
    .force('center', d3.forceCenter(width / 2, height / 2).strength(OBS_CENTER_STRENGTH * 0.08))
    .force('collision', collisionForce)
    .alpha(0.52)
    .alphaDecay(0.048)
    .velocityDecay(SIM_VELOCITY_IDLE)
    .on('tick', ticked)

  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.12, 3.5])
    .on('zoom', (event) => {
      gMain?.attr('transform', event.transform)
      zoomScale = event.transform.k
      if (simulationPaused) wakeSimulation()
      const visible = zoomShowsLabels()
      if (visible !== labelsWereVisible) {
        labelsWereVisible = visible
        updateFocus(false)
      }
    })

  svgSel.call(zoomBehavior).on('click', () => {
    clearHoverHighlight()
    emit('select', null)
  })

  simulation.on('end', () => {
    if (!layoutSettled) {
      layoutSettled = true
      zeroNodeVelocities()
    }
    if (hub) {
      hub.fx = width / 2
      hub.fy = height / 2
    }
    if (!dragFocusId) {
      enableLivingMotion()
    }
  })

  if (nodes.length) {
    setTimeout(() => fitView(), 480)
  }
  updateFocus()
}

function fitView() {
  const svg = svgRef.value
  const container = containerRef.value
  if (!svg || !container || !gMain || !zoomBehavior) return

  const nodes = simulation?.nodes() || []
  if (!nodes.length) return

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const x = n.x ?? width / 2
    const y = n.y ?? height / 2
    const pad = n.r + (n.showLabel ? 28 : 8)
    minX = Math.min(minX, x - pad)
    maxX = Math.max(maxX, x + pad)
    minY = Math.min(minY, y - pad)
    maxY = Math.max(maxY, y + pad)
  }

  const margin = 56
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY, 1.15)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const transform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(scale)
    .translate(-cx, -cy)

  d3.select(svg)
    .transition()
    .duration(500)
    .call(zoomBehavior.transform, transform)
    .on('end', () => {
      syncZoomScaleFromSvg()
      updateFocus(false)
    })
}

watch(
  () => [props.nodes, props.edges] as const,
  () => renderGraph(),
)

watch(
  () => props.selectedId,
  () => {
    if (simulationPaused) wakeSimulation()
    updateFocus(true)
  },
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  renderGraph()
  containerRef.value?.addEventListener('mouseenter', wakeSimulation)
  resizeObserver = new ResizeObserver(() => {
    const c = containerRef.value
    if (!c) return
    const w = c.clientWidth
    const h = c.clientHeight
    if (w !== width || h !== height) {
      width = w
      height = h
      d3.select(svgRef.value!).attr('width', w).attr('height', h)
      simulation?.force('center', d3.forceCenter(w / 2, h / 2))
      simulation?.force(
        'radial',
        d3.forceRadial<SimNode>((d) => 88 + d.depth * 125, w / 2, h / 2).strength(0.88),
      )
      const hub = simulation?.nodes().find((n) => n.id === 'wiki/index')
      if (hub) {
        hub.fx = w / 2
        hub.fy = h / 2
      }
      zeroNodeVelocities()
      simulation?.alpha(0.12).restart()
    }
  })
  if (containerRef.value) resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  containerRef.value?.removeEventListener('mouseenter', wakeSimulation)
  clearIdleStopTimer()
  if (tickRaf) cancelAnimationFrame(tickRaf)
  simulation?.stop()
  resizeObserver?.disconnect()
})

defineExpose({ fitView })
</script>

<template>
  <div ref="containerRef" class="graph-canvas-wrap">
    <svg ref="svgRef" class="graph-svg" />
    <p v-if="!nodes.length" class="graph-empty">
      上传 raw 文件（md / pdf / Word / Excel 等）或重建图谱后，节点将显示于此
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.graph-canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #0d0d1a;
  box-shadow: inset 0 0 100px rgba(0, 0, 0, 0.38);
}

.graph-svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
  shape-rendering: geometricPrecision;

  &:active {
    cursor: grabbing;
  }
}

.graph-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: rgba(200, 210, 205, 0.55);
  pointer-events: none;
}
</style>
