/** 流程图默认改为从左到右横向布局 */
export function normalizeMermaidForHorizontal(source: string): string {
  const s = source.trim()
  if (!s) return s

  if (/^flowchart\s+(TD|TB|DT)\b/i.test(s)) {
    return s.replace(/^flowchart\s+(TD|TB|DT)\b/i, 'flowchart LR')
  }
  if (/^graph\s+(TD|TB|DT)\b/i.test(s)) {
    return s.replace(/^graph\s+(TD|TB|DT)\b/i, 'graph LR')
  }
  if (/^flowchart\s*(\n|$)/i.test(s) && !/^flowchart\s+(LR|RL|TB|BT|TD|DT)\b/im.test(s)) {
    return s.replace(/^flowchart\s*/i, 'flowchart LR\n')
  }
  if (/^graph\b/i.test(s) && !/^graph\s+(LR|RL|TB|BT|TD|DT)\b/i.test(s)) {
    return s.replace(/^graph\b/i, 'graph LR')
  }

  return s
}
