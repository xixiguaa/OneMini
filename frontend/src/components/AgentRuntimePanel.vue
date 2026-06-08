<script setup lang="ts">
import GlassSelect, { type GlassSelectOption } from './GlassSelect.vue'
import ModelLogo from './ModelLogo.vue'
import { listCoreSkills } from '../config/skillRegistry'
import { useAgentConfigStore } from '../stores/agentConfig'
import { useSettingsStore } from '../stores/settings'
import { CAPABILITY_LABELS } from '../config/defaults'
import type { SkillId } from '../types/agent'

// 多模态能力（chat/image/video/world）为产品路由，非工具类技能；模型绑定在此配置
const agentConfig = useAgentConfigStore()
const settings = useSettingsStore()
const skillIds = ['chat', 'image', 'video', 'world'] as SkillId[]
const coreModules = listCoreSkills()
const chatModels = () => settings.modelsForChat()

function patchModels(patch: Partial<typeof agentConfig.skeleton.models>) {
  agentConfig.updateSkeleton({
    models: { ...agentConfig.skeleton.models, ...patch },
  })
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

const primaryModelOptions = (): GlassSelectOption[] => [
  { value: '', label: '— 未指定 —' },
  ...chatModels().map((m) => ({ value: m.id, label: m.name })),
]

function capModelOptions(skillId: SkillId): GlassSelectOption[] {
  return [
    { value: '', label: '— 自动 —' },
    ...modelOptions(skillId).map((m) => ({ value: m.id, label: m.name })),
  ]
}

const sandboxModeOptions: GlassSelectOption[] = [
  { value: 'off', label: 'off' },
  { value: 'warn', label: 'warn' },
  { value: 'strict', label: 'strict' },
]
</script>

<template>
  <div class="detail runtime-detail">
    <section class="block">
      <h4 class="block-title">模型 models</h4>
      <label class="field">
        <span>primary</span>
        <GlassSelect
          :model-value="agentConfig.skeleton.models.primary"
          :options="primaryModelOptions()"
          aria-label="主模型"
          @update:model-value="patchModels({ primary: $event })"
        />
      </label>
      <label class="field">
        <span>temperature</span>
        <div class="range-row">
          <input
            type="range"
            class="glass-range"
            min="0"
            max="1"
            step="0.01"
            :value="agentConfig.skeleton.models.temperature"
            :style="{
              '--range-fill': `${(agentConfig.skeleton.models.temperature / 1) * 100}%`,
            }"
            @input="patchModels({ temperature: Number(($event.target as HTMLInputElement).value) })"
          />
          <em>{{ agentConfig.skeleton.models.temperature.toFixed(2) }}</em>
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
        dailyReset
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
      <h4 class="block-title">多模态能力</h4>
      <div v-for="mod in coreModules" :key="mod.id" class="cap-row">
        <template v-if="coreSkillConfig(mod.id as SkillId)">
          <label class="check cap-check">
            <input
              type="checkbox"
              :checked="coreSkillConfig(mod.id as SkillId)!.enabled"
              @change="
                settings.updateSkill(mod.id as SkillId, {
                  enabled: ($event.target as HTMLInputElement).checked,
                })
              "
            />
            <span class="cap-name">{{ mod.name }}</span>
          </label>
          <GlassSelect
            class="cap-select"
            :model-value="coreSkillConfig(mod.id as SkillId)!.defaultModelId"
            :options="capModelOptions(mod.id as SkillId)"
            :aria-label="`${mod.name} 默认模型`"
            @update:model-value="
              settings.updateSkill(mod.id as SkillId, { defaultModelId: $event })
            "
          >
            <template #trigger-prefix>
              <ModelLogo
                v-if="
                  coreSkillConfig(mod.id as SkillId)!.defaultModelId &&
                  settings.getModel(coreSkillConfig(mod.id as SkillId)!.defaultModelId)
                "
                :model="settings.getModel(coreSkillConfig(mod.id as SkillId)!.defaultModelId)!"
                :size="18"
              />
            </template>
            <template #option="{ option }">
              <ModelLogo
                v-if="option.value && settings.getModel(option.value)"
                :model="settings.getModel(option.value)!"
                :size="18"
              />
              <span class="glass-select__option-label">{{ option.label }}</span>
            </template>
          </GlassSelect>
        </template>
      </div>
    </section>

    <section class="block">
      <h4 class="block-title">沙箱 sandbox</h4>
      <label class="field">
        <span>mode</span>
        <GlassSelect
          :model-value="agentConfig.skeleton.sandbox.mode"
          :options="sandboxModeOptions"
          aria-label="沙箱模式"
          @update:model-value="
            agentConfig.updateSkeleton({
              sandbox: {
                ...agentConfig.skeleton.sandbox,
                mode: $event as 'off' | 'warn' | 'strict',
              },
            })
          "
        />
      </label>
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
    box-shadow: $shadow-focus;
  }
}

.range-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .glass-range {
    flex: 1;
  }

  em {
    font-style: normal;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: $accent-emphasis;
    min-width: 32px;
    text-align: right;
  }
}

.cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.cap-check {
  min-width: 108px;
  flex-shrink: 0;
}

.cap-name {
  font-weight: 500;
}

.cap-select {
  flex: 1;
  min-width: 160px;
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

  input[type='checkbox'] {
    accent-color: $accent;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
}

.text-btn {
  font-size: 12px;
  color: $text-muted;
  margin-top: 8px;

  &:hover {
    color: $color-danger;
  }
}
</style>
