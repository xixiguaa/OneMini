export interface PromptStructure {
  raw: string
  subject: string[]
  style: string[]
  quality: string[]
  tags: string[]
}

const SECTION_KEYS: { key: keyof Omit<PromptStructure, 'raw'>; labels: string[] }[] = [
  { key: 'subject', labels: ['主体', 'subject'] },
  { key: 'style', labels: ['风格', 'style'] },
  { key: 'quality', labels: ['画质', '质量', 'quality'] },
  { key: 'tags', labels: ['标签', 'tag', 'tags'] },
]

const EMPTY: PromptStructure = {
  raw: '',
  subject: [],
  style: [],
  quality: [],
  tags: [],
}

function splitTags(text: string): string[] {
  return text
    .split(/[,，、|/;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseSectionLine(line: string): { key: keyof Omit<PromptStructure, 'raw'>; values: string[] } | null {
  const bracket = line.match(/^【([^】]+)】\s*(.+)$/)
  if (bracket) {
    const label = bracket[1].trim().toLowerCase()
    const section = SECTION_KEYS.find((s) => s.labels.some((l) => label === l.toLowerCase()))
    if (section) return { key: section.key, values: splitTags(bracket[2]) }
  }

  const colon = line.match(/^([^:：]+)[:：]\s*(.+)$/)
  if (colon) {
    const label = colon[1].trim().toLowerCase()
    const section = SECTION_KEYS.find((s) => s.labels.some((l) => label === l.toLowerCase()))
    if (section) return { key: section.key, values: splitTags(colon[2]) }
  }

  return null
}

export function parsePromptStructure(text: string): PromptStructure {
  const raw = text.trim()
  if (!raw) return { ...EMPTY }

  const result: PromptStructure = { raw, subject: [], style: [], quality: [], tags: [] }
  let matched = false

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseSectionLine(line.trim())
    if (!parsed) continue
    matched = true
    result[parsed.key].push(...parsed.values)
  }

  if (!matched) {
    const inline = raw.match(/(?:^|[,，])\s*([^,，:：]+)[:：]\s*([^,，]+)/g)
    if (inline?.length) {
      for (const chunk of inline) {
        const parsed = parseSectionLine(chunk.replace(/^[,，]\s*/, '').trim())
        if (parsed) {
          matched = true
          result[parsed.key].push(...parsed.values)
        }
      }
    }
  }

  if (!matched) {
    result.subject = splitTags(raw)
  }

  return result
}

export function hasPromptStructure(struct: PromptStructure): boolean {
  return struct.subject.length + struct.style.length + struct.quality.length + struct.tags.length > 0
    && (struct.style.length > 0 || struct.quality.length > 0 || struct.tags.length > 0
      || /^[^:：]+[:：]/.test(struct.raw) || /【[^】]+】/.test(struct.raw))
}
