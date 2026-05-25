# 工具与环境备注（TOOLS.md）

> 对标 OpenClaw：记录环境事实（端点、密钥位置、设备名），不重复 openclaw.json / onemini.json 里的策略。

## API 与模型
- 对话/多智能体：见「模型配置」与 `onemini.json` 的 `models.primary` / `fallbacks`
- 3D 世界：腾讯云混元生 3D，密钥在服务端 `.env`（`TENCENT_SECRET_ID` / `KEY`）

## 技能约定
- 创作页「使用技能」仅展示已在运行时启用且勾选的插件 ID
- 图片/视频类插件会在用户输入前自动附加 `promptHint`

## 本地路径（示例，可按机器修改）
- 工作区模板：`frontend/agent-config/`
- 用户覆盖：浏览器 `localStorage` → `onemini-agent-config-v1`
