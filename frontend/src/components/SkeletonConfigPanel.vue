<script setup lang="ts">
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import { CAPABILITY_LABELS } from '../config/defaults'
import type { SkillId } from '../types/agent'

const agentConfig = useAgentConfigStore()
const settings = useSettingsStore()

const skillIds = ['chat', 'image', 'video', 'world'] as SkillId[]

const chatModelOptions = () => settings.settings.models.filter((m) => m.capability === 'chat')
</script>

<template>
  <div class="skeleton-panel card">
    <h3 class="section-title">骨架 onemini.json</h3>
    <p class="section-desc">运行时参数：主模型、回退、温度、会话与安全边界</p>

    <label class="field-label">主模型 (primary)</label>
    <select
      class="select"
      :value="agentConfig.skeleton.models.primary"
      @change="
        agentConfig.updateSkeleton({
          models: {
            ...agentConfig.skeleton.models,
            primary: ($event.target as HTMLSelectElement).value,
          },
        })
      "
    >
      <option value="">— 未指定 —</option>
      <option v-for="m in chatModelOptions()" :key="m.id" :value="m.id">{{ m.name }}</option>
    </select>

    <label class="field-label">温度 temperature（对话/协作建议 0～0.3）</label>
    <div class="range-row">
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="agentConfig.skeleton.models.temperature"
        @input="
          agentConfig.updateSkeleton({
            models: {
              ...agentConfig.skeleton.models,
              temperature: Number(($event.target as HTMLInputElement).value),
            },
          })
        "
      />
      <span class="range-val">{{ agentConfig.skeleton.models.temperature }}</span>
    </div>

    <label class="field-label">会话历史上限 maxHistoryMessages</label>
    <input
      type="number"
      class="select"
      min="4"
      max="50"
      :value="agentConfig.skeleton.session.maxHistoryMessages"
      @change="
        agentConfig.updateSkeleton({
          session: {
            ...agentConfig.skeleton.session,
            maxHistoryMessages: Number(($event.target as HTMLInputElement).value),
          },
        })
      "
    />

    <label class="field-label">沙箱 allowedSkills</label>
    <div class="checks">
      <label v-for="id in skillIds" :key="id" class="check">
        <input
          type="checkbox"
          :checked="agentConfig.skeleton.sandbox.allowedSkills.includes(id)"
          @change="
            (() => {
              const list = [...agentConfig.skeleton.sandbox.allowedSkills]
              const on = ($event.target as HTMLInputElement).checked
              const i = list.indexOf(id)
              if (on && i < 0) list.push(id)
              if (!on && i >= 0) list.splice(i, 1)
              agentConfig.updateSkeleton({ sandbox: { ...agentConfig.skeleton.sandbox, allowedSkills: list } })
            })()
          "
        />
        {{ CAPABILITY_LABELS[id] || id }}
      </label>
    </div>

    <label class="field-label">沙箱模式</label>
    <select
      class="select"
      :value="agentConfig.skeleton.sandbox.mode"
      @change="
        agentConfig.updateSkeleton({
          sandbox: {
            ...agentConfig.skeleton.sandbox,
            mode: ($event.target as HTMLSelectElement).value as 'off' | 'warn' | 'strict',
          },
        })
      "
    >
      <option value="off">关闭</option>
      <option value="warn">警告（提示越权）</option>
      <option value="strict">严格（拒绝未允许技能）</option>
    </select>

    <button class="reset-btn" @click="agentConfig.resetSkeleton()">恢复骨架默认</button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.skeleton-panel {
  padding: 18px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}

.section-desc {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: $text-secondary;
  margin: 14px 0 6px;
}

.select {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: $radius-sm;
  color: $text-primary;
  font-size: 13px;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 12px;

  input[type='range'] {
    flex: 1;
  }
}

.range-val {
  font-size: 13px;
  font-weight: 600;
  color: $accent;
  min-width: 36px;
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.check {
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.reset-btn {
  margin-top: 16px;
  font-size: 12px;
  color: $text-muted;

  &:hover {
    color: #c44;
  }
}
</style>
