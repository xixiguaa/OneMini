# LLM-Wiki Schema · OneMini

> 本文件是 LLM-Wiki 的「宪法」。Agent 在 `llm-wiki/` 内执行 ingest / query / lint 时必须遵守。  
> **禁止**将本 wiki 写入 Milvus；**禁止**修改 `raw/` 下已有文件内容（仅可新增 raw 文件）。

## 1. 目录约定

| 路径 | 类型 | 说明 |
|------|------|------|
| `raw/` | 原始层 | 用户/剪藏导入的不可变来源；按主题分子目录，如 `raw/3d/`, `raw/external/` |
| `raw/assets/` | 附件 | 图片等；Obsidian「下载附件」目标目录 |
| `wiki/entities/` | 实体页 | 具体对象：人物、产品、论文、项目 |
| `wiki/concepts/` | 概念页 | 抽象主题、方法、术语 |
| `wiki/sources/` | 来源摘要 | 一篇 raw 对应一篇（或一组）摘要页 |
| `wiki/synthesis/` | 综合页 | 跨多来源的论述、对比、立场演化 |
| `wiki/queries/` | 查询沉淀 | 高价值问答可归档，便于复利 |
| `wiki/index.md` | 总目录 | 链到各「分类目录」 |
| `wiki/index-sources.md` 等 | 分类目录 | 按类型列出页面，如来源 / 概念 / 实体 |
| `wiki/log.md` | 日志 | 仅追加，不删改历史条目 |
| `graph/links.json` | 图谱 | 运行 `scripts/build_graph.py` 后更新 |

## 2. 页面 Frontmatter（YAML）

每篇 wiki 页（除 `index.md` / `log.md`）必须包含：

```yaml
---
title: 页面标题
type: entity | concept | source | synthesis | query
aliases: []          # 别名，便于 Query 匹配
tags: []
sources: []          # 对应 raw 相对路径，如 raw/external/foo.md
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: draft | published
source_count: 0      # 支撑该页的 raw/来源数量
---
```

## 3. Wikilink 与关系类型

- 正文使用 Obsidian 风格：`[[概念名]]` 或 `[[entities/xxx|显示名]]`。
- 显式关系（可选，写在段落末或「相关」小节）：
  - `relates_to` — 相关
  - `part_of` — 组成/属于
  - `contradicts` — 与某页主张冲突（须在两侧注明）
  - `supersedes` — 新结论取代旧页表述
  - `derived_from` — 推理自某来源摘要

Lint 时应优先修复 `contradicts` 未双向链接的情况。

## 4. 页面结构模板

- 实体 / 概念：见 `templates/entity.md`、`templates/concept.md`
- 来源摘要：见 `templates/source-summary.md`
- 综合：见 `templates/synthesis.md`

每页末尾保留 **开放问题** 小节，列出尚未解决或缺少来源的论断。

## 5. 操作工作流

### Ingest（单篇 raw 推荐）

1. 阅读 `raw/...` 全文（图片见 `raw/assets/`，可分开读）。
2. 与用户确认 3～5 条要点（若用户无明确要求，可简要列出后执行）。
3. 新建或更新 `wiki/sources/<slug>.md`。
4. 更新所有受影响的 `entities/`、`concepts/`、`synthesis/` 页面。
5. 更新 `wiki/index.md` 与 `wiki/index-*.md` 分类目录。
6. 追加 `wiki/log.md`：
   ```markdown
   ## [YYYY-MM-DD] ingest | 来源标题
   - raw: `raw/...`
   - 新建: ...
   - 更新: ...
   ```
7. 运行 `python3 llm-wiki/scripts/build_graph.py` 更新图谱。

### Query

1. 读 `wiki/index.md` 定位相关页。
2. 读取 2～8 篇最相关 wiki 页（勿直接扫全部 `raw/`）。
3. 回答须标注依据（页面名 + 必要时 raw 路径）。
4. 若用户认可，可将问答存入 `wiki/queries/<slug>.md` 并更新 index。

### Lint

检查项：

- [ ] 矛盾：`contradicts` 或正文冲突
- [ ] 过时：`supersedes` / 新 raw 未反映到实体页
- [ ] 孤儿：index 未收录或无任何入链
- [ ] 缺失概念：文中提及但未建 `concepts/` 页
- [ ] 断链：`[[...]]` 目标不存在

日志格式：

```markdown
## [YYYY-MM-DD] lint
- 发现: ...
- 已修复: ...
- 待用户确认: ...
```

## 6. 与 OneMini 其他模块

- 对话页「知识库」可切换三种模式：**关闭** / **Milvus RAG** / **LLM-Wiki**（检索 `wiki/` 结构化页，非向量库）。
- Ingest 成功后 raw 自动移至 `raw/09-archive/YYYY-MM/`（L1.5 归档层）；与已有 wiki 页差异过大时写入 `.ingest-conflicts.json`，在「知识图谱」页选择 **覆盖 / 保留双方 / 放弃新稿**。
- Agent 配置（`AGENTS.md`）与 Milvus 知识库路径分离，勿混用 ingest 流程。
- 项目代码变更、API 文档 → 仍放在仓库 `README.md` / `backend/docs/`，不强行写入本 wiki，除非用户指定主题为「OneMini 自文档化」。

## 7. 命名与语言

- 文件名：`kebab-case.md`（英文）或拼音/英文 slug；`title` 可用中文。
- 正文默认 **简体中文**；引用原文可保留英文。
- 单页建议 &lt; 800 行；过长则拆分子页并互链。

## 8. 初始状态

当前 `raw/` 为空，待补充。首次 ingest 建议来源：

- `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f` → 保存为 `raw/external/karpathy-llm-wiki.md`

完成首次 ingest 后，删除本段「初始状态」或改为「已 bootstrap」。
