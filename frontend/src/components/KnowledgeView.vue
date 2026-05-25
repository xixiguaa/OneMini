<script setup lang="ts">
import { Database, FileText, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import {
  addKnowledgeText,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeFile,
  type KnowledgeDocument,
} from '../api/platform'
import { usePlatformStore } from '../stores/platform'
import { BRAND_NAME } from '../utils/modelLogo'

const platform = usePlatformStore()

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

onMounted(async () => {
  await platform.refreshHealth()
  await loadDocs()
})
</script>

<template>
  <div class="models-page">
    <header class="page-header">
      <h2>知识库</h2>
      <p>
        {{ BRAND_NAME }} · 文档切块 → 嵌入 → Milvus ·
        <span :class="platform.milvusOk ? 'status-ok' : 'status-warn'">
          {{ platform.milvusOk ? 'Milvus 已连接' : 'Milvus 未连接' }}
        </span>
      </p>
    </header>

    <div class="split-layout">
      <aside class="model-list card">
        <p class="group-label">已入库文档</p>
        <p v-if="loading && !documents.length" class="list-empty">加载中…</p>
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
          <div class="detail-head">
            <Database :size="40" class="head-icon" />
            <div class="head-meta">
              <h3 class="panel-title">录入知识</h3>
              <p>粘贴文本或上传 .txt / .md，写入后可在对话中启用 RAG</p>
            </div>
          </div>

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

          <label class="rag-toggle">
            <input
              type="checkbox"
              :checked="platform.ragEnabled"
              @change="platform.setRagEnabled(($event.target as HTMLInputElement).checked)"
            />
            对话页启用「知识库增强」（RAG）
          </label>

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
          <div class="detail-head">
            <FileText :size="40" class="head-icon" />
            <div class="head-meta">
              <h3 class="panel-title">{{ selectedDoc()!.source }}</h3>
              <p>{{ selectedDoc()!.chunks }} 个向量片段</p>
            </div>
          </div>

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

          <label class="rag-toggle">
            <input
              type="checkbox"
              :checked="platform.ragEnabled"
              @change="platform.setRagEnabled(($event.target as HTMLInputElement).checked)"
            />
            对话页启用 RAG
          </label>
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
}

.page-header {
  margin-bottom: 20px;

  h2 {
    font-size: 22px;
    font-weight: 600;
  }

  p {
    font-size: 13px;
    color: $text-secondary;
    margin-top: 4px;
  }
}

.status-ok {
  color: $accent;
  font-weight: 500;
}

.status-warn {
  color: $accent-gold;
  font-weight: 500;
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
    box-shadow: inset 3px 0 0 $accent;

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

.detail-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 20px;
}

.head-icon {
  color: $accent;
  flex-shrink: 0;
}

.head-meta {
  flex: 1;
  min-width: 0;

  .panel-title {
    font-size: 18px;
    font-weight: 600;
  }

  p {
    font-size: 12px;
    color: $text-secondary;
    margin-top: 6px;
  }
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
    box-shadow: 0 0 0 3px $accent-light;
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
  background: linear-gradient(135deg, $accent, $accent-magic);
  color: #fff;

  &:disabled {
    opacity: 0.5;
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
