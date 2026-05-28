<script setup lang="ts">
import { Globe, Image, MessageSquare, Video } from 'lucide-vue-next'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'
import type { SkillId } from '../types/agent'

const agent = useAgentStore()
const settings = useSettingsStore()

const iconMap = {
  chat: MessageSquare,
  image: Image,
  video: Video,
  world: Globe,
} as const

function selectSkill(id: SkillId) {
  agent.activeSkill = id
}
</script>

<template>
  <div class="skill-bar">
    <button
      v-for="skill in settings.enabledSkills"
      :key="skill.id"
      class="skill-chip"
      :class="{ active: agent.activeSkill === skill.id }"
      :title="skill.description"
      @click="selectSkill(skill.id)"
    >
      <component :is="iconMap[skill.id]" :size="14" />
      {{ skill.name }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skill-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 0 14px;
}

.skill-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 20px;
  font-size: 12px;
  color: $text-secondary;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid $glass-border;
  transition: all 0.25s ease;

  &:hover {
    border-color: $accent;
    color: $accent;
    transform: translateY(-1px);
  }

  &.active {
    background: $accent;
    border-color: transparent;
    color: $btn-primary-text;
    font-weight: 500;
    box-shadow: $shadow-glow;
  }
}
</style>
