import type { ChatMessage, MessageRole, WorkingMemoryState } from '../types/agent'
import { randomUUID } from '../utils/uuid'

/** 消息节点 (MessageNode)：DAG 中的一条消息，通过 parentId 挂接 */
export type MessageNode = ChatMessage

/** 分支时间线 (BranchTimeline)：当前激活路径上的有序节点 */
export interface BranchTimeline {
  path: MessageNode[]
  activeLeafId: string | null
}

export interface BranchVariantGroup {
  parentId: string | null
  role: MessageRole
  variants: MessageNode[]
  activeVariantId: string
}

function byTime(a: MessageNode, b: MessageNode) {
  return (a.timestamp || 0) - (b.timestamp || 0)
}

/** 将无 parentId 的线性历史迁移为链式 DAG */
export function normalizeToGraph(messages: MessageNode[]): MessageNode[] {
  if (!messages.length) return []
  const hasGraph = messages.some((m) => m.parentId != null)
  if (hasGraph) return messages.map((m) => ({ ...m }))

  let prevId: string | null = null
  return messages.map((m) => {
    const parentId = prevId
    prevId = m.id
    return {
      ...m,
      parentId: parentId ?? undefined,
      branchRootId: m.role === 'user' && !parentId ? m.id : m.branchRootId,
      variantIndex: m.variantIndex ?? (m.role === 'assistant' && parentId ? 0 : undefined),
    }
  })
}

export function indexNodes(messages: MessageNode[]): Map<string, MessageNode> {
  return new Map(messages.map((m) => [m.id, m]))
}

/** 从叶子回溯到根，构成激活路径 */
export function buildActivePath(
  messages: MessageNode[],
  leafId: string | null,
): MessageNode[] {
  const nodes = normalizeToGraph(messages)
  if (!nodes.length) return []

  const byId = indexNodes(nodes)
  let leaf = leafId ? byId.get(leafId) : undefined
  if (!leaf) leaf = resolveDefaultLeaf(nodes)

  const path: MessageNode[] = []
  const seen = new Set<string>()
  let cur: MessageNode | undefined = leaf

  while (cur) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    path.unshift(cur)
    if (!cur.parentId) break
    cur = byId.get(cur.parentId)
  }
  return path
}

/** 默认叶子：时间序最后一条，若其有兄弟则取同 parent 下最新 assistant/user */
export function resolveDefaultLeaf(messages: MessageNode[]): MessageNode | undefined {
  const nodes = normalizeToGraph(messages)
  if (!nodes.length) return undefined
  const sorted = [...nodes].sort(byTime)
  return sorted[sorted.length - 1]
}

/** UI 时间线：按时间展示全部节点（含重新生成的旧回答），不隐藏分支 */
export function buildDisplayTimeline(messages: MessageNode[]): MessageNode[] {
  return [...normalizeToGraph(messages)].sort(byTime)
}

export function buildBranchTimeline(
  messages: MessageNode[],
  activeLeafId: string | null,
): BranchTimeline {
  const path = buildActivePath(messages, activeLeafId)
  const leaf = path.length ? path[path.length - 1] : null
  return {
    path,
    activeLeafId: leaf?.id ?? activeLeafId,
  }
}

/** 同 parent 下的平行版本（用于 v1/v2 切换） */
export function getSiblingVariants(
  messages: MessageNode[],
  nodeId: string,
): MessageNode[] {
  const byId = indexNodes(normalizeToGraph(messages))
  const node = byId.get(nodeId)
  if (!node) return []

  const parentKey = node.parentId ?? null
  return normalizeToGraph(messages)
    .filter((m) => m.role === node.role && (m.parentId ?? null) === parentKey)
    .sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0) || byTime(a, b))
}

export function nextVariantIndex(messages: MessageNode[], parentId: string | null, role: MessageRole) {
  const siblings = normalizeToGraph(messages).filter(
    (m) => m.role === role && (m.parentId ?? null) === parentId,
  )
  if (!siblings.length) return 0
  return Math.max(...siblings.map((m) => m.variantIndex ?? 0)) + 1
}

/** 切换分支：选中某版本后，沿该节点向下走到当前分支的最新叶 */
export function resolveLeafForBranch(
  messages: MessageNode[],
  selectedNodeId: string,
): string {
  const nodes = normalizeToGraph(messages)
  const byId = indexNodes(nodes)
  const selected = byId.get(selectedNodeId)
  if (!selected) return selectedNodeId

  const childrenOf = (id: string) =>
    nodes.filter((m) => m.parentId === id).sort(byTime)

  let cur = selected
  for (;;) {
    const kids = childrenOf(cur.id)
    if (!kids.length) return cur.id
    const onPath = buildActivePath(messages, resolveDefaultLeaf(messages)?.id ?? null)
    const onPathIds = new Set(onPath.map((m) => m.id))
    const preferred = kids.find((k) => onPathIds.has(k.id)) ?? kids[kids.length - 1]
    cur = preferred
  }
}

export function attachNode(
  messages: MessageNode[],
  node: Omit<MessageNode, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
  parentId: string | null,
): { messages: MessageNode[]; nodeId: string } {
  const id = node.id ?? randomUUID()
  const branchRootId =
    node.role === 'user' && !parentId
      ? id
      : node.branchRootId ??
        (parentId
          ? normalizeToGraph(messages).find((m) => m.id === parentId)?.branchRootId
          : undefined)

  const full: MessageNode = {
    ...node,
    id,
    timestamp: node.timestamp ?? Date.now(),
    parentId: parentId ?? undefined,
    branchRootId,
    variantIndex:
      node.variantIndex ??
      (node.role === 'assistant' || node.role === 'user'
        ? nextVariantIndex(messages, parentId, node.role)
        : undefined),
  } as MessageNode

  return { messages: [...messages, full], nodeId: id }
}

export function mergeWorkingMemoryFromMessages(
  messages: MessageNode[],
  existing?: WorkingMemoryState,
): WorkingMemoryState | undefined {
  const sorted = [...normalizeToGraph(messages)].sort(byTime)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const wm = sorted[i].metadata?.workingMemory
    if (wm) return wm
  }
  return existing
}
