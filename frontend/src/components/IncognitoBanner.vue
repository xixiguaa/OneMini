<script setup lang="ts">
import { EyeOff, X } from 'lucide-vue-next'
import { useLocale } from '../composables/useLocale'
import { useAgentStore } from '../stores/agent'

withDefaults(
  defineProps<{
    /** hero：空状态居中宽卡片；inline：对话顶栏条 */
    variant?: 'hero' | 'inline'
  }>(),
  { variant: 'inline' },
)

const agent = useAgentStore()
const { t } = useLocale()
</script>

<template>
  <div
    class="incognito-banner"
    :class="variant"
    role="status"
  >
    <div class="banner-icon-wrap" aria-hidden="true">
      <EyeOff :size="variant === 'hero' ? 20 : 18" class="banner-icon" />
    </div>
    <div class="banner-text">
      <span class="banner-title">{{ t('incognito.bannerTitle') }}</span>
      <span class="banner-desc">{{ t('incognito.bannerDesc') }}</span>
    </div>
    <button type="button" class="exit-btn" @click="agent.exitIncognito()">
      <span class="exit-label">{{ t('incognito.exit') }}</span>
      <X :size="14" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.incognito-banner {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  grid-template-areas: 'icon text action';
  align-items: center;
  column-gap: 14px;
  row-gap: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(90, 70, 140, 0.32);
  background: linear-gradient(
    135deg,
    rgba(90, 70, 140, 0.1) 0%,
    rgba(60, 50, 100, 0.06) 100%
  );
}

.banner-icon-wrap {
  grid-area: icon;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(90, 70, 140, 0.12);
  flex-shrink: 0;
}

.banner-icon {
  color: $accent-emphasis;
  display: block;
}

.banner-text {
  grid-area: text;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  text-align: left;
}

.banner-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: $text-primary;
}

.banner-desc {
  font-size: 12px;
  line-height: 1.5;
  color: $text-secondary;
}

.exit-btn {
  grid-area: action;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  color: $accent-emphasis;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(90, 70, 140, 0.28);
  align-self: center;

  &:hover {
    background: rgba(255, 255, 255, 0.95);
    border-color: rgba(90, 70, 140, 0.42);
  }
}

.exit-label {
  line-height: 1;
}

/* 空状态：与输入框同宽，略加大内边距 */
.incognito-banner.hero {
  max-width: 100%;
  padding: 14px 18px;
  border-radius: 14px;

  .banner-icon-wrap {
    width: 44px;
    height: 44px;
  }

  .banner-title {
    font-size: 14px;
  }
}

@media (max-width: 520px) {
  .incognito-banner {
    grid-template-columns: 36px 1fr;
    grid-template-areas:
      'icon text'
      'action action';
    row-gap: 12px;
    align-items: start;
  }

  .exit-btn {
    width: 100%;
    align-self: stretch;
  }
}
</style>
