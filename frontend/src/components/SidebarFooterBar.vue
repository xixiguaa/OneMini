<script setup lang="ts">
import { LogOut, MoreHorizontal, Settings, UserRound } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useAnchoredPopover } from '../composables/useAnchoredPopover'
import { useAgentStore } from '../stores/agent'
import { useAuthStore } from '../stores/auth'
import { accountAvatarInitial, maskAccountLabel } from '../utils/maskAccount'
import SystemSettingsDialog from './SystemSettingsDialog.vue'

const props = defineProps<{
  collapsed?: boolean
}>()

const auth = useAuthStore()
const agent = useAgentStore()
const settingsOpen = ref(false)

const collapsed = toRef(props, 'collapsed')

const menuPopover = useAnchoredPopover({
  fitContent: true,
  placement: () => (collapsed.value ? 'right' : 'above'),
  align: 'right',
  minWidth: 168,
})

const menuOpen = menuPopover.open
const menuPanelStyle = computed(() => menuPopover.panelStyle.value)
const menuTransitionName = computed(() => (collapsed.value ? 'menu-pop-right' : 'menu-pop'))

const avatarInitial = computed(() => accountAvatarInitial(auth.user))
const maskedLabel = computed(() => maskAccountLabel(auth.user))

function setTriggerRef(el: Element | null) {
  menuPopover.triggerRef.value = el as HTMLElement | null
}

function setPanelRef(el: Element | null) {
  menuPopover.panelRef.value = el as HTMLElement | null
}

function toggleMenu(e: MouseEvent) {
  menuPopover.toggle(e)
}

function closeMenu() {
  menuPopover.close()
}

function openProfileDirect() {
  agent.openUserProfile()
}

function openProfile() {
  closeMenu()
  openProfileDirect()
}

function openSettings() {
  closeMenu()
  settingsOpen.value = true
}

async function logout() {
  closeMenu()
  await auth.logout()
}

function onDocClick(e: MouseEvent) {
  if (!menuPopover.containsTarget(e.target as Node)) closeMenu()
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="footer-bar" :class="{ collapsed: props.collapsed }">
    <button
      v-if="props.collapsed"
      :ref="setTriggerRef"
      type="button"
      class="avatar-collapsed"
      :title="maskedLabel"
      aria-label="账户菜单"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click.stop="toggleMenu"
    >
      <span class="avatar">{{ avatarInitial }}</span>
    </button>

    <div v-else class="user-bar">
      <button
        type="button"
        class="user-main"
        :title="maskedLabel"
        @click="openProfileDirect"
      >
        <span class="avatar">{{ avatarInitial }}</span>
        <span class="user-label">{{ maskedLabel }}</span>
      </button>
      <button
        :ref="setTriggerRef"
        type="button"
        class="more-btn"
        aria-label="账户菜单"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @click.stop="toggleMenu"
      >
        <MoreHorizontal :size="16" />
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        class="anchored-popover-backdrop"
        aria-hidden="true"
        @click="closeMenu"
      />
      <Transition :name="menuTransitionName">
        <div
          v-if="menuOpen"
          :ref="setPanelRef"
          class="user-menu"
          role="menu"
          :style="menuPanelStyle"
          @click.stop
        >
          <button type="button" class="menu-item" role="menuitem" @click="openProfile">
            <UserRound :size="16" />
            <span>我的主页</span>
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="openSettings">
            <Settings :size="16" />
            <span>系统设置</span>
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="logout">
            <LogOut :size="16" />
            <span>退出登录</span>
          </button>
        </div>
      </Transition>
    </Teleport>

    <SystemSettingsDialog v-model:open="settingsOpen" />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.footer-bar {
  position: relative;
  flex-shrink: 0;
  margin: 0 -10px 0;
  padding: 10px 8px 0;
  border-top: 1px solid var(--sidebar-divider, $border-light);

  &.collapsed {
    margin: 0 -8px 0;
    padding: 10px 0 0;
    display: flex;
    justify-content: center;
  }
}

.avatar-collapsed {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  transition: background 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 55%, transparent);
  }

  .avatar {
    width: 28px;
    height: 28px;
  }
}

.user-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 44px;
  padding: 4px 4px 4px 6px;
  border-radius: 12px;
  color: $text-primary;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  @include cosmic.cosmic-glass-surface;

  &:hover {
    @include cosmic.cosmic-glass-hover;
  }
}

.user-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  border-radius: 8px;
  color: inherit;
  text-align: left;
  transition: background 0.15s ease;

  &:hover {
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 55%, transparent);
  }
}

.avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: $accent-light;
  color: $accent;
  font-size: 13px;
  font-weight: 600;
}

.user-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--text-label, $text-secondary);
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    color: $text-primary;
    background: color-mix(in srgb, var(--composer-option-hover, $accent-light) 72%, transparent);
  }
}

.user-menu {
  padding: 6px;
  border-radius: var(--glass-radius-md, 20px);
  background: var(--user-menu-bg);
  backdrop-filter: blur(var(--glass-blur, 24px)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--glass-blur, 24px)) saturate(1.2);
  box-shadow: var(--user-menu-shadow, var(--glass-float-shadow, $shadow-md));
  border: 1px solid $glass-border;
  pointer-events: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  text-align: left;
  border: none;
  background: none;
  transition: background 0.15s ease;

  &:hover {
    background: var(--composer-option-hover, $accent-light);
  }
}

.menu-pop-enter-active,
.menu-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.menu-pop-enter-from,
.menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.menu-pop-right-enter-active,
.menu-pop-right-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.menu-pop-right-enter-from,
.menu-pop-right-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
</style>
