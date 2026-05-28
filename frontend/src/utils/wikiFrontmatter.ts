export type WikiFrontmatterValue = string | number | string[]

export interface ParsedWikiDoc {
  frontmatter: Record<string, WikiFrontmatterValue>
  body: string
}

function parseYamlValue(raw: string): WikiFrontmatterValue {
  const v = raw.trim()
  if (/^\d+$/.test(v)) return Number(v)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

/** 解析 wiki 页 YAML frontmatter（覆盖本项目常用字段，非完整 YAML）。 */
export function parseWikiMarkdown(content: string): ParsedWikiDoc {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content }
  }
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) {
    return { frontmatter: {}, body: content }
  }

  const yaml = content.slice(4, end)
  const body = content.slice(end + 5).replace(/^\n/, '')
  const fm: Record<string, WikiFrontmatterValue> = {}
  let currentKey: string | null = null

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const listMatch = line.match(/^\s+-\s+(.+)$/)
    if (listMatch && currentKey) {
      const item = parseYamlValue(listMatch[1]) as string
      const prev = fm[currentKey]
      if (Array.isArray(prev)) prev.push(item)
      else fm[currentKey] = [String(prev), item]
      continue
    }

    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    currentKey = kv[1]
    const rest = kv[2].trim()
    if (!rest) {
      fm[currentKey] = []
      continue
    }
    fm[currentKey] = parseYamlValue(rest)
  }

  return { frontmatter: fm, body }
}

export function fmString(fm: Record<string, WikiFrontmatterValue>, key: string): string {
  const v = fm[key]
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export function fmList(fm: Record<string, WikiFrontmatterValue>, key: string): string[] {
  const v = fm[key]
  if (!v) return []
  return Array.isArray(v) ? v.map(String) : [String(v)]
}
