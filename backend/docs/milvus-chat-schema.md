# Milvus 对话存储 schema（`onemini_chat`）

在 **Attu** 中连接 `MILVUS_HOST:MILVUS_PORT`（默认 `127.0.0.1:19530`），可看到本集合与知识库 `onemini_knowledge_bgem3` 并列。

## 设计原则

| 原则 | 说明 |
|------|------|
| 单集合多实体 | `entity_type` 区分 `conversation` / `message`，便于 Attu 统一查看 |
| 用户隔离 | `user_id` 字段，请求头 `X-User-Id`（默认 `default`） |
| 软删除 | `status`: `active` / `deleted`（删除会话时级联删消息行） |
| 向量字段 | `embedding` 由消息 `content` 生成，支持 `/conversations/search` 语义检索 |
| 扩展字段 | `attachments_json`、`metadata_json` 存 JSON |

## 字段一览

| 字段 | 类型 | conversation | message |
|------|------|:------------:|:-------:|
| id | VARCHAR(64) PK | ✓ | ✓ |
| user_id | VARCHAR(64) | ✓ | ✓ |
| entity_type | VARCHAR(16) | `conversation` | `message` |
| conversation_id | VARCHAR(64) | = id | 父会话 id |
| title | VARCHAR(256) | ✓ | — |
| role | VARCHAR(16) | — | user/assistant/system |
| message_type | VARCHAR(16) | — | text/image/video/… |
| skill_id | VARCHAR(32) | — | chat/image/… |
| content | VARCHAR(8192) | — | 正文 |
| sort_index | INT64 | 0 | 排序 |
| status | VARCHAR(16) | active | active |
| attachments_json | VARCHAR(8192) | — | 附件 JSON |
| metadata_json | VARCHAR(4096) | 预留 | 预留 |
| created_at | INT64 | ms 时间戳 | ms 时间戳 |
| updated_at | INT64 | ms 时间戳 | ms 时间戳 |
| embedding | FLOAT_VECTOR | 标题向量 | 正文向量 |

## REST API（前缀 `/api/platform/conversations`）

- `GET /` — 列表（`?include=messages` 含消息）
- `POST /` — 新建
- `GET /{id}` — 详情
- `PUT /{id}/messages` — 整段替换消息
- `DELETE /{id}` — 删除
- `POST /import` — 批量导入（localStorage 迁移）
- `POST /search` — 语义搜索历史消息
- `GET /storage/info` — Milvus / Attu 连接提示

## 环境变量

```env
MILVUS_HOST=127.0.0.1
MILVUS_PORT=19530
MILVUS_CHAT_COLLECTION=onemini_chat
```
