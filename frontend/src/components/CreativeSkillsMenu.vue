<script setup lang="ts">
import { Wand2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { listPluginSkills } from '../config/skillRegistry'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useAgentStore } from '../stores/agent'

const agent = useAgentStore()
const agentConfig = useAgentConfigStore()

const filtered = computed(() =>
  listPluginSkills(agentConfig.skeleton.skills.plugins).filter((s) =>
    agent.createMode === 'video'
      ? s.modes?.includes('video')
      : s.modes?.includes('image'),
  ),
)

function pick(id: string) {
  agent.selectedCreativeSkillId = agent.selectedCreativeSkillId === id ? null : id
  agent.showSkillsMenu = false
}
</script>

<template>
  <div class="skills-wrap">
    <button class="tool-btn" @click.stop="agent.showSkillsMenu = !agent.showSkillsMenu">
      <Wand2 :size="16" />
      <span>使用技能</span>
    </button>

    <div v-if="agent.showSkillsMenu" class="skills-panel card">
      <p class="panel-title">选择技能</p>
      <button
        v-for="s in filtered"
        :key="s.id"
        class="skill-item"
        :class="{ active: agent.selectedCreativeSkillId === s.id }"
        @click="pick(s.id)"
      >
        <Wand2 :size="14" />
        <div>
          <span class="name">{{ s.name }}</span>
          <span class="desc">{{ s.description }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skills-wrap {
  position: relative;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 20px;
  background: var(--composer-pill-bg);
  border: 1px solid var(--composer-pill-border);
  font-size: 12px;
  color: var(--composer-pill-text);

  &:hover {
    border-color: $accent;
    background: var(--composer-pill-hover-bg);
    color: $accent;
  }
}

.skills-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 280px;
  padding: 12px;
  z-index: 50;
  max-height: 320px;
  overflow-y: auto;
}

.panel-title {
  font-size: 12px;
  color: $text-muted;
  margin-bottom: 10px;
}

.skill-item {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  color: $text-primary;

  &:hover {
    background: $accent-light;
  }

  &.active {
    background: $accent-light;
    border: 1px solid rgba(45, 138, 78, 0.3);
  }

  svg {
    color: $accent;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.name {
  display: block;
  font-size: 13px;
  font-weight: 600;
}

.desc {
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.4;
}
</style>
