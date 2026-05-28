<script setup lang="ts">
import { Database, FileText, FileUp, GitBranch, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import {
  addKnowledgeText,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeFile,
  type KnowledgeDocument,
} from '../api/platform'
import { getWikiStatus, runWikiLint, type WikiLintResult } from '../api/wiki'
import { useAgentStore } from '../stores/agent'
import { usePlatformStore } from '../stores/platform'
import KnowledgeChatModePicker from './KnowledgeChatModePicker.vue'
import LoadingIndicator from './LoadingIndicator.vue'

const platform = usePlatformStore()
const agent = useAgentStore()

const panelTab = ref<'rag' | 'wiki'>('rag')
const wikiStats = ref<{ nodes: number; edges: number; pending_ingest?: number; orphan_wiki?: number } | null>(null)
const lintResult = ref<WikiLintResult | null>(null)
const lintLoading = ref(false)

const documents = ref<KnowledgeDocument[]>([])
const loading = ref(false)
const error = ref('')
const source = ref('')
const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
/** 'add' = 右侧录入；否则为 doc_id */
const selectedId = ref<string>('add')

async function loadDocs() {
  loading.value = true
  error.value = ''
  try {
    documents.value = await listKnowledgeDocuments()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败，请确认 Python 后端已启动'
    documents.value = []
  } finally {
    loading.value = false
  }
}

function selectDoc(id: string) {
  selectedId.value = id
}

function openAdd() {
  selectedId.value = 'add'
}

const selectedDoc = () => documents.value.find((d) => d.doc_id === selectedId.value)

async function submitText() {
  if (!text.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await addKnowledgeText(text.value.trim(), source.value.trim() || '手动录入')
    text.value = ''
    source.value = ''
    await loadDocs()
    await platform.refreshHealth()
    const last = documents.value[documents.value.length - 1]
    if (last) selectedId.value = last.doc_id
  } catch (e) {
    error.value = e instanceof Error ? e.message : '写入失败'
  } finally {
    loading.value = false
  }
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loading.value = true
  error.value = ''
  try {
    await uploadKnowledgeFile(file, file.name)
    await loadDocs()
    await platform.refreshHealth()
    const last = documents.value[documents.value.length - 1]
    if (last) selectedId.value = last.doc_id
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    loading.value = false
    input.value = ''
  }
}

async function removeDoc(docId: string) {
  if (!confirm('确定删除该文档的所有向量片段？')) return
  loading.value = true
  try {
    await deleteKnowledgeDocument(docId)
    await loadDocs()
    selectedId.value = 'add'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    loading.value = false
  }
}

async function loadWikiStats() {
  try {
    const s = await getWikiStatus()
    wikiStats.value = {
      nodes: s.nodes,
      edges: s.edges,
      pending_ingest: s.pending_ingest,
      orphan_wiki: s.orphan_wiki,
    }
  } catch {
    wikiStats.value = null
  }
}

async function onLintWiki() {
  lintLoading.value = true
  error.value = ''
  try {
    lintResult.value = await runWikiLint()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Lint 失败'
    lintResult.value = null
  } finally {
    lintLoading.value = false
  }
}

function openWikiGraph() {
  agent.setCurrentView('wikiGraph')
}

onMounted(async () => {
  await platform.refreshHealth()
  await loadDocs()
  await loadWikiStats()
})
</script>

<template>
  <div class="models-page">
    <div class="page-head card">
      <div class="panel-tabs">
        <button
          type="button"
          class="panel-tab"
          :class="{ active: panelTab === 'rag' }"
          @click="panelTab = 'rag'"
        >
          <Database :size="16" />
          Milvus RAG
        </button>
        <button
          type="button"
          class="panel-tab"
          :class="{ active: panelTab === 'wiki' }"
          @click="panelTab = 'wiki'"
        >
          <GitBranch :size="16" />
          LLM-Wiki
        </button>
      </div>
      <KnowledgeChatModePicker />
    </div>

    <div v-if="panelTab === 'wiki'" class="split-layout wiki-layout">
      <aside class="model-list card">
        <p class="group-label">LLM-Wiki 状态</p>
        <p v-if="wikiStats" class="wiki-stat-block">
          图谱 {{ wikiStats.nodes }} 节点 · {{ wikiStats.edges }} 边<br />
          <template v-if="wikiStats.pending_ingest">待 ingest {{ wikiStats.pending_ingest }} · </template>
          <template v-if="wikiStats.orphan_wiki">待补全 {{ wikiStats.orphan_wiki }}</template>
        </p>
        <p v-else class="list-empty">无法读取 wiki 状态，请确认后端已启动</p>

        <button type="button" class="add-trigger" @click="openWikiGraph">
          <GitBranch :size="16" />
          打开知识图谱
        </button>
        <button type="button" class="add-trigger secondary" :disabled="lintLoading" @click="onLintWiki">
          <LoadingIndicator v-if="lintLoading" label="检查中…" variant="button" :size="14" />
          <template v-else>
            <ShieldCheck :size="16" />
            运行 Lint 检查
          </template>
        </button>
        <button type="button" class="add-trigger secondary" @click="loadWikiStats">
          <RefreshCw :size="16" />
          刷新状态
        </button>

        <p class="group-label">架构说明</p>
        <p class="wiki-arch-hint">
          <strong>Ingest</strong>：在「知识图谱」上传 raw → 构建知识框架。<br />
          <strong>Query</strong>：对话选 LLM-Wiki 模式。<br />
          <strong>Lint</strong>：检查断链与待处理 raw。
        </p>
      </aside>

      <section class="right-panel card">
        <div class="detail">
          <p v-if="error" class="error">{{ error }}</p>
          <h3 class="wiki-detail-title">LLM-Wiki 知识库</h3>
          <p class="wiki-detail-desc">
            与 Milvus 向量库独立：Markdown + [[wikilink]] + 图谱。适合长期积累、跨文档综合；RAG 适合短文档快速问答。
          </p>

          <div v-if="lintResult" class="lint-report">
            <p class="lint-summary" :class="lintResult.ok ? 'ok' : 'warn'">
              {{ lintResult.ok ? '未发现严重问题' : '存在需关注的问题' }}
              — {{ lintResult.summary.issues }} 条（错误 {{ lintResult.summary.errors }} · 警告
              {{ lintResult.summary.warnings }}）
            </p>
            <ul v-if="lintResult.issues.length" class="lint-list">
              <li v-for="(item, i) in lintResult.issues.slice(0, 30)" :key="i" :data-severity="item.severity">
                <code>{{ item.page }}</code> {{ item.message }}
              </li>
            </ul>
            <p v-if="lintResult.issues.length > 30" class="list-empty">… 另有 {{ lintResult.issues.length - 30 }} 条</p>
          </div>
          <p v-else class="list-empty">点击左侧「运行 Lint 检查」查看断链、孤儿页与待 ingest raw。</p>
        </div>
      </section>
    </div>

    <div v-else class="split-layout">
      <aside class="model-list card">
        <p class="group-label">
          已入库文档
          <span :class="platform.milvusOk ? 'status-ok' : 'status-warn'" class="milvus-badge">
            {{ platform.milvusOk ? 'Milvus 已连接' : 'Milvus 未连接' }}
          </span>
        </p>
        <LoadingIndicator
          v-if="loading && !documents.length"
          label="加载中…"
          variant="block"
          class="list-empty"
        />
        <p v-else-if="!documents.length" class="list-empty">暂无文档</p>
        <button
          v-for="doc in documents"
          :key="doc.doc_id"
          type="button"
          class="model-item"
          :class="{ active: selectedId === doc.doc_id }"
          @click="selectDoc(doc.doc_id)"
        >
          <FileText :size="20" class="section-icon" />
          <div class="item-text">
            <span class="name">{{ doc.source }}</span>
            <span class="state">{{ doc.chunks }} 片段</span>
          </div>
        </button>

        <button type="button" class="add-trigger" @click="openAdd">
          <Plus :size="16" />
          录入新知识
        </button>

        <button
          type="button"
          class="add-trigger secondary"
          :disabled="loading"
          @click="loadDocs"
        >
          <RefreshCw :size="16" />
          刷新列表
        </button>
      </aside>

      <section class="right-panel card">
        <div v-if="selectedId === 'add'" class="detail">
          <p v-if="error" class="error">{{ error }}</p>

          <label class="field">
            <span>来源名称</span>
            <input v-model="source" class="input" placeholder="例如：产品手册 v1" />
          </label>

          <label class="field">
            <span>文本内容</span>
            <textarea
              v-model="text"
              class="input textarea"
              rows="8"
              placeholder="粘贴要入库的文本…"
            />
          </label>

          <div class="actions">
            <button class="btn-primary" type="button" :disabled="loading" @click="submitText">
              <Database :size="16" />
              写入知识库
            </button>
            <button class="btn-secondary" type="button" :disabled="loading" @click="fileInput?.click()">
              <FileUp :size="16" />
              上传文件
            </button>
            <input ref="fileInput" type="file" accept=".txt,.md,.markdown" hidden @change="onFileChange" />
          </div>

          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            class="attu-link"
          >
            打开 Attu 管理 Milvus
          </a>
        </div>

        <div v-else-if="selectedDoc()" class="detail">
          <label class="field">
            <span>来源名称</span>
            <code class="readonly">{{ selectedDoc()!.source }}</code>
          </label>

          <label class="field">
            <span>向量片段</span>
            <code class="readonly">{{ selectedDoc()!.chunks }} 段</code>
          </label>

          <label class="field">
            <span>文档 ID</span>
            <code class="readonly">{{ selectedDoc()!.doc_id }}</code>
          </label>

          <p v-if="error" class="error">{{ error }}</p>

          <div class="actions">
            <button
              class="btn-danger"
              type="button"
              :disabled="loading"
              @click="removeDoc(selectedDoc()!.doc_id)"
            >
              <Trash2 :size="16" />
              删除文档
            </button>
          </div>

        </div>

        <div v-else class="empty">
          <p>← 选择左侧文档，或录入新知识</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.models-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 24px 28px;
  gap: 14px;
}

.page-head {
  padding: 14px 16px;
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
}

.panel-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid $glass-border;
  color: $text-secondary;
  background: transparent;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    border-color: $accent;
    background: $accent-light;
    color: $accent;
    font-weight: 600;
  }
}

.wiki-stat-block,
.wiki-arch-hint {
  font-size: 12px;
  line-height: 1.55;
  color: $text-secondary;
  padding: 8px 10px 12px;
  margin: 0;
}

.wiki-arch-hint strong {
  color: $text-primary;
}

.wiki-detail-title {
  margin: 0 0 8px;
  font-size: 17px;
  color: $text-primary;
}

.wiki-detail-desc {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.55;
  color: $text-secondary;
}

.lint-report {
  margin-top: 8px;
}

.lint-summary {
  font-size: 13px;
  margin: 0 0 10px;

  &.ok {
    color: $accent;
  }

  &.warn {
    color: $accent-gold;
  }
}

.lint-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.5;
  max-height: 320px;
  overflow-y: auto;

  li {
    padding: 6px 8px;
    border-radius: 6px;
    margin-bottom: 4px;
    color: $text-secondary;

    &[data-severity='error'] {
      background: rgba(196, 68, 68, 0.08);
    }

    &[data-severity='warn'] {
      background: rgba(184, 134, 11, 0.08);
    }

    code {
      font-size: 11px;
      margin-right: 6px;
      color: $text-primary;
    }
  }
}

.wiki-layout {
  flex: 1;
  min-height: 0;
}

.status-ok {
  color: $accent;
  font-weight: 500;
}

.status-warn {
  color: $accent-gold;
  font-weight: 500;
}

.group-label .milvus-badge {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}

.split-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.card {
  background: $bg-card;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
  min-height: 0;
  overflow: hidden;
}

.model-list {
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 8px 6px;
}

.list-empty {
  font-size: 12px;
  color: $text-muted;
  padding: 8px 10px 12px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  margin-bottom: 4px;
  border: 1px solid transparent;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border-color: $accent;
    box-shadow: inset $active-indicator 0 0 $accent;

    .name {
      font-weight: 600;
    }
  }
}

.section-icon {
  flex-shrink: 0;
  color: $accent;
  opacity: 0.85;
}

.item-text {
  min-width: 0;

  .name {
    display: block;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state {
    display: block;
    font-size: 11px;
    color: $text-secondary;
    margin-top: 2px;
  }
}

.add-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  padding: 12px;
  border: 1px dashed $border-light;
  border-radius: 10px;
  font-size: 13px;
  color: $text-secondary;

  &:hover:not(:disabled) {
    border-color: $accent;
    color: $accent;
    background: $accent-light;
  }

  &.secondary {
    margin-top: 6px;
    border-style: solid;
    border-color: $border-light;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.right-panel {
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.detail {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.field {
  display: block;
  margin-bottom: 14px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 8px;
  }
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }

  &.textarea {
    resize: vertical;
    line-height: 1.5;
  }
}

.readonly {
  display: block;
  padding: 10px 12px;
  background: $bg-input;
  border-radius: 8px;
  font-size: 12px;
  word-break: break-all;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: $radius-sm;
  font-size: 13px;
  font-weight: 500;
}

.btn-primary {
  background: $accent;
  color: $btn-primary-text;

  &:disabled {
    opacity: 1;
    background: $btn-primary-disabled-bg;
    color: $btn-primary-disabled-text;
  }
}

.btn-secondary {
  background: $bg-input;
  border: 1px solid $border-light;
  color: $text-primary;

  &:hover:not(:disabled) {
    border-color: $accent;
    color: $accent;
  }
}

.btn-danger {
  background: rgba(232, 93, 93, 0.12);
  border: 1px solid rgba(232, 93, 93, 0.35);
  color: #c44;

  &:hover:not(:disabled) {
    background: rgba(232, 93, 93, 0.2);
  }
}

.rag-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-top: 12px;
  cursor: pointer;
}

.attu-link {
  display: inline-block;
  margin-top: 12px;
  font-size: 12px;
  color: $accent;
}

.error {
  color: #e85d5d;
  font-size: 13px;
  margin-bottom: 12px;
}

.empty {
  height: 100%;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-muted;
  font-size: 14px;
}

@media (max-width: 768px) {
  .split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
