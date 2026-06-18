# Remove Claude SDK & Custom Skills persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `claude-agent-sdk` client dependency, unify all agent runs via the custom ReAct loop (`stream_agent_with_mcp_tools`), implement a global Skill Store (ZIP uploads to MinIO/DB) with individual Agent skill enable switches, and persist agent configurations in PostgreSQL with a Save Config button in the UI.

**Architecture:** Custom skills are uploaded as ZIP packages containing `skill.json` and `main.py`. The backend registers them in PostgreSQL/MinIO, dynamically extracts and loads the code at runtime, intercepts ReAct tool requests matching custom/built-in tools, and executes them locally. User agents configurations are saved in the `user_agents` table on the backend, allowing loading and saving config bundles.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy, MinIO Python Client, Vue 3, Vite, Pinia.

---

### Task 1: Database Migration

**Files:**
- Modify: [models.py](file:///e:/open-source/OneMini/backend/app/db/models.py)

- [ ] **Step 1: Define the `AgentSkillRow` and `UserAgentRow` model classes**
  Add `AgentSkillRow` and `UserAgentRow` in [models.py](file:///e:/open-source/OneMini/backend/app/db/models.py):
  ```python
  class AgentSkillRow(Base):
      __tablename__ = "agent_skills"

      id: Mapped[str] = mapped_column(String(64), primary_key=True)
      name: Mapped[str] = mapped_column(String(128), nullable=False)
      description: Mapped[str] = mapped_column(Text, default="", nullable=False)
      minio_key: Mapped[str] = mapped_column(String(512), nullable=False)
      is_global_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
      created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
      updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)


  class UserAgentRow(Base):
      __tablename__ = "user_agents"

      id: Mapped[str] = mapped_column(String(64), primary_key=True)
      user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
      name: Mapped[str] = mapped_column(String(128), nullable=False)
      description: Mapped[str] = mapped_column(Text, default="", nullable=False)
      avatar: Mapped[str] = mapped_column(String(128), nullable=False)
      bundle: Mapped[str] = mapped_column(Text, nullable=False) # JSON serialized AgentConfigBundle
      created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
      updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
  ```
- [ ] **Step 2: Verify database startup auto-migration**
  Restart the python backend server to ensure PostgreSQL connects and automatically creates the tables.

---

### Task 2: Backend Dynamic Skill Loader Service

**Files:**
- Create: [custom_skills_service.py](file:///e:/open-source/OneMini/backend/app/services/custom_skills_service.py)

- [ ] **Step 1: Implement ZIP verification, database CRUD, and dynamic execution**
  Ensure ZIP validation parses `skill.json` and verifies `main.py`, extracts to `backend/data/skills/{skill_id}`, dynamically imports the `main` module using `importlib.util.spec_from_file_location`, and handles async/sync function dispatch.

---

### Task 3: Backend Custom Skills API Router

**Files:**
- Create: [skills.py](file:///e:/open-source/OneMini/backend/app/routers/skills.py)
- Modify: [main.py](file:///e:/open-source/OneMini/backend/app/main.py)

- [ ] **Step 1: Write Custom Skills API Endpoints**
  Provide endpoints: `POST /api/platform/agent/skills/upload`, `GET /api/platform/agent/skills`, `PUT /api/platform/agent/skills/{id}`, `DELETE /api/platform/agent/skills/{id}`.
- [ ] **Step 2: Register Skills Router**
  Include skills router in [main.py](file:///e:/open-source/OneMini/backend/app/main.py).

---

### Task 4: Backend Agent Config Persistence & Unified ReAct Loop

**Files:**
- Modify: [agent.py](file:///e:/open-source/OneMini/backend/app/routers/agent.py)
- Modify: [agent_loop.py](file:///e:/open-source/OneMini/backend/app/services/mcp/agent_loop.py)
- Delete: [claude_agent_service.py](file:///e:/open-source/OneMini/backend/app/services/claude_agent_service.py)

- [ ] **Step 1: Add CRUD endpoints for Agent Persistence in `agent.py`**
  ```python
  from app.db.models import UserAgentRow
  from app.db.session import get_session
  import time

  class SaveAgentRequest(BaseModel):
      id: str
      name: str
      description: str
      avatar: str
      bundle: dict

  @router.get("/list")
  async def list_agents(user_id: str = Depends(get_current_user)):
      with get_session() as db:
          rows = db.query(UserAgentRow).filter(UserAgentRow.user_id == user_id).all()
          return [
              {
                  "id": r.id,
                  "name": r.name,
                  "description": r.description,
                  "avatar": r.avatar,
                  "bundle": json.loads(r.bundle),
                  "created_at": r.created_at,
                  "updated_at": r.updated_at
              }
              for r in rows
          ]

  @router.post("/save")
  async def save_agent(req: SaveAgentRequest, user_id: str = Depends(get_current_user)):
      with get_session() as db:
          now = int(time.time() * 1000)
          row = db.query(UserAgentRow).filter(UserAgentRow.id == req.id, UserAgentRow.user_id == user_id).first()
          if row:
              row.name = req.name
              row.description = req.description
              row.avatar = req.avatar
              row.bundle = json.dumps(req.bundle, ensure_ascii=False)
              row.updated_at = now
          else:
              row = UserAgentRow(
                  id=req.id,
                  user_id=user_id,
                  name=req.name,
                  description=req.description,
                  avatar=req.avatar,
                  bundle=json.dumps(req.bundle, ensure_ascii=False),
                  created_at=now,
                  updated_at=now
              )
              db.add(row)
          db.commit()
          return {"success": True}

  @router.delete("/{agent_id}")
  async def delete_agent(agent_id: str, user_id: str = Depends(get_current_user)):
      with get_session() as db:
          row = db.query(UserAgentRow).filter(UserAgentRow.id == agent_id, UserAgentRow.user_id == user_id).first()
          if not row:
              raise HTTPException(404, "未找到指定的智能体")
          db.delete(row)
          db.commit()
          return {"success": True}
  ```
- [ ] **Step 2: Unify `/chat/stream` in `agent.py` to route to unified custom loop**
  Remove the Claude SDK code from `agent.py` completely. Delete `claude_agent_service.py`.
- [ ] **Step 3: Modify `agent_loop.py` to compile custom & built-in skill tools**
  Merge custom skill tools (if matched from user's active/enabled skills) and local built-ins (Web Search, RAG, Wiki) into the OpenAI tools array. Intercept functions prefixed with `custom__` or `local__` and call their respective local execution modules.

---

### Task 5: Frontend Store Configuration Extension

**Files:**
- Modify: [agentConfig.ts](file:///e:/open-source/OneMini/frontend/src/types/agentConfig.ts)
- Modify: [agentConfig.ts](file:///e:/open-source/OneMini/frontend/src/stores/agentConfig.ts)
- Modify: [userAgents.ts](file:///e:/open-source/OneMini/frontend/src/stores/userAgents.ts)
- Create: [customSkills.ts](file:///e:/open-source/OneMini/frontend/src/api/customSkills.ts)
- Modify: [agent.ts (API)](file:///e:/open-source/OneMini/frontend/src/api/agent.ts)

- [ ] **Step 1: Add `enabledSkillIds?: string[]` to Store types and skeleton**
  Expose `enabledSkillIds: string[]` in Vue/Pinia store.
- [ ] **Step 2: Connect `userAgents.ts` to backend APIs**
  In [userAgents.ts](file:///e:/open-source/OneMini/frontend/src/stores/userAgents.ts), add a startup initialization function:
  ```typescript
  async function syncFromBackend() {
    try {
      const res = await fetch('/api/platform/agent/list', { headers: platformAuthHeaders() })
      if (res.ok) {
        const list = await res.json()
        if (list.length > 0) {
          agents.value = list.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            avatar: a.avatar,
            bundle: cloneAgentConfigBundle(a.bundle),
            createdAt: a.created_at,
            updatedAt: a.updated_at
          }))
          activeAgentId.value = list.some(a => a.id === activeAgentId.value) ? activeAgentId.value : list[0].id
        }
      }
    } catch (e) {
      console.error('Failed to sync user agents from backend', e)
    }
  }
  ```
  And implement `saveAgentToBackend(agentId)` calling `/api/platform/agent/save` with the agent's bundle payload.
  Call `syncFromBackend` on store initialization or when user logs in.

---

### Task 6: Frontend "Save Configuration" Button

**Files:**
- Modify: [SkillsView.vue](file:///e:/open-source/OneMini/frontend/src/views/skills/SkillsView.vue)

- [ ] **Step 1: Add Save Trigger button and trigger Save API**
  Add a button in the `workspace-actions` toolbar in [SkillsView.vue](file:///e:/open-source/OneMini/frontend/src/views/skills/SkillsView.vue):
  ```html
  <button
    type="button"
    class="save-trigger"
    :disabled="saving"
    @click="saveActiveAgent"
  >
    <Loader2 v-if="saving" :size="15" class="om-loading-spinner" />
    <Save v-else :size="15" />
    {{ saving ? '保存中…' : '保存配置' }}
  </button>
  ```
  Implement the save logic calling `userAgents.saveAgentToBackend(userAgents.activeAgentId)` and showing success feedback/toast.

---

### Task 7: Frontend Global Skill Store UI

**Files:**
- Modify: [AgentSkillsPanel.vue](file:///e:/open-source/OneMini/frontend/src/components/AgentSkillsPanel.vue)

- [ ] **Step 1: Add Custom Skills management to Skill Store**
  Allow uploading ZIP via the "添加技能" dropdown option, display custom skills in the grid, support toggling global enablement via `PUT /api/platform/agent/skills/{id}`, and delete capability.

---

### Task 8: Frontend Per-Agent Skills Configuration UI

**Files:**
- Modify: [AgentPersonaPanel.vue](file:///e:/open-source/OneMini/frontend/src/components/AgentPersonaPanel.vue)

- [ ] **Step 1: Add Available Skills checklist in Core Brain configuration tab**
  List all globally enabled custom and built-in skills, providing toggle checkboxes linked to `skeleton.skills.enabledSkillIds`.

---

### Task 9: Sandbox and Main Chat Flow Update

**Files:**
- Modify: [AgentConfigSandbox.vue](file:///e:/open-source/OneMini/frontend/src/components/AgentConfigSandbox.vue)
- Modify: [agent.ts (store)](file:///e:/open-source/OneMini/frontend/src/stores/agent.ts)

- [ ] **Step 1: Query local enabled skills and send to backend**
  Ensure sandbox and chat request payload `enabledSkills` are compiled directly from the active agent's local `skeleton.skills.enabledSkillIds`.
