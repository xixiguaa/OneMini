import { extractFileText } from '../api/agent'
import type { CreateMode } from '../types/agent'
import {
  ACCEPT_CREATE_AGENT,
  ACCEPT_CREATE_DIGITAL_HUMAN,
  ACCEPT_CREATE_IMAGE,
  ACCEPT_CREATE_VIDEO,
} from '../config/constants'
import { randomUUID } from './uuid'

const MAX_TEXT_CHARS = 50_000

export interface ParsedAttachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'image' | 'video' | 'text' | 'document'
  previewUrl?: string
  textContent?: string
  base64?: string
  /** 本地解析/读取中 */
  loading?: boolean
}

const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'text/csv',
])

const TEXT_EXT = /\.(txt|md|markdown|html?|json|csv)$/i
const VIDEO_EXT = /\.(mp4|mov|webm|avi|mkv|m4v)$/i
const SPREADSHEET_EXT = /\.(xlsx|xlsm|xls)$/i
const SPREADSHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
])

export function isSpreadsheetFile(file: File): boolean {
  if (SPREADSHEET_EXT.test(file.name)) return true
  return SPREADSHEET_MIMES.has(file.type)
}

export function classifyFile(file: File): ParsedAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video'
  if (TEXT_TYPES.has(file.type) || TEXT_EXT.test(file.name)) return 'text'
  return 'document'
}

export function isFileAllowedForCreateMode(file: File, mode: CreateMode): boolean {
  if (isSpreadsheetFile(file)) return false
  const kind = classifyFile(file)
  switch (mode) {
    case 'image':
      return kind === 'image'
    case 'video':
      return kind === 'image' || kind === 'video'
    case 'digitalHuman':
      return kind === 'image' || kind === 'video'
    case 'agent':
      return kind === 'image' || kind === 'video' || kind === 'text' || kind === 'document'
    default:
      return false
  }
}

export function acceptFilesForCreateMode(mode: CreateMode): string {
  switch (mode) {
    case 'image':
      return ACCEPT_CREATE_IMAGE
    case 'video':
      return ACCEPT_CREATE_VIDEO
    case 'digitalHuman':
      return ACCEPT_CREATE_DIGITAL_HUMAN
    case 'agent':
    default:
      return ACCEPT_CREATE_AGENT
  }
}

export function createModeAttachmentHint(mode: CreateMode): string {
  switch (mode) {
    case 'image':
      return '图片生成仅支持图片格式'
    case 'video':
      return '视频生成仅支持图片或视频格式'
    case 'digitalHuman':
      return '数字人仅支持图片或视频格式'
    case 'agent':
    default:
      return '不支持表格格式（xlsx / xls 等）'
  }
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

  if (kind === 'video') {
    base.previewUrl = URL.createObjectURL(file)
    return base
  }

  if (kind === 'text') {
    const text = await file.text()
    base.textContent = text.slice(0, MAX_TEXT_CHARS)
    return base
  }

  try {
    const { text } = await extractFileText(file)
    if (text?.trim()) {
      base.textContent = text.slice(0, MAX_TEXT_CHARS)
    }
  } catch {
    /* 解析失败时保留文档占位，发送时会提示未能提取正文 */
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
    if (f.loading) continue
    if (f.textContent?.trim()) {
      parts.push(`\n--- 文件: ${f.name} ---\n${f.textContent.trim()}\n---`)
    } else if (f.kind === 'document') {
      parts.push(`\n[附件文档: ${f.name} (${formatSize(f.size)})，未能提取正文，请确认格式或粘贴关键内容]`)
    } else if (f.kind === 'image') {
      parts.push(`\n[附件图片: ${f.name}]`)
    } else if (f.kind === 'video') {
      parts.push(`\n[附件视频: ${f.name}]`)
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

export function fileExtensionBadge(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase()
  if (!ext || ext.length > 5) return 'FILE'
  return ext
}
