# OneMini · LLM-Wiki 知识库

基于 [Karpathy LLM-Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 范式的**结构化、可复利**个人知识库。与项目内 **Milvus 向量 RAG**（侧栏「知识库」）是两套独立系统，用途不同，请勿混用路径或入库流程。

## 与 Milvus RAG 的区别

| 维度 | LLM-Wiki（本目录） | Milvus RAG（`backend/` + 前端「知识库」） |
|------|-------------------|----------------------------------------|
| 存储 | Git 管理的 Markdown 文件 | Milvus 集合 `onemini_knowledge` |
| 检索 | `index.md` + 双向链接 + 可选 `graph/links.json` | 向量相似度 + 分块 |
| 维护者 | LLM Agent 增量编写/更新 wiki 页 | 用户上传 → 分块 → 嵌入入库 |
| 知识形态 | 实体页、概念页、综合论述、显式矛盾标记 | 原文碎片 + 查询时拼接 |
| 适用场景 | 长期研究、跨文档综合、可浏览知识图谱 | 对话时快速「资料增强」问答 |

**原则**：`raw/` 与 `wiki/` 不由 Milvus 管道写入；UI 知识库不入本 wiki。二者可并存，但应标明来源。

**Git**：`wiki/`、`raw/`、生成的 `graph/links.json` 等已在仓库根 `.gitignore` 中忽略，仅本地积累；入库的是本目录下的 `README.md`、`WIKI.md`、`templates/`、`scripts/` 等脚手架。

## 三层架构

```
llm-wiki/
├── raw/              # 原始资料（只读，LLM 不修改）
│   ├── 09-archive/   # 已 ingest 归档（按 YYYY-MM）
│   └── assets/       # 图片等附件（Obsidian 下载用）
├── wiki/             # LLM 维护的合成层（Markdown + [[wikilink]]）
│   ├── index.md      # 总目录（链到各分类目录）
│   ├── index-*.md    # 分类目录：按来源/概念/实体等类型浏览
│   ├── log.md        # 时间线操作日志
│   ├── entities/     # 实体（人、组织、产品…）
│   ├── concepts/     # 概念与主题
│   ├── sources/      # 单篇来源摘要
│   ├── synthesis/    # 跨来源综合
│   └── queries/      # 问答沉淀（可选写回）
├── graph/            # 机器可读图谱（由脚本从 wikilink 生成）
├── templates/        # 页面模板
├── scripts/          # 图谱构建等工具
├── WIKI.md           # Schema：Agent 维护规范（必读）
└── .obsidian/        # Obsidian 可选配置（图谱视图）
```

## 核心操作

1. **Ingest（网页）**：将资料放入 `raw/`（或在前端「知识图谱」多文件上传），点击 **「构建知识框架」**。后端会按队列调用 LLM（`OPENAI_API_KEY`），为每篇 raw 生成 `wiki/sources/`、`wiki/concepts/`、`wiki/entities/` 等，并更新 `wiki/index.md`、`wiki/log.md`，最后运行 `build_graph.py`。
2. **Ingest（Agent）**：亦可按 `WIKI.md` 在 Cursor 中手动 ingest。
3. **Query**：先读 `wiki/index.md`，再读相关页面合成回答；有价值的结果可写入 `wiki/queries/`。
4. **Lint**：检查矛盾、孤儿页、缺失概念页、断链；结果记入 `log.md`。

## 后续补充 raw 资料

计划来源示例：[Karpathy llm-wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)（可保存为 `raw/external/karpathy-llm-wiki.md`）。

推荐工具：

- [Obsidian Web Clipper](https://obsidian.md/clipper) 剪藏网页到 `raw/`
- Obsidian 打开本目录为 Vault，用图谱视图浏览 `wiki/`

## 图谱

```bash
# 从 wiki 内 [[wikilink]] 生成 graph/links.json
python3 llm-wiki/scripts/build_graph.py
```

前端或后端若需展示图谱，应读取 `graph/links.json`，**不要**与 Milvus 集合混用。

## Agent 入口

在 Cursor / Claude Code 中处理本知识库时，请先阅读 **`WIKI.md`**，并限定工作目录为 `llm-wiki/`。
