# 工具与环境备注（TOOLS.md）

> 对标 OpenClaw：记录环境事实（端点、密钥位置、设备名），不重复 openclaw.json / onemini.json 里的策略。

## API 与模型
- **API Key**：仅在服务端加密保险库（`data/secrets.vault`），Web UI 不保存、不回显明文
- **实际对话模型**：以聊天输入框当前所选为准（写入技能 `defaultModelId`）
- **骨架 primary/fallback**：仅作 Agent 运行时默认与多智能体编排，不等于每条消息的后端调用
- 多智能体编排：见 `onemini.json` 的 `models.primary` / `fallbacks`
- 3D 世界：腾讯云混元生 3D，密钥在服务端 `.env`（`TENCENT_SECRET_ID` / `KEY`）

## 技能约定
- 创作页「使用技能」仅展示已在运行时启用且勾选的插件 ID
- 图片/视频类插件会在用户输入前自动附加 `promptHint`

## 本地路径（示例，可按机器修改）
- 工作区模板：`frontend/agent-config/`
- 用户覆盖：浏览器 `localStorage` → `onemini-agent-config-v1`
