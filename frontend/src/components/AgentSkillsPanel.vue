<script setup lang="ts">
import { Wand2 } from 'lucide-vue-next'
import ModelLogo from './ModelLogo.vue'
import { listCoreSkills, listPluginSkills } from '../config/skillRegistry'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import type { SkillId } from '../types/agent'

const settings = useSettingsStore()
const agentConfig = useAgentConfigStore()
const coreModules = listCoreSkills()
const plugins = listPluginSkills()

function boundModel(skillId: SkillId) {
  const skill = settings.getSkill(skillId)
  return skill?.defaultModelId ? settings.getModel(skill.defaultModelId) : null
}

function modelOptions(skillId: SkillId) {
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

function coreSkillConfig(id: SkillId) {
  return settings.getSkill(id)
}
</script>

<template>
  <div class="detail skills-detail">
    <section class="block">
      <h4 class="block-title">内置能力</h4>
      <div v-for="mod in coreModules" :key="mod.id" class="skill-row">
        <template v-if="coreSkillConfig(mod.id as SkillId)">
          <div class="skill-head">
            <label class="toggle">
              <input
                type="checkbox"
                :checked="coreSkillConfig(mod.id as SkillId)!.enabled"
                @change="
                  settings.updateSkill(mod.id as SkillId, {
                    enabled: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span class="slider" />
            </label>
            <div>
              <span class="name">{{ mod.name }}</span>
              <span class="meta">core · {{ mod.id }}</span>
            </div>
          </div>
          <p class="desc">{{ mod.description }}</p>
          <label class="field">
            <span>绑定模型</span>
            <div v-if="boundModel(mod.id as SkillId)" class="bound">
              <ModelLogo :model="boundModel(mod.id as SkillId)!" :size="22" />
              <span>{{ boundModel(mod.id as SkillId)!.name }}</span>
            </div>
            <select
              class="input"
              :value="coreSkillConfig(mod.id as SkillId)!.defaultModelId"
              @change="
                settings.updateSkill(mod.id as SkillId, {
                  defaultModelId: ($event.target as HTMLSelectElement).value,
                })
              "
            >
              <option value="">— 自动 / primary —</option>
              <option v-for="m in modelOptions(mod.id as SkillId)" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>技能补充 Prompt</span>
            <textarea
              class="input prompt"
              :value="coreSkillConfig(mod.id as SkillId)!.systemPrompt"
              rows="2"
              @input="
                settings.updateSkill(mod.id as SkillId, {
                  systemPrompt: ($event.target as HTMLTextAreaElement).value,
                })
              "
            />
          </label>
        </template>
      </div>
      <button type="button" class="text-btn" @click="settings.resetSkillsToDefaults()">
        恢复内置技能默认
      </button>
    </section>

    <section class="block">
      <h4 class="block-title">创作插件</h4>
      <div v-for="p in plugins" :key="p.id" class="plugin-row">
        <label class="toggle">
          <input
            type="checkbox"
            :checked="agentConfig.isPluginEnabled(p.id)"
            @change="agentConfig.togglePlugin(p.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="slider" />
        </label>
        <div>
          <span class="name"><Wand2 :size="14" /> {{ p.name }}</span>
          <span class="meta">{{ p.id }} · {{ p.modes?.join('/') }}</span>
          <p class="desc">{{ p.description }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skills-detail {
  padding: 16px 20px 24px;
  flex: 1;
  overflow-y: auto;
}

.block {
  margin-bottom: 24px;
}

.block-title {
  font-size: 12px;
  font-weight: 600;
  color: $accent;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.skill-row {
  padding: 14px 0;
  border-bottom: 1px solid $border-light;

  &:last-child {
    border-bottom: none;
  }
}

.skill-head,
.plugin-row {
  display: flex;
  gap: 12px;
}

.plugin-row {
  padding: 12px 0;
  border-bottom: 1px solid $border-light;
}

.name {
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.meta {
  display: block;
  font-size: 11px;
  color: $text-muted;
  font-family: ui-monospace, monospace;
  margin-top: 2px;
}

.desc {
  font-size: 13px;
  color: $text-secondary;
  margin: 8px 0 10px;
  padding-left: 50px;
}

.plugin-row .desc {
  padding-left: 0;
  margin-top: 4px;
}

.bound {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}

.field {
  display: block;
  margin-bottom: 12px;
  padding-left: 50px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 6px;
  }
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;

  &.prompt {
    resize: vertical;
    line-height: 1.5;
  }

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px $accent-light;
  }
}

.text-btn {
  font-size: 12px;
  color: $text-muted;
  margin-top: 8px;

  &:hover {
    color: #c44;
  }
}

.toggle {
  flex-shrink: 0;
  input {
    display: none;
  }
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
    }
  }
  input:checked + .slider {
    background: $accent;
    &::after {
      transform: translateX(16px);
    }
  }
}
</style>
