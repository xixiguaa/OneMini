<script setup lang="ts">
import { Settings, Trash2, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { AgentSkillCatalogItem } from '../config/agentSkillCatalog'
import { useAgentConfigStore } from '../stores/agentConfig'

const props = defineProps<{
  skill: AgentSkillCatalogItem
  mcpQualifiedName?: string
}>()

const emit = defineEmits<{
  close: []
  save: []
  remove: []
}>()

const agentConfig = useAgentConfigStore()

const detailTab = ref<'overview' | 'settings'>('overview')
const invokeDescription = ref('')
const maxResults = ref(5)
const domainBlacklist = ref('')
const permissions = ref<Record<string, boolean>>({})

const hasSettings = computed(
  () =>
    props.skill.kind === 'web' &&
    (props.skill.permissionOptions?.length ||
      props.skill.id === 'web-search'),
)

function loadDraft() {
  detailTab.value = 'overview'
  invokeDescription.value = agentConfig.getSkillInvokeDescription(
    props.skill.id,
    props.skill.defaultInvokeDescription,
  )
  if (props.skill.kind === 'web') {
    const p = agentConfig.getSkillParams(props.skill.id, {
      maxResults: 5,
      domainBlacklist: '',
    })
    maxResults.value = Number(p.maxResults) || 5
    domainBlacklist.value = String(p.domainBlacklist ?? '')
  }
  const perms: Record<string, boolean> = {}
  for (const opt of props.skill.permissionOptions ?? []) {
    perms[opt.id] = agentConfig.getSkillPermission(props.skill.id, opt.id, opt.defaultOn)
  }
  permissions.value = perms
}

watch(
  () => props.skill.id,
  () => loadDraft(),
  { immediate: true },
)

function save() {
  agentConfig.setSkillInvokeDescription(props.skill.id, invokeDescription.value.trim())
  if (props.skill.kind === 'web') {
    agentConfig.setSkillParams(props.skill.id, {
      maxResults: maxResults.value,
      domainBlacklist: domainBlacklist.value.trim(),
    })
    for (const [permId, on] of Object.entries(permissions.value)) {
      agentConfig.setSkillPermission(props.skill.id, permId, on)
    }
  }
  emit('save')
}

function togglePerm(id: string) {
  permissions.value = { ...permissions.value, [id]: !permissions.value[id] }
}
</script>

<template>
  <div class="skill-detail">
    <header class="skill-detail__head">
      <div class="skill-detail__title-row">
        <span class="skill-detail__icon" :class="`skill-detail__icon--${skill.iconTone}`">
          <component :is="skill.icon" :size="18" />
        </span>
        <div class="skill-detail__titles">
          <h3 class="skill-detail__title">{{ skill.name }}</h3>
          <p class="skill-detail__id">{{ skill.id }}</p>
        </div>
      </div>
      <button type="button" class="skill-detail__close" title="关闭" @click="emit('close')">
        <X :size="18" />
      </button>
    </header>

    <nav v-if="hasSettings" class="skill-detail__tabs" aria-label="技能详情分类">
      <button
        type="button"
        class="skill-detail__tab"
        :class="{ active: detailTab === 'overview' }"
        @click="detailTab = 'overview'"
      >
        详情
      </button>
      <button
        type="button"
        class="skill-detail__tab"
        :class="{ active: detailTab === 'settings' }"
        @click="detailTab = 'settings'"
      >
        <Settings :size="13" />
        设置
      </button>
    </nav>

    <div class="skill-detail__body">
      <template v-if="detailTab === 'overview' || !hasSettings">
        <p class="skill-detail__desc">{{ skill.description }}</p>

        <label class="field">
          <span>调用条件描述</span>
          <textarea v-model="invokeDescription" class="input textarea" rows="5" />
          <span class="field-hint">Agent 根据此描述决定何时调用该技能</span>
        </label>
      </template>

      <template v-else>
        <label class="field">
          <span>最大结果数</span>
          <input v-model.number="maxResults" type="number" class="input" min="1" max="20" />
        </label>
        <label class="field">
          <span>域名黑名单</span>
          <input v-model="domainBlacklist" class="input" placeholder="多个域名用逗号分隔" />
        </label>

        <div v-if="skill.permissionOptions?.length" class="field">
          <span>允许的操作权限</span>
          <div class="perm-chips">
            <button
              v-for="opt in skill.permissionOptions"
              :key="opt.id"
              type="button"
              class="perm-chip"
              :class="{ active: permissions[opt.id] }"
              @click="togglePerm(opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </template>
    </div>

    <footer class="skill-detail__foot">
      <div class="skill-detail__actions">
        <button type="button" class="btn btn--primary" @click="save">保存</button>
        <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
      </div>
      <button
        v-if="skill.kind === 'mcp'"
        type="button"
        class="btn btn--danger"
        @click="emit('remove')"
      >
        <Trash2 :size="14" />
        从列表隐藏
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skill-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
  background: color-mix(in srgb, var(--bg-card) 98%, transparent);
  border-left: 1px solid $border-light;
  animation: detail-in 0.2s ease-out;
}

@keyframes detail-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.skill-detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  flex-shrink: 0;
}

.skill-detail__title-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  min-width: 0;
}

.skill-detail__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;

  &--blue {
    background: color-mix(in srgb, #3b82f6 14%, transparent);
    color: #3b82f6;
  }
  &--green {
    background: color-mix(in srgb, #22c55e 14%, transparent);
    color: #22c55e;
  }
  &--purple {
    background: color-mix(in srgb, $accent 14%, transparent);
    color: $accent;
  }
  &--pink {
    background: color-mix(in srgb, #ec4899 14%, transparent);
    color: #ec4899;
  }
  &--orange {
    background: color-mix(in srgb, #f97316 14%, transparent);
    color: #f97316;
  }
  &--cyan {
    background: color-mix(in srgb, $accent-cyan 14%, transparent);
    color: $accent-cyan;
  }
  &--slate {
    background: color-mix(in srgb, $text-muted 14%, transparent);
    color: $text-secondary;
  }
}

.skill-detail__titles {
  min-width: 0;
}

.skill-detail__title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  line-height: 1.35;
}

.skill-detail__id {
  margin-top: 2px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: $text-muted;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-detail__close {
  padding: 6px;
  border-radius: 8px;
  color: $text-muted;
  flex-shrink: 0;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }
}

.skill-detail__tabs {
  display: flex;
  gap: 4px;
  padding: 0 16px 12px;
  flex-shrink: 0;
}

.skill-detail__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $text-muted;

  &:hover {
    color: $text-primary;
    background: color-mix(in srgb, $accent 6%, transparent);
  }

  &.active {
    color: $accent-emphasis;
    background: $accent-light;
    font-weight: 600;
  }
}

.skill-detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skill-detail__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: $text-secondary;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  > span:first-child {
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;
  }
}

.field-hint {
  font-size: 11px;
  color: $text-muted;
  line-height: 1.45;
}

.input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid $border-light;
  background: $bg-input;
  font-size: 13px;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $accent;
    box-shadow: $shadow-focus;
  }

  &.textarea {
    resize: vertical;
    line-height: 1.5;
    min-height: 100px;
  }
}

.perm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perm-chip {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid $border-light;
  color: $text-muted;
  background: $bg-input;

  &.active {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 35%, transparent);
    color: $accent-emphasis;
    font-weight: 500;
  }
}

.skill-detail__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid $border-light;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-card) 99%, transparent);
}

.skill-detail__actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;

  &--primary {
    background: var(--btn-primary-gradient, $accent);
    color: #fff;
  }

  &--ghost {
    color: $text-secondary;

    &:hover {
      background: $accent-light;
    }
  }

  &--danger {
    margin-left: auto;
    color: $color-danger;
    font-size: 12px;

    &:hover {
      background: $color-danger-soft;
    }
  }
}
</style>
