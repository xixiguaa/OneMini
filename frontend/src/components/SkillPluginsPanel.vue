<script setup lang="ts">
import { listPluginSkills } from '../config/skillRegistry'
import { useAgentConfigStore } from '../stores/agentConfig'

const agentConfig = useAgentConfigStore()
const plugins = listPluginSkills()
</script>

<template>
  <div class="plugins-panel">
    <p class="intro">可插拔创作技能（对标 OpenClaw Skills）。启用后可在创作页选择对应模板。</p>
    <div
      v-for="p in plugins"
      :key="p.id"
      class="plugin-card card"
    >
      <label class="toggle">
        <input
          type="checkbox"
          :checked="agentConfig.isPluginEnabled(p.id)"
          @change="agentConfig.togglePlugin(p.id, ($event.target as HTMLInputElement).checked)"
        />
        <span class="slider" />
      </label>
      <div class="body">
        <span class="name">{{ p.name }}</span>
        <span class="id">{{ p.id }} · {{ p.modes?.join('/') }}</span>
        <p class="desc">{{ p.description }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.plugins-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  font-size: 13px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.plugin-card {
  display: flex;
  gap: 12px;
  padding: 14px;
}

.name {
  font-weight: 600;
  font-size: 14px;
}

.id {
  font-size: 11px;
  color: $text-muted;
  margin-left: 8px;
}

.desc {
  font-size: 12px;
  color: $text-secondary;
  margin-top: 6px;
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
