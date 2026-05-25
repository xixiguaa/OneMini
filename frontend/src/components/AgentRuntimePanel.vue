<script setup lang="ts">
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import { CAPABILITY_LABELS } from '../config/defaults'
import type { SkillId } from '../types/agent'

const agentConfig = useAgentConfigStore()
const settings = useSettingsStore()
const skillIds = ['chat', 'image', 'video', 'world'] as SkillId[]
const chatModels = () => settings.settings.models.filter((m) => m.capability === 'chat')

function patchModels(patch: Partial<typeof agentConfig.skeleton.models>) {
  agentConfig.updateSkeleton({
    models: { ...agentConfig.skeleton.models, ...patch },
  })
}
</script>

<template>
  <div class="detail runtime-detail">
    <section class="block">
      <h4 class="block-title">模型 models</h4>
      <label class="field">
        <span>primary 主模型</span>
        <select
          class="input"
          :value="agentConfig.skeleton.models.primary"
          @change="patchModels({ primary: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">— 未指定 —</option>
          <option v-for="m in chatModels()" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label class="field">
        <span>temperature（建议 0～0.3）</span>
        <div class="range-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="agentConfig.skeleton.models.temperature"
            @input="patchModels({ temperature: Number(($event.target as HTMLInputElement).value) })"
          />
          <em>{{ agentConfig.skeleton.models.temperature }}</em>
        </div>
      </label>
      <label class="field">
        <span>maxTokens</span>
        <input
          type="number"
          class="input"
          min="512"
          max="128000"
          step="512"
          :value="agentConfig.skeleton.models.maxTokens ?? 4096"
          @change="patchModels({ maxTokens: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
    </section>

    <section class="block">
      <h4 class="block-title">会话 session</h4>
      <label class="field">
        <span>maxHistoryMessages</span>
        <input
          type="number"
          class="input"
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
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="agentConfig.skeleton.session.dailyReset"
          @change="
            agentConfig.updateSkeleton({
              session: {
                ...agentConfig.skeleton.session,
                dailyReset: ($event.target as HTMLInputElement).checked,
              },
            })
          "
        />
        dailyReset 每日重置会话
      </label>
    </section>

    <section class="block">
      <h4 class="block-title">引导 bootstrap</h4>
      <label class="field">
        <span>bootstrapMaxChars</span>
        <input
          type="number"
          class="input"
          min="4000"
          max="50000"
          step="1000"
          :value="agentConfig.bootstrapMaxChars"
          @change="
            agentConfig.updateSkeleton({
              bootstrapMaxChars: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </label>
    </section>

    <section class="block">
      <h4 class="block-title">沙箱 sandbox</h4>
      <label class="field">
        <span>mode</span>
        <select
          class="input"
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
          <option value="off">off</option>
          <option value="warn">warn</option>
          <option value="strict">strict</option>
        </select>
      </label>
      <p class="field-label">allowedSkills</p>
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
    </section>

    <button type="button" class="text-btn" @click="agentConfig.resetSkeleton()">
      恢复 onemini.json 默认
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.runtime-detail {
  padding: 16px 20px 24px;
  flex: 1;
  overflow-y: auto;
}

.block {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid $border-light;

  &:last-of-type {
    border-bottom: none;
  }
}

.block-title {
  font-size: 12px;
  font-weight: 600;
  color: $accent;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.field {
  display: block;
  margin-bottom: 14px;

  > span {
    display: block;
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 8px;
  }
}

.input {
  width: 100%;
  padding: 10px 12px;
  background: $bg-input;
  border: 1px solid $border-light;
  border-radius: 8px;
  font-size: 13px;
  color: $text-primary;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 3px $accent-light;
  }
}

.range-row {
  display: flex;
  align-items: center;
  gap: 12px;

  input[type='range'] {
    flex: 1;
  }

  em {
    font-style: normal;
    font-weight: 600;
    color: $accent;
    min-width: 32px;
  }
}

.field-label {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.text-btn {
  font-size: 12px;
  color: $text-muted;
  margin-top: 8px;

  &:hover {
    color: #c44;
  }
}
</style>
