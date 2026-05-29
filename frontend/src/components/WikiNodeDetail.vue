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
import LoadingIndicator from './LoadingIndicator.vue'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  node: WikiGraphNode | null
  content: WikiNodeContent | null
  loading?: boolean
  error?: string
}>()

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
    <LoadingIndicator v-if="loading" label="正在读取节点文件…" variant="block" class="state-msg" />
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
@use '../styles/variables.scss' as *;

.wiki-node-detail {
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.65;
}

.note-header {
  padding: 0 0 14px;
  border-bottom: 1px solid $border-light;
  margin-bottom: 12px;
}

.note-title {
  margin: 0 0 8px;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.35;
  color: $text-primary;
  letter-spacing: 0.01em;
}

.note-banner {
  margin: 0 0 8px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
}

.note-path {
  display: block;
  font-size: 11px;
  color: $text-muted;
  word-break: break-all;
  opacity: 0.95;
}

.props-heading {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  border-bottom: 1px solid $border-light;

  &:last-child {
    border-bottom: none;
  }
}

.prop-icon {
  color: $text-muted;
  margin-top: 2px;
}

.prop-key {
  font-size: 12px;
  color: $text-muted;
  padding-top: 2px;
  font-weight: 500;
}

.prop-value {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.prop-text {
  color: $text-primary;
  word-break: break-word;
}

.prop-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: rgba(123, 95, 255, 0.18);
  color: #ddd6ff;
  border: 1px solid rgba(123, 95, 255, 0.32);
  word-break: break-all;

  &.path {
    background: rgba(74, 58, 232, 0.16);
    color: #c8c0ff;
    border-color: rgba(74, 58, 232, 0.3);
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
}

.note-body {
  padding-top: 4px;

  :deep(.markdown-body) {
    color: $text-secondary;
    font-size: 14px;
    line-height: 1.75;
  }

  :deep(p),
  :deep(li) {
    color: $text-secondary;
  }

  :deep(h1) {
    display: none;
  }

  :deep(h2),
  :deep(h3),
  :deep(h4) {
    color: $text-primary;
    font-weight: 700;
  }

  :deep(h2) {
    font-size: 1.1rem;
    border-bottom: 1px solid $border-light;
    padding-bottom: 6px;
    margin-top: 1.25em;
  }

  :deep(h3) {
    font-size: 1.02rem;
    margin-top: 1em;
  }

  :deep(strong) {
    color: $text-primary;
    font-weight: 600;
  }

  :deep(a) {
    color: $accent-emphasis;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :deep(code) {
    background: rgba(31, 255, 212, 0.1);
    color: #6dffe8;
    border: 1px solid rgba(31, 255, 212, 0.18);
    font-size: 0.88em;
  }

  :deep(pre) {
    background: #1a1a35;
    border: 1px solid $border-light;
  }

  :deep(pre code) {
    background: transparent;
    color: #ececf8;
    border: none;
  }
}

.state-msg {
  margin: 0;
  padding: 12px 0;
  color: $text-secondary;

  &.error {
    color: $color-danger;
  }

  &.dim {
    font-size: 12px;
  }
}
</style>
