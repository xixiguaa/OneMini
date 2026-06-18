<script setup lang="ts">
import { Cpu, Loader2, Plus, Search } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import AgentSkillDetailSheet from './AgentSkillDetailSheet.vue'
import { fetchMcpStatus, fetchMcpTools, type McpToolPayload } from '../api/mcp'
import {
  fetchCustomSkillsApi,
  uploadCustomSkillApi,
  toggleCustomSkillApi,
  deleteCustomSkillApi,
  type CustomSkillPayload,
} from '../api/agent'
import {
  AGENT_SKILL_CATALOG,
  catalogItemForMcpTool,
  getCatalogItem,
  type AgentSkillCatalogItem,
} from '../config/agentSkillCatalog'
import { useAgentConfigStore } from '../stores/agentConfig'
import { usePlatformStore } from '../stores/platform'
import { useToastStore } from '../stores/toast'

// 技能页：卡片展示 description 与 source 路径，参考 marketplace 卡片布局
const agentConfig = useAgentConfigStore()
const platform = usePlatformStore()
const toast = useToastStore()

const search = ref('')
const selectedId = ref<string | null>(null)
const addMenuOpen = ref(false)
const mcpLoading = ref(false)
const mcpConnected = ref(false)
const mcpTools = ref<McpToolPayload[]>([])
const customSkills = ref<CustomSkillPayload[]>([])
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const mcpCatalogItems = computed(() =>
  mcpTools.value.map((t) => catalogItemForMcpTool(t)),
)

const customCatalogItems = computed((): AgentSkillCatalogItem[] => {
  return customSkills.value.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || '自定义技能包',
    kind: 'custom',
    icon: Cpu,
    iconTone: 'pink',
    availability: 'ready',
    defaultInvokeDescription: s.description || '调用此自定义技能。',
    isCustom: true,
    isGlobalEnabled: s.is_global_enabled,
  } as any))
})

const allSkills = computed(() => {
  const hidden = new Set(agentConfig.skeleton.skills.hiddenSkillIds ?? [])
  return [...AGENT_SKILL_CATALOG, ...mcpCatalogItems.value, ...customCatalogItems.value].filter((s) => !hidden.has(s.id))
})

const filteredSkills = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return allSkills.value
  return allSkills.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q),
  )
})

const enabledSkills = computed(() =>
  filteredSkills.value.filter((s) => isSkillEnabled(s) && s.availability !== 'planned'),
)
const disabledSkills = computed(() =>
  filteredSkills.value.filter((s) => !isSkillEnabled(s) || s.availability === 'planned'),
)

const skillSections = computed(() =>
  [
    { key: 'on', label: '已启用', items: enabledSkills.value, dim: false },
    { key: 'off', label: '未启用', items: disabledSkills.value, dim: true },
  ].filter((s) => s.items.length > 0),
)

const selectedSkill = computed(() =>
  selectedId.value ? getCatalogItem(selectedId.value, [...mcpCatalogItems.value, ...customCatalogItems.value]) : null,
)

const selectedMcpName = computed(() => {
  if (!selectedId.value?.startsWith('mcp:')) return undefined
  return selectedId.value.slice(4)
})

function isSkillEnabled(item: AgentSkillCatalogItem) {
  if (item.availability === 'planned') return false
  if ((item as any).isCustom) {
    return (item as any).isGlobalEnabled
  }
  switch (item.id) {
    case 'web-search':
      return platform.webSearchEnabled
    case 'knowledge-rag':
      return platform.knowledgeChatMode === 'rag'
    case 'knowledge-wiki':
      return platform.knowledgeChatMode === 'wiki'
    case 'code-exec':
      return false
    default:
      break
  }
  if (item.kind === 'mcp') return mcpConnected.value
  return false
}

// 只有 planned 技能和非自定义的 MCP 技能禁止在前台 global 级别 toggle
function canToggle(item: AgentSkillCatalogItem) {
  if (item.availability === 'planned') return false
  if (item.kind === 'mcp' && !(item as any).isCustom) return false
  return true
}

function statusLabel(item: AgentSkillCatalogItem) {
  if (item.availability === 'planned') return '规划中'
  if (item.kind === 'mcp' && !mcpConnected.value) return '需配置'
  return isSkillEnabled(item) ? '已启用' : '未启用'
}

function statusKind(item: AgentSkillCatalogItem) {
  const label = statusLabel(item)
  if (label === '已启用') return 'on'
  if (label === '需配置') return 'auth'
  if (label === '规划中') return 'planned'
  return 'off'
}

function skillSource(item: AgentSkillCatalogItem): string {
  if ((item as any).isCustom) {
    return `custom/${item.id}`
  }
  if (item.kind === 'mcp') {
    return item.id.startsWith('mcp:') ? item.id.slice(4) : item.id
  }
  const map: Record<string, string> = {
    'web-search': 'onemini/web-search',
    'knowledge-rag': 'onemini/milvus-rag',
    'knowledge-wiki': 'onemini/llm-wiki',
    'code-exec': 'onemini/sandbox',
  }
  return map[item.id] ?? `onemini/${item.id}`
}

function selectSkill(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}

async function toggleSkill(item: AgentSkillCatalogItem, on: boolean) {
  if ((item as any).isCustom) {
    try {
      await toggleCustomSkillApi(item.id, on)
      toast.showSuccess(`技能全局${on ? '启用' : '禁用'}成功`)
      await refreshCustomSkills()
    } catch (e: any) {
      toast.showError(e.message || '更新状态失败')
    }
    return
  }
  switch (item.id) {
    case 'web-search':
      platform.setWebSearchEnabled(on)
      return
    case 'knowledge-rag':
      platform.setKnowledgeChatMode(on ? 'rag' : 'off')
      return
    case 'knowledge-wiki':
      platform.setKnowledgeChatMode(on ? 'wiki' : 'off')
      return
  }
}

function onCardToggle(item: AgentSkillCatalogItem, e: Event) {
  e.stopPropagation()
  if (!canToggle(item)) return
  void toggleSkill(item, (e.target as HTMLInputElement).checked)
}

async function refreshMcp() {
  mcpLoading.value = true
  try {
    const [status, toolsRes] = await Promise.all([fetchMcpStatus(), fetchMcpTools()])
    mcpConnected.value = status.enabled && status.connected
    mcpTools.value = toolsRes.tools
  } catch {
    mcpConnected.value = false
    mcpTools.value = []
  } finally {
    mcpLoading.value = false
  }
}

async function refreshCustomSkills() {
  try {
    customSkills.value = await fetchCustomSkillsApi()
  } catch (e) {
    console.error('Failed to load custom skills:', e)
  }
}

function triggerUpload() {
  addMenuOpen.value = false
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    await uploadCustomSkillApi(file)
    toast.showSuccess('自定义技能上传成功')
    await refreshCustomSkills()
  } catch (err: any) {
    toast.showError(err.message || '上传失败')
  } finally {
    uploading.value = false
    target.value = ''
  }
}

async function onRemoveSelected() {
  if (!selectedId.value) return
  const item = selectedSkill.value
  if (item && (item as any).isCustom) {
    if (confirm(`确定要彻底删除自定义技能「${item.name}」吗？\n该操作会同步删除云端存储的技能包。`)) {
      try {
        await deleteCustomSkillApi(item.id)
        toast.showSuccess('自定义技能删除成功')
        selectedId.value = null
        await refreshCustomSkills()
      } catch (err: any) {
        toast.showError(err.message || '删除失败')
      }
    }
    return
  }
  agentConfig.hideSkillId(selectedId.value)
  selectedId.value = null
}

function closeSheet() {
  selectedId.value = null
}

onMounted(() => {
  void refreshMcp()
  void refreshCustomSkills()
})
</script>

<template>
  <div class="skill-mgmt" :class="{ 'skill-mgmt--detail-open': !!selectedSkill }">
    <header class="skill-toolbar">
      <div class="skill-toolbar__actions">
        <label class="skill-search embedded-field">
          <Search :size="14" aria-hidden="true" />
          <input v-model="search" type="search" />
          <Loader2 v-if="mcpLoading || uploading" :size="14" class="skill-search__spinner om-loading-spinner" />
        </label>
        <div class="add-wrap">
          <button type="button" class="btn-add" @click="addMenuOpen = !addMenuOpen">
            <Plus :size="14" />
            添加技能
          </button>
          <div v-if="addMenuOpen" class="add-menu">
            <button type="button" @click="addMenuOpen = false; refreshMcp()">
              刷新 MCP 工具
            </button>
            <button type="button" @click="triggerUpload">
              上传 ZIP 技能包
            </button>
            <button type="button" disabled>从模板库添加…</button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".zip"
            style="display: none"
            @change="onFileChange"
          />
        </div>
      </div>
    </header>

    <div class="skill-mgmt__body">
      <div class="skill-mgmt__list">
        <section v-for="section in skillSections" :key="section.key" class="skill-section">
          <h3 class="skill-section__label">{{ section.label }}</h3>
          <div class="skill-grid">
            <article
              v-for="item in section.items"
              :key="item.id"
              class="skill-card"
              :class="{ active: selectedId === item.id, 'skill-card--dim': section.dim }"
              @click="selectSkill(item.id)"
            >
              <header class="skill-card__head">
                <h4 class="skill-card__title">{{ item.name }}</h4>
                <span class="skill-card__status" :class="`skill-card__status--${statusKind(item)}`">
                  {{ statusLabel(item) }}
                </span>
              </header>

              <div class="skill-card__divider" />

              <div class="skill-card__source">
                <span class="skill-card__avatar" :class="`skill-card__avatar--${item.iconTone}`">
                  <component :is="item.icon" :size="13" stroke-width="2" />
                </span>
                <span class="skill-card__source-text">{{ skillSource(item) }}</span>
              </div>

              <p class="skill-card__desc">{{ item.description }}</p>

              <footer class="skill-card__foot">
                <span class="skill-card__meta">{{ item.id }}</span>
                <label class="skill-card__toggle" @click.stop>
                  <input
                    type="checkbox"
                    :checked="isSkillEnabled(item)"
                    :disabled="!canToggle(item)"
                    @change="onCardToggle(item, $event)"
                  />
                  <span class="switch" />
                </label>
              </footer>
            </article>
          </div>
        </section>

        <p v-if="!filteredSkills.length" class="skill-empty">没有匹配的技能</p>
      </div>

      <aside v-if="selectedSkill" class="skill-mgmt__detail" aria-label="技能详情">
        <AgentSkillDetailSheet
          :skill="selectedSkill"
          :mcp-qualified-name="selectedMcpName"
          @close="closeSheet"
          @save="closeSheet"
          @remove="onRemoveSelected"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.skill-mgmt {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  position: relative;
}

.skill-mgmt__body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0;
  overflow: hidden;
}

.skill-mgmt__list {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
}

.skill-mgmt--detail-open .skill-mgmt__list {
  flex: 1 1 62%;
  padding-right: 16px;
}

.skill-mgmt__detail {
  flex: 0 0 min(360px, 38%);
  min-width: 280px;
  max-width: 420px;
  min-height: 0;
  display: flex;
  align-self: stretch;
  margin: 0;
}

.skill-mgmt--detail-open .skill-mgmt__detail {
  :deep(.skill-detail) {
    width: 100%;
    border-radius: 0;
    border-right: none;
  }
}

.skill-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid $border-light;
}

.skill-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.skill-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(240px, 100%);
  min-width: 140px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid $border-light;
  background: var(--bg-card);
  color: $text-muted;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:focus-within {
    border-color: color-mix(in srgb, $accent 40%, $border-light);
    box-shadow: $shadow-focus;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    font-size: 13px;
    color: $text-primary;
    outline: none;
  }

  &__spinner {
    flex-shrink: 0;
    color: $text-muted;
  }
}

.add-wrap {
  position: relative;
  flex-shrink: 0;
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--btn-primary-text);
  background: var(--btn-primary-gradient, $accent);
  box-shadow: var(--btn-primary-shadow);
  border: none;
  white-space: nowrap;

  &:hover {
    filter: brightness(1.04);
  }
}

.add-menu {
  @include cosmic.cosmic-glass-dropdown-menu(12px);
  top: calc(100% + 6px);
  right: 0;
  left: auto;
  min-width: 160px;
  z-index: 5;

  button {
    @include cosmic.cosmic-glass-dropdown-option;
    font-size: 12px;
  }
}

.skill-section {
  margin-bottom: 20px;
}

.skill-section__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $text-muted;
  margin-bottom: 10px;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.skill-card {
  display: flex;
  flex-direction: column;
  min-height: 168px;
  padding: 16px 16px 14px;
  cursor: pointer;
  @include cosmic.cosmic-glass-frost(var(--glass-radius-sm, 14px));
  background: var(--glass-fill-gradient);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease,
    backdrop-filter 0.18s ease;

  &:hover {
    @include cosmic.cosmic-glass-hover;
    transform: translateY(-1px);
  }

  &.active {
    @include cosmic.cosmic-glass-active;
    box-shadow:
      0 0 0 1px color-mix(in srgb, $accent 32%, transparent),
      var(--glass-float-shadow-hover, var(--glass-float-shadow, $shadow-md));
  }

  &--dim {
    opacity: 0.78;
  }
}

.skill-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.skill-card__title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  line-height: 1.35;
}

.skill-card__divider {
  height: 1px;
  margin: 12px 0 10px;
  background: color-mix(in srgb, $border-light 65%, transparent);
}

.skill-card__source {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  min-width: 0;
}

.skill-card__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, $accent 12%, transparent);
  color: $accent;

  &--blue {
    background: color-mix(in srgb, #3b82f6 12%, transparent);
    color: #4f7fe8;
  }
  &--green {
    background: color-mix(in srgb, $color-success 12%, transparent);
    color: $color-success;
  }
  &--purple {
    background: color-mix(in srgb, $accent 12%, transparent);
    color: $accent;
  }
  &--pink {
    background: color-mix(in srgb, #ec4899 12%, transparent);
    color: #e05a9a;
  }
  &--orange {
    background: color-mix(in srgb, $accent-gold 14%, transparent);
    color: color-mix(in srgb, $accent-gold 85%, #000);
  }
  &--cyan {
    background: color-mix(in srgb, $accent-cyan 12%, transparent);
    color: $accent-cyan;
  }
  &--slate {
    background: color-mix(in srgb, $text-muted 12%, transparent);
    color: $text-secondary;
  }
}

.skill-card__source-text {
  font-size: 12px;
  color: $text-muted;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-card__desc {
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: $text-secondary;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.skill-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, $border-light 55%, transparent);
}

.skill-card__meta {
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: $text-muted;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

@keyframes skill-status-on-breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow:
      0 0 0 0 color-mix(in srgb, $color-success 0%, transparent),
      0 0 6px color-mix(in srgb, $color-success 22%, transparent);
  }

  50% {
    transform: scale(1.05);
    box-shadow:
      0 0 0 4px color-mix(in srgb, $color-success 16%, transparent),
      0 0 14px color-mix(in srgb, $color-success 45%, transparent);
  }
}

.skill-card__status {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;

  &--on {
    background: color-mix(in srgb, $color-success 18%, transparent);
    color: color-mix(in srgb, $color-success 92%, #000);
    border: 1px solid color-mix(in srgb, $color-success 38%, transparent);
    animation: skill-status-on-breathe 2.6s ease-in-out infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
      box-shadow: 0 0 10px color-mix(in srgb, $color-success 32%, transparent);
    }
  }
  &--off {
    background: color-mix(in srgb, $text-muted 10%, transparent);
    color: $text-muted;
  }
  &--auth {
    background: color-mix(in srgb, $accent-gold 14%, transparent);
    color: color-mix(in srgb, $accent-gold 90%, #000);
  }
  &--planned {
    background: color-mix(in srgb, $text-muted 10%, transparent);
    color: $text-muted;
  }
}

.skill-card__toggle {
  flex-shrink: 0;
  cursor: pointer;

  input {
    display: none;
  }

  .switch {
    display: block;
    width: 38px;
    height: 22px;
    background: color-mix(in srgb, $text-muted 22%, transparent);
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;

    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(74, 58, 232, 0.18);
      transition: transform 0.2s;
    }
  }

  input:checked + .switch {
    background: $accent;
    &::after {
      transform: translateX(16px);
    }
  }

  input:disabled + .switch {
    opacity: 0.38;
    cursor: not-allowed;
  }
}

.skill-empty {
  padding: 48px 16px;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
}

.skill-mgmt--detail-open .skill-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 1200px) {
  .skill-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .skill-mgmt--detail-open .skill-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .skill-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .skill-mgmt__body {
    flex-direction: column;
    overflow-y: auto;
  }

  .skill-mgmt--detail-open .skill-mgmt__list {
    flex: none;
  }

  .skill-mgmt__list {
    overflow: visible;
  }

  .skill-mgmt__detail {
    flex: none;
    min-width: 0;
    max-width: none;
    border-top: 1px solid $border-light;
  }
}

@media (max-width: 640px) {
  .skill-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .skill-toolbar__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .skill-search {
    width: 100%;
  }

  .btn-add {
    justify-content: center;
  }

  .skill-grid {
    grid-template-columns: 1fr;
  }
}
</style>
