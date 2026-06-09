<script setup lang="ts">
import { computed } from 'vue'
import { resolveAgentAvatarSrc } from '../config/agentAvatars'

/** 与 Cosmic Glass 主题一致的紫罗兰 / 薰衣草 / 青绿渐变 */
const AVATAR_GRADIENTS = [
  'linear-gradient(145deg, #8d72ec 0%, #5338c0 100%)',
  'linear-gradient(145deg, #9b84f0 0%, #6c4edc 100%)',
  'linear-gradient(145deg, #a888f4 0%, #7c5fe8 100%)',
  'linear-gradient(145deg, #b86ae8 0%, #6848c8 100%)',
  'linear-gradient(145deg, #7c8cf0 0%, #5a48c8 100%)',
  'linear-gradient(145deg, #8878f0 0%, #6248d0 100%)',
  'linear-gradient(145deg, #9a7cf5 0%, #6b52d4 100%)',
  'linear-gradient(145deg, #6ec8e8 0%, #0dcfb0 100%)',
] as const

const props = withDefaults(
  defineProps<{
    name: string
    id?: string
    avatar?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const imageSrc = computed(() => resolveAgentAvatarSrc(props.avatar))

const HAN_CHAR_RE = /\p{Script=Han}/u
const EMOJI_RE = /\p{Extended_Pictographic}/u

const initial = computed(() => {
  const trimmed = props.name.trim()
  if (!trimmed) return '智'

  const han = trimmed.match(HAN_CHAR_RE)
  if (han) return han[0]

  const emoji = trimmed.match(EMOJI_RE)
  if (emoji) return emoji[0]

  return '智'
})

const gradient = computed(() => {
  const seed = props.id ?? props.name
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!
})
</script>

<template>
  <img
    v-if="imageSrc"
    class="agent-avatar agent-avatar--img"
    :class="`agent-avatar--${size}`"
    :src="imageSrc"
    :alt="name"
  />
  <span
    v-else
    class="agent-avatar"
    :class="`agent-avatar--${size}`"
    :style="{ background: gradient }"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.agent-avatar {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fff 24%, transparent),
    0 2px 8px color-mix(in srgb, $accent 18%, transparent);
}

.agent-avatar--img {
  display: block;
  object-fit: cover;
  background: $bg-input;
}

.agent-avatar--sm {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 12px;
}

.agent-avatar--md {
  width: 32px;
  height: 32px;
  font-size: 13px;
}

.agent-avatar--lg {
  width: 40px;
  height: 40px;
  font-size: 16px;
}
</style>
