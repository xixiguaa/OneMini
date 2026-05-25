<script setup lang="ts">
import { useAgentConfigStore } from '../stores/agentConfig'

const agentConfig = useAgentConfigStore()
const ma = () => agentConfig.skeleton.multiAgent
</script>

<template>
  <div class="multi-panel card">
    <div class="header-row">
      <div>
        <h3 class="section-title">多智能体协作</h3>
        <p class="section-desc">总指挥拆解任务 → 专业 Agent 并行/串行执行 → 汇总交付</p>
      </div>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="ma().enabled"
          @change="
            agentConfig.updateSkeleton({
              multiAgent: { ...ma(), enabled: ($event.target as HTMLInputElement).checked },
            })
          "
        />
        <span class="slider" />
      </label>
    </div>

    <template v-if="ma().enabled">
      <label class="field-label">触发关键词（命中任一即启用协作）</label>
      <input
        class="select"
        :value="ma().triggerKeywords.join('，')"
        placeholder="周报，分析报告，分镜"
        @change="
          agentConfig.updateSkeleton({
            multiAgent: {
              ...ma(),
              triggerKeywords: ($event.target as HTMLInputElement).value
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            },
          })
        "
      />

      <label class="field-label">最短提示长度（字符）</label>
      <input
        type="number"
        class="select"
        min="0"
        :value="ma().minPromptLength"
        @change="
          agentConfig.updateSkeleton({
            multiAgent: {
              ...ma(),
              minPromptLength: Number(($event.target as HTMLInputElement).value),
            },
          })
        "
      />

      <p class="field-label">专业 Agent 编制</p>
      <div v-for="agent in ma().agents" :key="agent.id" class="agent-row">
        <strong>{{ agent.name }}</strong>
        <span class="role">{{ agent.role }}</span>
        <span class="meta">id: {{ agent.id }} · skills: {{ agent.skillIds.join(', ') }}</span>
      </div>

      <div class="flow-hint">
        <p>流程：用户提问 → <b>{{ ma().orchestrator.name }}</b> 生成 JSON 计划 → 各 Agent 执行 → 总指挥汇总</p>
      </div>
    </template>

    <p v-else class="off-hint">开启后，复杂对话将自动走「虾队」协作（可在宪法中补充协作规范）。</p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.multi-panel {
  padding: 18px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.section-desc {
  font-size: 12px;
  color: $text-secondary;
  margin-top: 4px;
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
  font-size: 13px;
}

.agent-row {
  padding: 10px 12px;
  margin-bottom: 8px;
  background: $bg-input;
  border-radius: $radius-sm;
  font-size: 13px;

  .role {
    display: block;
    color: $text-secondary;
    margin-top: 4px;
  }

  .meta {
    font-size: 11px;
    color: $text-muted;
  }
}

.flow-hint {
  margin-top: 12px;
  padding: 10px;
  font-size: 12px;
  color: $text-secondary;
  background: $accent-light;
  border-radius: $radius-sm;
}

.off-hint {
  font-size: 13px;
  color: $text-muted;
}

.toggle {
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
