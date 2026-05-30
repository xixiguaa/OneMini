import type { Conversation, ConversationGroup, ConversationTimeGroup } from '../types/agent'

export const TIME_GROUP_ORDER: ConversationTimeGroup[] = [
  'today',
  'yesterday',
  'last7days',
  'last30days',
  'older',
]

export function getClientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function localDateKey(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function daysBeforeToday(ms: number, timezone: string): number {
  const todayKey = localDateKey(Date.now(), timezone)
  const targetKey = localDateKey(ms, timezone)
  if (targetKey === todayKey) return 0

  const parseKey = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.floor((parseKey(todayKey) - parseKey(targetKey)) / 86_400_000)
}

/** 按本地时区将时间戳归入侧栏历史分组 */
export function classifyTimeGroup(
  updatedAtMs: number,
  timezone = getClientTimezone(),
): ConversationTimeGroup {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) return 'older'

  const days = daysBeforeToday(updatedAtMs, timezone)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 7) return 'last7days'
  if (days <= 30) return 'last30days'
  return 'older'
}

/** 用于分组的参考时间：优先 updatedAt，回退 createdAt / 消息时间戳 */
export function conversationGroupTimestamp(conv: Conversation): number {
  const tz = getClientTimezone()
  const updated = conv.updatedAt || 0
  const created = conv.createdAt || 0
  const messageTs = conv.messages
    .map((m) => m.timestamp)
    .filter((t) => Number.isFinite(t) && t > 0)
  const earliestMessage = messageTs.length ? Math.min(...messageTs) : 0

  const candidates = [earliestMessage, created, updated].filter((t) => t > 0)
  if (!candidates.length) return 0

  if (updated > 0 && classifyTimeGroup(updated, tz) === 'today') {
    const earlier = candidates.filter((t) => t < updated && classifyTimeGroup(t, tz) !== 'today')
    if (earlier.length) return Math.min(...earlier)
  }

  return updated || created || earliestMessage
}

export function groupConversations(conversations: Conversation[]): ConversationGroup[] {
  const buckets = new Map<ConversationTimeGroup, Conversation[]>()
  for (const key of TIME_GROUP_ORDER) buckets.set(key, [])

  for (const conv of conversations) {
    const key = classifyTimeGroup(conversationGroupTimestamp(conv))
    buckets.get(key)!.push(conv)
  }

  return TIME_GROUP_ORDER.flatMap((key) => {
    const items = buckets.get(key)!
    return items.length ? [{ key, conversations: items }] : []
  })
}
