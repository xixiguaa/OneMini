<script setup lang="ts">
import { Check, Wand2, X } from 'lucide-vue-next'
import { computed, inject, onUnmounted, watch, type Ref, type VNodeRef } from 'vue'
import { listPluginSkills } from '../config/skillRegistry'
import { useAnchoredPopover, type PopoverPlacement } from '../composables/useAnchoredPopover'
import {
  composerSubmenuOpenKey,
  createComposerMenuCloseAllKey,
  createMenuCloseSignalKey,
  toggleExclusiveComposerMenu,
} from '../composables/useCreateComposerMenus'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useAgentStore } from '../stores/agent'

const props = withDefaults(
  defineProps<{
    popoverPlacement?: Exclude<PopoverPlacement, 'auto'>
  }>(),
  { popoverPlacement: 'below' },
)

const agent = useAgentStore()
const agentConfig = useAgentConfigStore()
const closeSignal = inject<Ref<number>>(createMenuCloseSignalKey)
const closeAll = inject(createComposerMenuCloseAllKey, () => {})
const setSubmenuOpen = inject(composerSubmenuOpenKey, () => {})

const popover = useAnchoredPopover({
  minWidth: 280,
  maxPanelHeight: 360,
  placement: props.popoverPlacement,
})
const skillsMenuOpen = popover.open

const bindTrigger: VNodeRef = (el) => {
  popover.triggerRef.value = el as HTMLElement | null
}

const bindPanel: VNodeRef = (el) => {
  popover.panelRef.value = el as HTMLElement | null
}

const filtered = computed(() =>
  listPluginSkills(agentConfig.skeleton.skills.plugins).filter((s) =>
    agent.createMode === 'video' || agent.createMode === 'digitalHuman'
      ? s.modes?.includes('video')
      : s.modes?.includes('image'),
  ),
)

const panelStyle = computed(() => popover.panelStyle.value)

const selectedSkill = computed(() =>
  filtered.value.find((s) => s.id === agent.selectedCreativeSkillId) ?? null,
)

function toggleMenu(e: MouseEvent) {
  if (!closeSignal) return
  toggleExclusiveComposerMenu(closeSignal, popover, e)
}

function dismiss() {
  popover.close()
  closeAll()
}

watch(
  () => closeSignal?.value,
  () => {
    popover.close()
  },
)

watch(
  () => popover.open.value,
  (open) => setSubmenuOpen('skills', open),
  { flush: 'sync' },
)

onUnmounted(() => setSubmenuOpen('skills', false))

function pick(id: string) {
  agent.selectedCreativeSkillId = agent.selectedCreativeSkillId === id ? null : id
}
</script>

<template>
  <div class="skills-wrap">
    <button
      :ref="bindTrigger"
      type="button"
      class="composer-pill create-composer-trigger"
      :class="{ active: skillsMenuOpen }"
      @click="toggleMenu"
    >
      <Wand2 :size="14" />
      <span>使用技能</span>
      <span v-if="selectedSkill" class="skill-dot" :title="selectedSkill.name" />
    </button>

    <Teleport to="body">
      <div
        v-if="skillsMenuOpen"
        :ref="bindPanel"
        class="composer-popover create-composer-popover skills-panel"
        :style="panelStyle"
        @click.stop
      >
        <div class="popover-head">
          <span>选择技能</span>
          <button type="button" class="popover-close" title="关闭" @click.stop="dismiss">
            <X :size="16" />
          </button>
        </div>
        <button
          v-for="s in filtered"
          :key="s.id"
          type="button"
          class="skill-item"
          :class="{ active: agent.selectedCreativeSkillId === s.id }"
          @click="pick(s.id)"
        >
          <Wand2 :size="14" />
          <div class="skill-text">
            <span class="name">{{ s.name }}</span>
            <span class="desc">{{ s.description }}</span>
          </div>
          <Check v-if="agent.selectedCreativeSkillId === s.id" :size="16" class="check" />
        </button>
        <p v-if="!filtered.length" class="skills-empty">当前模式暂无可用技能</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skills-wrap {
  position: relative;
}

.composer-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: var(--glass-border-width, 0.5px) solid var(--composer-pill-border);
  background: var(--composer-pill-bg);
  font-size: 12px;
  color: var(--composer-pill-text);
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:hover,
  &.active {
    background: var(--composer-pill-hover-bg);
    color: var(--composer-text);
    border-color: color-mix(in srgb, var(--composer-border-focus) 45%, transparent);
  }
}

.skill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $accent-cyan;
  flex-shrink: 0;
}

.skills-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 300px;
  padding: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--composer-muted);
  letter-spacing: 0.04em;
}

.popover-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: var(--composer-muted);

  &:hover {
    background: var(--composer-option-hover);
    color: var(--composer-menu-text);
  }
}

.skill-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  color: var(--composer-menu-text);

  &:hover {
    background: var(--composer-option-hover);
  }

  &.active {
    background: rgba($accent-cyan, 0.12);
  }

  > svg:first-child {
    color: $accent-cyan;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.skill-text {
  flex: 1;
  min-width: 0;
}

.name {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.desc {
  display: block;
  font-size: 11px;
  color: var(--composer-muted);
  line-height: 1.45;
  margin-top: 3px;
}

.check {
  flex-shrink: 0;
  color: $accent-cyan;
  margin-top: 2px;
}

.skills-empty {
  font-size: 12px;
  color: var(--composer-muted);
  padding: 10px 8px;
}
</style>

<style lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.create-composer-popover.skills-panel {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
