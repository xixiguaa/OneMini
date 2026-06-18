# 智能体自定义技能商店与 ReAct 统一执行流设计方案

## 1. 总体设计思路

为了简化系统的架构复杂度，并支持智能体（Agent）灵活地加载和使用自定义技能，本方案包含以下两个核心变更：
1. **下线 Claude SDK 相关执行逻辑：** 全面迁移到手动实现的 ReAct 循环（在 `agent_loop.py` 中通过标准 OpenAI Tool-Calling 协议统一运行）。
2. **支持自定义技能上传与配置：** 
   - **全局技能商店：** 允许上传 `.zip` 格式的技能包。Zip 文件中约定包含技能的接口元数据和运行脚本。后端将包存入 MinIO，并在数据库表记录元数据及全局开关。
   - **智能体局部配置：** 允许在每个 Agent 下单独开启或关闭由技能商店发布的可用技能，局部使能的技能 ID 列表将随 Agent 对象的 JSON 数据（配置在 `skeleton.skills.enabledSkillIds`）进行持久化。

---

## 2. 数据库设计 (PostgreSQL)

添加一个新实体 `AgentSkillRow` 用于在关系数据库中追踪自定义上传的技能信息：

| 字段名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `VARCHAR(64)` | 技能的唯一标识符（由上传时从 `skill.json` 解析的主键） |
| `name` | `VARCHAR(128)` | 技能名称（如 "联网搜索"、"自定义数学工具"） |
| `description` | `TEXT` | 技能详细描述 |
| `minio_key` | `VARCHAR(512)` | 对应 ZIP 包在 MinIO 桶中的对象地址，规则为 `skills/{id}.zip` |
| `is_global_enabled` | `BOOLEAN` | 全局启用状态。全局关闭时，任何 Agent 都无法使用该技能 |
| `created_at` | `BIGINT` | 创建时间戳（毫秒） |
| `updated_at` | `BIGINT` | 修改时间戳（毫秒） |

---

## 3. 自定义技能包 (ZIP) 结构约定

上传的自定义技能压缩包应解压包含以下内容：
1. **`skill.json`**: 描述技能的基本信息与提供的工具（符合 OpenAI function schemas 标准格式）。
2. **`main.py`**: Python 运行函数，实现每一个在 `skill.json` 中声明的工具，函数命名应与工具声明的名称一致。

### 示例 `skill.json`
```json
{
  "id": "calc_tool",
  "name": "数学计算器",
  "description": "提供基础的数学算术计算功能",
  "tools": [
    {
      "name": "calc_expr",
      "description": "输入数学表达式，返回计算结果字符串",
      "parameters": {
        "type": "object",
        "properties": {
          "expr": {
            "type": "string",
            "description": "例如：(12 + 24) * 3"
          }
        },
        "required": ["expr"]
      }
    }
  ]
}
```

### 示例 `main.py`
```python
import evalidate  # 后端可进行安全执行，或直接安全处理

async def calc_expr(args: dict) -> str:
    expr = args.get("expr", "")
    try:
        # 这里进行安全的计算解析
        result = eval(expr, {"__builtins__": None}, {})
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"
```

---

## 4. 后端核心服务设计

### 4.1 动态加载与执行逻辑 (`custom_skills_service.py`)
- **文件解包与提取**：当有 Agent 使用该技能时，从 MinIO 下载 ZIP 包，解压提取到本地 `backend/data/skills/{skill_id}/`。
- **模块动态加载**：
  ```python
  import sys
  import importlib.machinery
  from pathlib import Path

  def load_skill_module(skill_id: str):
      path = Path(f"data/skills/{skill_id}/main.py")
      if not path.exists():
          raise FileNotFoundError("main.py not found in the custom skill ZIP")
      loader = importlib.machinery.SourceFileLoader(f"custom_skill_{skill_id}", str(path))
      module = loader.load_module()
      return module
  ```
- **执行工具**：
  ```python
  async def run_custom_tool(skill_id: str, tool_name: str, args: dict) -> str:
      module = load_skill_module(skill_id)
      func = getattr(module, tool_name, None)
      if not func:
          raise AttributeError(f"Tool function {tool_name} not defined in main.py")
      if asyncio.iscoroutinefunction(func):
          return await func(args)
      else:
          return func(args)
  ```

### 4.2 ReAct 执行流拦截改造 (`agent_loop.py`)
- 整合**内置技能**、**自定义技能**和**MCP 外部工具**：
  - 在 `stream_agent_with_mcp_tools` 中，将用户选择的 Agent 的局部使能技能映射为 standard OpenAI Tool 定义，并将其合并注入。
  - 在工具调用回调迭代中，当 LLM 发出工具请求时，拦截并分发：
    - 如果工具属于内置技能（`web-search` 等），直接运行本地对应的 web_search、milvus_rag 或 wiki。
    - 如果工具属于自定义上传的技能包，调用 `run_custom_tool` 进行解包、动态导入并执行。
    - 否则，通过 MCP 管理器分发到外部 MCP Server。

---

## 5. 接口设计

### 1. `POST /api/platform/agent/skills/upload`
- **输入**: Form-data (File: `file`, Optional override string fields: `name`, `description`).
- **逻辑**: 校验 ZIP 结构（合法性检查，包含 `skill.json` 和 `main.py`），上传 ZIP 至 MinIO 对应路径，并入库 `agent_skills` 表。

### 2. `GET /api/platform/agent/skills`
- **返回**: 自定义技能的列表（ID、名称、描述、存储路径、全局使能状态等）。

### 3. `PUT /api/platform/agent/skills/{id}`
- **逻辑**: 修改全局开关或修改技能的展示描述。

### 4. `DELETE /api/platform/agent/skills/{id}`
- **逻辑**: 删除数据库中该技能、删除 MinIO 关联 ZIP 资源，并清空本地已解压的目录缓存。

---

## 6. 前端界面设计

### 6.1 技能商店 (Store Tab: `AgentSkillsPanel.vue`)
- 在右侧添加“上传技能”按钮，点击后弹出对话框，支持拖拽或选择 `.zip` 技能包。
- 技能商店中列出系统中所有注册的技能（系统自带 + 用户自定义）。
- 每一个自定义技能卡片右下角提供**全局启用开关**以及**删除按钮**。

### 6.2 智能体配置 (Config Tab: `AgentPersonaPanel.vue` -> "核心大脑")
- 在核心大脑下方增设“启用的技能 (Skills)”卡片。
- 展示所有目前在“技能商店”全局开启的技能。
- 提供独立开关（仅针对当前正在编辑的 Agent 生效）。
- 选择结果存入 `skeleton.skills.enabledSkillIds: string[]`。
