import { randomUUID } from './uuid'

export interface ParsedAttachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'image' | 'text' | 'document'
  previewUrl?: string
  textContent?: string
  base64?: string
}

const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'text/csv',
])

const TEXT_EXT = /\.(txt|md|markdown|html?|json|csv)$/i

export function classifyFile(file: File): ParsedAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (TEXT_TYPES.has(file.type) || TEXT_EXT.test(file.name)) return 'text'
  return 'document'
}

export async function parseFile(file: File): Promise<ParsedAttachment> {
  const kind = classifyFile(file)
  const base: ParsedAttachment = {
    id: randomUUID(),
    name: file.name,
    mime: file.type,
    size: file.size,
    kind,
  }

  if (kind === 'image') {
    base.previewUrl = URL.createObjectURL(file)
    base.base64 = await fileToBase64(file)
    return base
  }

  if (kind === 'text') {
    const text = await file.text()
    base.textContent = text.slice(0, 50000)
    return base
  }

  return base
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function formatAttachmentsForPrompt(files: ParsedAttachment[]): string {
  const parts: string[] = []
  for (const f of files) {
    if (f.kind === 'text' && f.textContent) {
      parts.push(`\n--- 文件: ${f.name} ---\n${f.textContent}\n---`)
    } else if (f.kind === 'document') {
      parts.push(`\n[附件文档: ${f.name} (${formatSize(f.size)})]`)
    } else if (f.kind === 'image') {
      parts.push(`\n[附件图片: ${f.name}]`)
    }
  }
  return parts.join('')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function revokeAttachmentPreviews(files: ParsedAttachment[]) {
  files.forEach((f) => {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
  })
}
