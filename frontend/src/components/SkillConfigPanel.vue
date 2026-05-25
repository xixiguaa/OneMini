<script setup lang="ts">
import ModelLogo from './ModelLogo.vue'
import { useSettingsStore } from '../stores/settings'
import type { SkillId } from '../types/agent'

const settings = useSettingsStore()

const boundModel = (skillId: SkillId) => {
  const skill = settings.getSkill(skillId)
  return skill?.defaultModelId ? settings.getModel(skill.defaultModelId) : null
}

const modelOptions = (skillId: SkillId) => {
  switch (skillId) {
    case 'chat':
      return settings.chatModels
    case 'image':
      return settings.imageModels
    case 'video':
      return settings.videoModels
    case 'world':
      return settings.worldModels
    default:
      return []
  }
}
</script>

<template>
  <div class="skill-config">
    <div
      v-for="skill in settings.settings.skills"
      :key="skill.id"
      class="skill-card card"
    >
      <div class="skill-header">
        <label class="toggle">
          <input
            type="checkbox"
            :checked="skill.enabled"
            @change="settings.updateSkill(skill.id, { enabled: ($event.target as HTMLInputElement).checked })"
          />
          <span class="slider" />
        </label>
        <div>
          <span class="name">{{ skill.name }}</span>
          <span class="id">{{ skill.id }}</span>
        </div>
      </div>

      <p class="desc">{{ skill.description }}</p>

      <label class="field-label">绑定模型</label>
      <div v-if="boundModel(skill.id)" class="bound-model">
        <ModelLogo :model="boundModel(skill.id)!" :size="28" />
        <span>{{ boundModel(skill.id)!.name }}</span>
      </div>
      <select
        class="select"
        :value="skill.defaultModelId"
        @change="settings.updateSkill(skill.id, { defaultModelId: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">— 请选择 —</option>
        <option
          v-for="m in modelOptions(skill.id)"
          :key="m.id"
          :value="m.id"
        >
          {{ m.name }}
        </option>
      </select>
      <p v-if="!modelOptions(skill.id).length" class="warn">
        请先在「模型配置」填写密钥并启用对应类型模型
      </p>

      <label class="field-label">系统提示词</label>
      <textarea
        class="prompt"
        :value="skill.systemPrompt"
        rows="3"
        @input="settings.updateSkill(skill.id, { systemPrompt: ($event.target as HTMLTextAreaElement).value })"
      />
    </div>

    <button class="reset-btn" @click="settings.resetSkillsToDefaults()">
      恢复技能默认
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skill-config {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.skill-card {
  padding: 18px;
}

.skill-header {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.name {
  font-weight: 600;
  font-size: 15px;
  display: block;
}

.id {
  font-size: 11px;
  color: $text-muted;
}

.desc {
  font-size: 13px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 12px;
}

.bound-model {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 8px 10px;
  background: $bg-input;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.field-label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin: 12px 0 6px;
}

.select,
.prompt {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  color: $text-primary;
  font-size: 13px;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px $accent-light;
  }
}

.prompt {
  resize: vertical;
  line-height: 1.5;
}

.warn {
  font-size: 11px;
  color: $accent-gold;
  margin-top: 6px;
}

.reset-btn {
  align-self: flex-start;
  font-size: 12px;
  color: $text-muted;
  padding: 8px 0;

  &:hover {
    color: #c44;
  }
}

.toggle {
  input { display: none; }
  .slider {
    display: block;
    width: 38px;
    height: 22px;
    background: #c5d9c8;
    border-radius: 11px;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
      box-shadow: $shadow-sm;
    }
  }
  input:checked + .slider {
    background: $accent;
    &::after { transform: translateX(16px); }
  }
}
</style>
