<script setup lang="ts">
import { Settings2 } from 'lucide-vue-next'
import { ASPECT_RATIOS } from '../config/constants'
import { useAgentStore } from '../stores/agent'
import { useSettingsStore } from '../stores/settings'

const agent = useAgentStore()
const settings = useSettingsStore()
</script>

<template>
  <div class="prefs-wrap">
    <button class="tool-btn" @click.stop="agent.showPrefsMenu = !agent.showPrefsMenu">
      <Settings2 :size="16" />
      <span>生成偏好</span>
    </button>

    <div v-if="agent.showPrefsMenu" class="prefs-panel card" @click.stop>
      <div class="prefs-head">
        <span>生成偏好</span>
        <label class="auto-toggle">
          自动
          <input
            type="checkbox"
            :checked="settings.settings.generationPrefs.autoMode"
            @change="settings.updateGenerationPrefs({ autoMode: ($event.target as HTMLInputElement).checked })"
          />
          <span class="slider" />
        </label>
      </div>

      <div class="tabs">
        <button
          class="tab"
          :class="{ active: agent.createMode !== 'video' }"
          @click="agent.createMode = 'image'"
        >
          图片
        </button>
        <button
          class="tab"
          :class="{ active: agent.createMode === 'video' }"
          @click="agent.createMode = 'video'"
        >
          视频
        </button>
      </div>

      <p class="label">选择比例</p>
      <div class="ratio-grid">
        <button
          v-for="r in ASPECT_RATIOS"
          :key="r.id"
          class="ratio-btn"
          :class="{ active: settings.settings.generationPrefs.aspectRatio === r.id }"
          @click="settings.updateGenerationPrefs({ aspectRatio: r.id })"
        >
          {{ r.label }}
        </button>
      </div>

      <p class="label">绑定模型</p>
      <p class="hint">在「模型配置」中添加图片/视频模型并填写密钥</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.prefs-wrap {
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

.prefs-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  width: 320px;
  padding: 16px;
  z-index: 50;
  animation: pop 0.2s ease;
}

@keyframes pop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.prefs-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

.auto-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: normal;
  color: $text-secondary;
  cursor: pointer;

  input { display: none; }
  .slider {
    width: 36px;
    height: 20px;
    background: $accent-light;
    border-radius: 10px;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }
  input:checked + .slider {
    background: $accent;
    &::after { transform: translateX(16px); }
  }
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: $bg-input;
  border-radius: 10px;
  margin-bottom: 14px;
}

.tab {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  color: $text-secondary;

  &.active {
    background: $bg-card;
    color: $text-primary;
    font-weight: 500;
    box-shadow: $shadow-sm;
  }
}

.label {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.ratio-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.ratio-btn {
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 8px;
  border: 1px solid $border-light;
  color: $text-secondary;

  &.active {
    background: $accent-light;
    border-color: $accent;
    color: $accent;
  }
}

.hint {
  font-size: 11px;
  color: $text-muted;
}
</style>
