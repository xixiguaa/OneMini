function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const KEYWORDS = /\b(flowchart|graph|subgraph|end|LR|RL|TB|BT|TD|DT|classDef|style|click|linkStyle)\b/gi

/** Mermaid 代码语法高亮（紫关键字 + 绿节点/标签） */
export function highlightMermaidCode(source: string): string {
  return source.split('\n').map(highlightLine).join('\n')
}

function highlightLine(line: string): string {
  let s = escapeHtml(line)
  if (!s.trim()) return s

  s = s.replace(/(\[[^\]]+\])/g, '<span class="hl-label">$1</span>')
  s = s.replace(KEYWORDS, '<span class="hl-kw">$&</span>')
  s = s.replace(/(-->|---|==>|-.->|o--o|--o)/g, '<span class="hl-arrow">$&</span>')
  s = s.replace(/(^|[^\w>])([A-Z][A-Z0-9]*\d*)(?![\w<])/g, '$1<span class="hl-id">$2</span>')

  return s
}
