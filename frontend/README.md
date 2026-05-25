# OneMini · 智能创作助手

类似 OpenClaw 的多技能 AI 智能体，支持**文本对话**、**图片生成**、**视频生成**、**3D 世界生成**，可配置模型与技能。

## 功能

| 技能 | 说明 |
|------|------|
| 文本对话 | 多轮聊天，支持混元 / OpenAI 兼容接口 |
| 图片生成 | 文生图（腾讯云 aiart，演示模式可用占位图） |
| 视频生成 | 任务式视频生成（可扩展真实 API） |
| 世界生成 | 混元3D 文生/图生场景，Three.js 预览 |

## 界面

- **左上角**：OneMini Logo + 品牌标题
- **左侧栏**：新对话、对话、模型配置、技能配置（版本：第一版）
- **对话页**：技能切换（含世界生成）+ 消息流 + 输入框
- **模型配置**：手动添加/编辑/删除模型，填写 API 信息
- **技能配置**：启用技能、绑定模型、System Prompt

已移除：独立世界生成页、世界重建/全景/实时生成、用户积分系统。

## 快速开始

```bash
cp .env.example .env
# 填写 TENCENT_SECRET_ID / TENCENT_SECRET_KEY
# 可选：OPENAI_API_KEY 用于对话

npm install
npm run dev
```

- 前端 http://localhost:5173
- API http://localhost:3001

## 配置说明

### 模型配置（侧栏 → 模型配置）

- 点击「添加模型」手动创建
- 填写：名称、模型标识、能力类型（对话/图片/视频/世界）、服务商、API URL/Key

### 技能配置（侧栏 → 技能配置）

- 启用/禁用各技能
- 为每技能选择已添加的对应类型模型
- 自定义 System Prompt

配置自动保存至 `localStorage`。

## 项目结构

```
src/
├── components/
│   ├── AppSidebar.vue      # 阿集侧栏
│   ├── ChatView.vue        # 对话主界面
│   ├── WorldView.vue       # 世界生成 + 3D 视口
│   ├── SettingsView.vue    # 模型/技能配置
│   └── ...
├── stores/
│   ├── agent.ts            # 对话与技能路由
│   └── settings.ts         # 模型/技能持久化
└── config/defaults.ts      # 默认模型与技能
server/
└── index.js                # chat / image / video / 3D API 代理
```

## API 端点

| 路径 | 说明 |
|------|------|
| POST /api/chat | 文本对话 |
| POST /api/image | 图片生成 |
| POST /api/video | 视频生成 |
| POST /api/submit | 3D 世界提交 |
| POST /api/query | 3D 任务查询 |

## 许可证

MIT
