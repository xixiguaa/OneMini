<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import { useAgentConfigStore } from '../stores/agentConfig'

const agentConfig = useAgentConfigStore()
const ma = () => agentConfig.skeleton.multiAgent
</script>

<template>
  <div class="detail crew-detail">
    <div class="crew-toggle">
      <div>
        <strong>启用协作团队</strong>
        <p>复杂任务由总指挥拆解后分派专员</p>
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
      <section class="block">
        <h4 class="block-title">触发条件</h4>
        <label class="field">
          <span>triggerKeywords</span>
          <input
            class="input"
            :value="ma().triggerKeywords.join('，')"
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
        </label>
        <label class="field">
          <span>minPromptLength</span>
          <input
            type="number"
            class="input"
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
        </label>
      </section>

      <section class="block">
        <h4 class="block-title">总指挥</h4>
        <p class="member-name">{{ ma().orchestrator.name }}</p>
        <p class="member-role">{{ ma().orchestrator.role }}</p>
      </section>

      <section class="block">
        <h4 class="block-title">专员</h4>
        <div v-for="a in ma().agents" :key="a.id" class="member">
          <Users :size="16" />
          <div>
            <span class="member-name">{{ a.name }}</span>
            <span class="member-id">{{ a.id }}</span>
            <p class="member-role">{{ a.role }}</p>
            <span class="member-meta">skills: {{ a.skillIds.join(', ') }}</span>
          </div>
        </div>
      </section>
    </template>

    <p v-else class="off-hint">关闭时对话仅使用工作区 + 单模型流式回复。</p>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.crew-detail {
  padding: 16px 20px 24px;
  flex: 1;
  overflow-y: auto;
}

.crew-toggle {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid $border-light;

  p {
    font-size: 12px;
    color: $text-secondary;
    margin-top: 4px;
  }
}

.block {
  margin-bottom: 20px;
}

.block-title {
  font-size: 12px;
  font-weight: 600;
  color: $accent;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 10px;
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

  &:focus {
    border-color: $accent;
    box-shadow: $shadow-focus;
  }
}

.member {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid $border-light;

  svg {
    color: $accent;
    flex-shrink: 0;
  }
}

.member-name {
  font-weight: 600;
  font-size: 14px;
}

.member-id {
  font-size: 11px;
  color: $text-muted;
  margin-left: 8px;
  font-family: ui-monospace, monospace;
}

.member-role {
  font-size: 13px;
  color: $text-secondary;
  margin-top: 4px;
}

.member-meta {
  font-size: 11px;
  color: $text-muted;
  display: block;
  margin-top: 4px;
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
    width: 42px;
    height: 24px;
    background: $accent-light;
    border-radius: 12px;
    position: relative;
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }
  input:checked + .slider {
    background: $accent;
    &::after {
      transform: translateX(18px);
    }
  }
}
</style>
