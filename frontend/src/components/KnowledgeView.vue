<script setup lang="ts">
import { Database, FileUp, RefreshCw, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import {
  addKnowledgeText,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  type KnowledgeDocument,
} from '../api/platform'
import { usePlatformStore } from '../stores/platform'

const platform = usePlatformStore()

const documents = ref<KnowledgeDocument[]>([])
const loading = ref(false)
const error = ref('')
const source = ref('')
const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

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

async function submitText() {
  if (!text.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    await addKnowledgeText(text.value.trim(), source.value.trim() || '手动录入')
    text.value = ''
    await loadDocs()
    await platform.refreshHealth()
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
    const { uploadKnowledgeFile } = await import('../api/platform')
    await uploadKnowledgeFile(file, file.name)
    await loadDocs()
    await platform.refreshHealth()
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
  <section class="knowledge-view">
    <header class="header">
      <div>
        <h2>知识库 · Milvus</h2>
        <p class="sub">
          文档切块 → 本地嵌入 → 写入向量库 → 对话时 RAG 检索
        </p>
      </div>
      <div class="status">
        <span :class="platform.milvusOk ? 'ok' : 'warn'">
          Milvus {{ platform.milvusOk ? '已连接' : '未连接' }}
        </span>
        <a href="http://localhost:3000" target="_blank" rel="noopener" class="attu-link">
          打开 Attu
        </a>
      </div>
    </header>

    <div class="panel">
      <label class="label">来源名称</label>
      <input v-model="source" class="input" placeholder="例如：产品手册 v1" />

      <label class="label">文本内容</label>
      <textarea
        v-model="text"
        class="textarea"
        rows="6"
        placeholder="粘贴要入库的文本，将自动分块并写入 Milvus…"
      />

      <div class="actions">
        <button class="btn btn-primary" :disabled="loading" @click="submitText">
          <Database :size="16" />
          写入知识库
        </button>
        <button class="btn btn-secondary" :disabled="loading" @click="fileInput?.click()">
          <FileUp :size="16" />
          上传 .txt / .md
        </button>
        <input ref="fileInput" type="file" accept=".txt,.md,.markdown" hidden @change="onFileChange" />
        <button class="btn btn-secondary ghost" :disabled="loading" @click="loadDocs">
          <RefreshCw :size="16" />
          刷新
        </button>
      </div>

      <label class="rag-toggle">
        <input
          type="checkbox"
          :checked="platform.ragEnabled"
          @change="platform.setRagEnabled(($event.target as HTMLInputElement).checked)"
        />
        对话页启用「知识库增强」（RAG）
      </label>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="list">
      <h3>已入库文档</h3>
      <p v-if="!documents.length && !loading" class="empty">暂无文档，请先录入或上传</p>
      <ul>
        <li v-for="doc in documents" :key="doc.doc_id" class="doc-row">
          <div>
            <strong>{{ doc.source }}</strong>
            <span class="meta">{{ doc.chunks }} 片段 · {{ doc.doc_id }}</span>
          </div>
          <button class="icon-btn" title="删除" @click="removeDoc(doc.doc_id)">
            <Trash2 :size="16" />
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.knowledge-view {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
  max-width: 720px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;

  h2 {
    font-size: 20px;
    font-weight: 700;
  }
}

.sub {
  font-size: 13px;
  color: $text-muted;
  margin-top: 4px;
}

.status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  font-size: 12px;

  .ok {
    color: #2d8a4e;
  }
  .warn {
    color: #c45c26;
  }
}

.attu-link {
  font-size: 12px;
  color: $accent;
}

.panel {
  background: $glass-bg;
  border: 1px solid $glass-border;
  border-radius: $radius-md;
  padding: 16px;
  margin-bottom: 20px;
}

.label {
  display: block;
  font-size: 12px;
  color: $text-muted;
  margin: 8px 0 4px;
}

.input,
.textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: $radius-sm;
  border: 1px solid $glass-border;
  background: $bg-input;
  color: $text-primary;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &.ghost {
    margin-left: auto;
  }
}

.rag-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 13px;
  cursor: pointer;
}

.error {
  color: #e85d5d;
  font-size: 13px;
  margin-bottom: 12px;
}

.list h3 {
  font-size: 14px;
  margin-bottom: 10px;
}

.empty {
  font-size: 13px;
  color: $text-muted;
}

.doc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: $radius-sm;
  border: 1px solid $glass-border;
  margin-bottom: 8px;

  .meta {
    display: block;
    font-size: 11px;
    color: $text-muted;
    margin-top: 2px;
  }
}

.icon-btn {
  padding: 6px;
  color: $text-muted;

  &:hover {
    color: #e85d5d;
  }
}
</style>
