<script setup lang="ts">
import {
  Calendar,
  FileText,
  Hash,
  Link2,
  List,
  Tag,
  Type,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { WikiGraphNode } from '../api/wiki'
import type { WikiNodeContent } from '../api/wiki'
import { fmList, fmString, parseWikiMarkdown } from '../utils/wikiFrontmatter'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  node: WikiGraphNode | null
  content: WikiNodeContent | null
  loading?: boolean
  error?: string
}>()

const TYPE_LABELS: Record<string, string> = {
  raw: '原始',
  raw_extract: '提取文本',
  entity: '实体',
  concept: '概念',
  source: '来源摘要',
  synthesis: '综合',
  query: '查询',
  meta: '目录页',
  unknown: '未知',
}

const parsed = computed(() => {
  const raw = props.content?.content || ''
  if (!raw.trim()) return null
  return parseWikiMarkdown(raw)
})

const displayTitle = computed(() => {
  if (parsed.value) {
    const t = fmString(parsed.value.frontmatter, 'title')
    if (t) return t
  }
  return props.node?.title || props.content?.title || '未命名'
})

const hasFrontmatter = computed(
  () => parsed.value && Object.keys(parsed.value.frontmatter).length > 0,
)

const bodyMarkdown = computed(() => parsed.value?.body?.trim() || '')

interface PropRow {
  key: string
  label: string
  icon: typeof Type
  kind: 'text' | 'tags' | 'paths' | 'date'
  value?: string
  items?: string[]
}

const propertyRows = computed((): PropRow[] => {
  if (!parsed.value) return []
  const fm = parsed.value.frontmatter
  const rows: PropRow[] = []

  const push = (row: PropRow) => {
    if (row.kind === 'text' && row.value) rows.push(row)
    else if (row.kind !== 'text' && row.items?.length) rows.push(row)
    else if (row.kind === 'text' && row.key === 'type' && row.value) rows.push(row)
  }

  push({
    key: 'title',
    label: 'title',
    icon: Type,
    kind: 'text',
    value: fmString(fm, 'title'),
  })
  push({
    key: 'type',
    label: 'type',
    icon: FileText,
    kind: 'text',
    value: fmString(fm, 'type'),
  })

  const aliases = fmList(fm, 'aliases')
  if (aliases.length) {
    push({ key: 'aliases', label: 'aliases', icon: List, kind: 'tags', items: aliases })
  }

  const tags = fmList(fm, 'tags')
  if (tags.length) {
    push({ key: 'tags', label: 'tags', icon: Tag, kind: 'tags', items: tags })
  }

  const sources = fmList(fm, 'sources')
  if (sources.length) {
    push({ key: 'sources', label: 'sources', icon: Link2, kind: 'paths', items: sources })
  }

  const created = fmString(fm, 'created')
  const updated = fmString(fm, 'updated')
  if (created) {
    push({ key: 'created', label: 'created', icon: Calendar, kind: 'date', value: created })
  }
  if (updated && updated !== created) {
    push({ key: 'updated', label: 'updated', icon: Calendar, kind: 'date', value: updated })
  }

  const status = fmString(fm, 'status')
  if (status) {
    push({ key: 'status', label: 'status', icon: Hash, kind: 'text', value: status })
  }

  const sc = fmString(fm, 'source_count')
  if (sc) {
    push({ key: 'source_count', label: 'source_count', icon: Hash, kind: 'text', value: sc })
  }

  return rows
})
</script>

<template>
  <div class="wiki-node-detail">
    <p v-if="loading" class="state-msg">正在读取节点文件…</p>
    <p v-else-if="error" class="state-msg error">{{ error }}</p>
    <template v-else-if="content?.content">
      <header class="note-header">
        <h1 class="note-title">{{ displayTitle }}</h1>
        <p v-if="content.note" class="note-banner">{{ content.note }}</p>
        <code class="note-path">{{ content.path }}</code>
      </header>

      <section v-if="hasFrontmatter" class="note-props">
        <h2 class="props-heading">笔记属性</h2>
        <div v-for="row in propertyRows" :key="row.key" class="prop-row">
          <component :is="row.icon" :size="14" class="prop-icon" />
          <span class="prop-key">{{ row.label }}</span>
          <div class="prop-value">
            <template v-if="row.kind === 'tags' || row.kind === 'paths'">
              <span
                v-for="item in row.items"
                :key="item"
                class="prop-chip"
                :class="{ path: row.kind === 'paths' }"
              >{{ item }}</span>
            </template>
            <template v-else>
              <span class="prop-text">{{ row.value }}</span>
            </template>
          </div>
        </div>
      </section>

      <section v-if="bodyMarkdown" class="note-body">
        <MarkdownContent :content="bodyMarkdown" />
      </section>
      <p v-else-if="!hasFrontmatter" class="state-msg dim">无正文内容。</p>
    </template>
    <p v-else class="state-msg dim">该节点没有可预览文本。</p>
  </div>
</template>

<style scoped lang="scss">
.wiki-node-detail {
  color: #dcdee1;
  font-size: 13px;
}

.note-header {
  padding: 0 0 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}

.note-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.35;
  color: #e8eaed;
}

.note-banner {
  margin: 0 0 8px;
  font-size: 12px;
  color: #9aa3ad;
  line-height: 1.5;
}

.note-path {
  display: block;
  font-size: 11px;
  color: #6b7280;
  word-break: break-all;
}

.props-heading {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: #8b9298;
}

.note-props {
  margin-bottom: 16px;
}

.prop-row {
  display: grid;
  grid-template-columns: 18px 88px 1fr;
  gap: 8px 10px;
  align-items: start;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.prop-icon {
  color: #6b7280;
  margin-top: 2px;
}

.prop-key {
  font-size: 12px;
  color: #9aa3ad;
  padding-top: 2px;
}

.prop-value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.prop-text {
  color: #e8eaed;
  word-break: break-word;
}

.prop-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: rgba(167, 139, 250, 0.22);
  color: #d4c4fd;
  border: 1px solid rgba(167, 139, 250, 0.35);
  word-break: break-all;

  &.path {
    background: rgba(99, 167, 255, 0.15);
    color: #a8c7ff;
    border-color: rgba(99, 167, 255, 0.28);
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
}

.note-body {
  padding-top: 4px;

  :deep(.markdown-body) {
    color: #dcdee1;
    font-size: 14px;
  }

  :deep(h1) {
    display: none;
  }

  :deep(h2) {
    font-size: 1.1rem;
    color: #e8eaed;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 6px;
  }

  :deep(a) {
    color: #7eb8ff;
  }

  :deep(code) {
    background: rgba(255, 255, 255, 0.08);
    color: #f0c674;
  }
}

.state-msg {
  margin: 0;
  padding: 12px 0;
  color: #9aa3ad;

  &.error {
    color: #e88a8a;
  }

  &.dim {
    font-size: 12px;
  }
}
</style>
