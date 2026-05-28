# 知识图谱（机器可读）

`links.json` 由 `scripts/build_graph.py` 从 `wiki/` 中的 `[[wikilink]]` 解析生成，供可视化或 API 使用。

**不要**与 Milvus 向量索引混用；图谱反映的是 wiki 页面之间的显式链接，不是 embedding 相似度。

## 节点类型

与 frontmatter `type` 一致：`entity` | `concept` | `source` | `synthesis` | `query` | `meta`

## 更新

```bash
python3 llm-wiki/scripts/build_graph.py
```

在 Obsidian 中也可使用内置图谱视图（打开 `llm-wiki/` 为 Vault）。
