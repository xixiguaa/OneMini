<script setup lang="ts">
import { Info, Languages, Moon, Sun } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useLocale } from '../composables/useLocale'
import { useUiPrefsStore } from '../stores/uiPrefs'
import { APP_VERSION } from '../types/agent'
import { BRAND_NAME } from '../utils/modelLogo'

const props = defineProps<{
  collapsed?: boolean
}>()

const ui = useUiPrefsStore()
const { t } = useLocale()

type PanelId = 'about' | 'lang' | null
const openPanel = ref<PanelId>(null)
const rootRef = ref<HTMLElement | null>(null)

function togglePanel(id: Exclude<PanelId, null>) {
  openPanel.value = openPanel.value === id ? null : id
}

function onDocClick(e: MouseEvent) {
  if (!rootRef.value?.contains(e.target as Node)) openPanel.value = null
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootRef" class="footer-bar" :class="{ collapsed: props.collapsed }">
    <div class="footer-toolbar">
      <div class="footer-actions">
        <div class="action-wrap">
          <button
            type="button"
            class="action-btn"
            :class="{ active: openPanel === 'about' }"
            :title="t('footer.about')"
            :aria-label="t('footer.about')"
            :aria-expanded="openPanel === 'about'"
            @click.stop="togglePanel('about')"
          >
            <Info :size="16" />
          </button>
          <div v-if="openPanel === 'about'" class="popover card" @click.stop>
            <h3 class="popover-title">{{ t('footer.aboutTitle') }}</h3>
            <p class="popover-desc">{{ t('footer.aboutDesc') }}</p>
            <p class="popover-meta">{{ BRAND_NAME }} · {{ APP_VERSION }}</p>
          </div>
        </div>

        <div class="action-wrap">
          <button
            type="button"
            class="action-btn"
            :class="{ active: openPanel === 'lang' }"
            :title="t('footer.language')"
            :aria-label="t('footer.language')"
            :aria-expanded="openPanel === 'lang'"
            :aria-haspopup="true"
            @click.stop="togglePanel('lang')"
          >
            <Languages :size="16" />
            <span class="sr-only">{{ t('footer.language') }}</span>
          </button>
          <div v-if="openPanel === 'lang'" class="popover popover-menu card" @click.stop>
            <button
              type="button"
              class="menu-item"
              :class="{ selected: ui.locale === 'zh' }"
              @click="ui.setLocale('zh'); openPanel = null"
            >
              {{ t('footer.langZh') }}
            </button>
            <button
              type="button"
              class="menu-item"
              :class="{ selected: ui.locale === 'en' }"
              @click="ui.setLocale('en'); openPanel = null"
            >
              {{ t('footer.langEn') }}
            </button>
          </div>
        </div>

        <button
          type="button"
          class="action-btn"
          :title="ui.theme === 'dark' ? t('footer.themeLight') : t('footer.themeDark')"
          :aria-label="ui.theme === 'dark' ? t('footer.themeLight') : t('footer.themeDark')"
          @click="ui.toggleTheme()"
        >
          <Moon v-if="ui.theme === 'light'" :size="16" />
          <Sun v-else :size="16" />
        </button>
      </div>

      <span v-show="!props.collapsed" class="version">{{ APP_VERSION }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.footer-bar {
  flex-shrink: 0;
  margin: auto -10px -12px;
  border-top: 1px solid $glass-border;

  &.collapsed {
    margin-left: -6px;
    margin-right: -6px;
    margin-bottom: -12px;
  }
}

.footer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;

  .footer-bar.collapsed & {
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    padding: 8px 4px;
  }
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 2px;

  .footer-bar.collapsed & {
    flex-direction: column;
    gap: 4px;
  }
}

.action-wrap {
  position: relative;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: $text-muted;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover,
  &.active {
    background: $accent-light;
    color: $text-primary;
  }

  &.active {
    color: $accent;
  }
}

.popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 200px;
  padding: 12px;
  z-index: 30;
  box-shadow: $shadow-md;

  .footer-bar.collapsed & {
    left: calc(100% + 8px);
    bottom: 0;
  }
}

.popover-menu {
  min-width: 140px;
  padding: 4px;
}

.popover-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.popover-desc {
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.5;
  margin-bottom: 8px;
}

.popover-meta {
  font-size: 10px;
  color: $text-muted;
  font-family: ui-monospace, monospace;
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  color: $text-secondary;
  text-align: left;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }

  &.selected {
    color: $accent;
    font-weight: 500;
    background: $accent-light;
  }
}

.version {
  flex-shrink: 0;
  font-size: 11px;
  color: $text-muted;
  font-family: ui-monospace, monospace;
  user-select: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
