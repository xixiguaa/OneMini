/** 去掉流式输出末尾未闭合的 XML / 协议标签，避免闪现原始标记 */
export function stripIncompleteComposerTags(content: string): string {
  let text = content
  text = text.replace(/<state_update>[\s\S]*$/i, '')
  text = text.replace(/<thinking>[\s\S]*$/i, '')
  text = text.replace(/<\/?(?:thinking|answer|response|state_update)[^>]*$/i, '')
  return text
}

/** 去掉流式输出末尾未闭合的 Markdown 片段，避免 marked 解析时闪现原始语法 */
export function trimIncompleteMarkdownTail(content: string): string {
  if (!content) return ''

  let text = content

  const fenceIndexes: number[] = []
  let searchFrom = 0
  while (searchFrom < text.length) {
    const idx = text.indexOf('```', searchFrom)
    if (idx === -1) break
    fenceIndexes.push(idx)
    searchFrom = idx + 3
  }
  if (fenceIndexes.length % 2 === 1) {
    text = text.slice(0, fenceIndexes[fenceIndexes.length - 1])
  }

  text = text.replace(/!\[[^\]]*$/, '')
  text = text.replace(/!\[[^\]]*\]\([^)]*$/, '')
  text = text.replace(/\[[^\]]*$/, '')
  text = text.replace(/\[[^\]]*\]\([^)]*$/, '')

  const lastNewline = text.lastIndexOf('\n')
  const head = lastNewline >= 0 ? text.slice(0, lastNewline + 1) : ''
  let tail = lastNewline >= 0 ? text.slice(lastNewline + 1) : text
  tail = trimUnclosedInlineEmphasis(tail)
  tail = trimIncompleteBlockSyntax(tail)

  return head + tail
}

/** 渲染前统一预处理：完整内容时等价于原文，流式时裁剪未闭合片段 */
export function prepareMarkdownForRender(content: string): string {
  return trimIncompleteMarkdownTail(stripIncompleteComposerTags(content))
}

function trimIncompleteBlockSyntax(line: string): string {
  let text = line.trimEnd()
  if (/^#{1,6}\s*$/.test(text)) return ''
  if (/^[-*+]\s*$/.test(text)) return ''
  if (/^\d+\.\s*$/.test(text)) return ''
  if (/^>\s*$/.test(text)) return ''
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(text)) return ''
  return line
}

function trimUnclosedInlineEmphasis(line: string): string {
  let text = line

  if ((text.match(/\*\*/g) ?? []).length % 2 === 1) {
    const last = text.lastIndexOf('**')
    if (last >= 0) text = text.slice(0, last)
  }

  if ((text.match(/__/g) ?? []).length % 2 === 1) {
    const last = text.lastIndexOf('__')
    if (last >= 0) text = text.slice(0, last)
  }

  if ((text.match(/(?<!\\)~~/g) ?? []).length % 2 === 1) {
    const last = text.lastIndexOf('~~')
    if (last >= 0) text = text.slice(0, last)
  }

  let singleStars = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '*') continue
    const prev = text[i - 1]
    const next = text[i + 1]
    if (prev === '*' || next === '*') continue
    singleStars++
  }
  if (singleStars % 2 === 1) {
    const last = text.lastIndexOf('*')
    if (last >= 0) text = text.slice(0, last)
  }

  let singleUnders = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '_') continue
    const prev = text[i - 1]
    const next = text[i + 1]
    if (prev === '_' || next === '_') continue
    singleUnders++
  }
  if (singleUnders % 2 === 1) {
    const last = text.lastIndexOf('_')
    if (last >= 0) text = text.slice(0, last)
  }

  let backticks = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '`') continue
    const prev = text[i - 1]
    const next = text[i + 1]
    if (prev === '`' || next === '`') continue
    backticks++
  }
  if (backticks % 2 === 1) {
    const last = text.lastIndexOf('`')
    if (last >= 0) text = text.slice(0, last)
  }

  return text
}
