export type MarkdownPart =
  | { type: 'md'; content: string }
  | { type: 'mermaid'; content: string }

const MERMAID_RE = /```mermaid\s*\n([\s\S]*?)```/gi

/** 将 Markdown 拆成普通段落与 mermaid 代码块 */
export function splitMarkdownParts(content: string): MarkdownPart[] {
  if (!content.trim()) return [{ type: 'md', content: '' }]

  const parts: MarkdownPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  MERMAID_RE.lastIndex = 0
  while ((match = MERMAID_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'md', content: content.slice(lastIndex, match.index) })
    }
    const code = match[1].trim()
    if (code) parts.push({ type: 'mermaid', content: code })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'md', content: content.slice(lastIndex) })
  }

  return parts.length ? parts : [{ type: 'md', content }]
}
