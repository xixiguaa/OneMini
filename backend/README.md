# OneMini Platform · Python 后端

基于 **FastAPI + Milvus + LangChain RAG** 的 AI 平台核心服务，与 OneMini 前端配合使用。

## 架构

```
OneMini 前端 (5173)
  ├─ /api/*           → Node 代理 (3001)  对话 / 图片 / 视频 / 3D
  └─ /api/platform/*  → Python 后端 (8000) Milvus 知识库 + RAG + 对话持久化
         ↓
    Milvus (19530)  ← Docker milvus-standalone
    Attu (3000)     ← 可视化
```

## 完整流程

1. **入库**：在侧栏「知识库」粘贴文本或上传 `.txt/.md` → 分块 → 本地嵌入 (bge-small-zh) → 经 **langchain-milvus** 写入 Milvus
2. **检索**：用户提问 → LangChain 向量检索 Top-K 片段
3. **生成**：检索结果 + 对话历史 → OpenAI 兼容 LLM 流式回答
4. **对话**：勾选「知识库增强」后，对话页走 RAG 接口
5. **历史**：会话与消息写入 Milvus 集合 `onemini_chat`（Attu 可查看），详见 [docs/milvus-chat-schema.md](docs/milvus-chat-schema.md)

## 快速开始

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env：至少配置 OPENAI_API_KEY（或 DeepSeek 等兼容 Key）

python run.py
```

- API：http://localhost:8000
- 文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/api/platform/health

## Milvus（Docker）

确保容器端口映射为 **19530**（与截图一致）。默认连接：

```
MILVUS_HOST=127.0.0.1
MILVUS_PORT=19530
```

Attu：http://localhost:3000

## 环境变量

| 变量 | 说明 |
|------|------|
| `MILVUS_HOST` / `MILVUS_PORT` | Milvus 地址 |
| `OPENAI_API_KEY` | RAG 回答用 LLM |
| `OPENAI_BASE_URL` | 兼容 DeepSeek 等 |
| `EMBEDDING_MODEL` | fastembed 模型，默认 bge-small-zh |

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/platform/health` | Milvus / 嵌入 / LLM 状态 |
| GET | `/api/platform/knowledge/documents` | 文档列表 |
| POST | `/api/platform/knowledge/documents` | 文本入库 |
| POST | `/api/platform/knowledge/documents/upload` | 文件上传 |
| DELETE | `/api/platform/knowledge/documents/{doc_id}` | 删除 |
| POST | `/api/platform/knowledge/search` | 语义检索 |
| POST | `/api/platform/chat/rag` | RAG 对话 |
| POST | `/api/platform/chat/rag/stream` | RAG 流式 |
| GET | `/api/platform/wiki/status` | LLM-Wiki 状态 |
| GET | `/api/platform/wiki/graph` | 知识图谱 JSON |
| POST | `/api/platform/wiki/graph/rebuild` | 构建知识框架（默认先 LLM ingest 未处理 raw，再重建图谱） |
| GET | `/api/platform/wiki/ingest/status` | 批量 ingest 进度（后台队列） |
| GET | `/api/platform/wiki/raw` | raw 文件列表 |
| POST | `/api/platform/wiki/raw/upload` | 上传 raw（md/pdf/docx/xlsx 等） |
| DELETE | `/api/platform/wiki/raw?path=...` | 删除 raw |

## 与前端联调

```bash
# 终端 1：Python 平台
cd backend && source .venv/bin/activate && python run.py

# 终端 2：OneMini（Node + Vite）
cd OneMini && npm run dev
```

访问 http://localhost:5173 → **知识库** 录入文档 → 勾选 RAG → **对话** 提问。
