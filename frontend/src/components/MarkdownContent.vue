<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { splitMarkdownParts } from '../utils/markdownParts'
import MermaidDiagram from './MermaidDiagram.vue'

const props = defineProps<{
  content: string
}>()

const rootRef = ref<HTMLElement | null>(null)

marked.setOptions({ breaks: true, gfm: true })

const parts = computed(() => splitMarkdownParts(props.content))

function renderMd(fragment: string): string {
  if (!fragment.trim()) return ''
  const raw = marked.parse(fragment, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  })
}

function hideBrokenImages() {
  const root = rootRef.value
  if (!root) return
  root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (img.dataset.fallbackBound === '1') return
    img.dataset.fallbackBound = '1'
    img.addEventListener('error', () => {
      img.remove()
    }, { once: true })
  })
}

onMounted(() => {
  void nextTick(hideBrokenImages)
})

watch(
  () => props.content,
  () => {
    void nextTick(hideBrokenImages)
  },
)
</script>

<template>
  <div ref="rootRef" class="markdown-body">
    <template v-for="(part, i) in parts" :key="i">
      <div v-if="part.type === 'md' && part.content.trim()" v-html="renderMd(part.content)" />
      <MermaidDiagram v-else-if="part.type === 'mermaid'" :source="part.content" />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.markdown-body {
  font-size: 15px;
  line-height: 1.7;
  color: $text-primary;
  word-break: break-word;

  :deep(p) {
    margin: 0 0 0.75em;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.35;
  }

  :deep(h1) {
    font-size: 1.35em;
  }

  :deep(h2) {
    font-size: 1.2em;
  }

  :deep(h3) {
    font-size: 1.08em;
  }

  :deep(ul),
  :deep(ol) {
    margin: 0 0 0.75em;
    padding-left: 1.4em;
  }

  :deep(li) {
    margin: 0.2em 0;
  }

  :deep(blockquote) {
    margin: 0 0 0.75em;
    padding: 0.35em 0.9em;
    border-left: 3px solid rgba(45, 138, 78, 0.35);
    color: $text-secondary;
    background: rgba(45, 138, 78, 0.04);
    border-radius: 0 8px 8px 0;
  }

  :deep(code) {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 0.9em;
    padding: 0.15em 0.4em;
    background: $bg-input;
    border-radius: 6px;
  }

  :deep(pre:not(.mermaid-card pre)) {
    margin: 0 0 0.85em;
    padding: 12px 14px;
    background: #1e1e1e;
    border-radius: 10px;
    overflow-x: auto;

    code {
      padding: 0;
      background: transparent;
      color: #e8e8e8;
      font-size: 13px;
      line-height: 1.55;
    }
  }

  :deep(a) {
    color: $accent;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(table) {
    width: 100%;
    margin: 0 0 0.85em;
    border-collapse: collapse;
    font-size: 14px;
  }

  :deep(th),
  :deep(td) {
    border: 1px solid $glass-border;
    padding: 8px 10px;
    text-align: left;
  }

  :deep(th) {
    background: $bg-input;
    font-weight: 600;
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid $glass-border;
    margin: 1em 0;
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 0.5em 0;
  }
}
</style>
