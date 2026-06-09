<script setup lang="ts">
import incognitoGhostUrl from '../assets/img/chat/吃豆人.svg'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 18 },
)
</script>

<template>
  <img
    class="ghost-icon"
    :src="incognitoGhostUrl"
    alt=""
    aria-hidden="true"
    :width="size"
    :height="size"
    draggable="false"
  />
</template>

<style scoped lang="scss">
.ghost-icon {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  image-rendering: pixelated;
  transition: transform 0.15s ease;
}

@media (hover: hover) {
  button:hover > .ghost-icon {
    animation: ghost-icon-float 2s ease-in-out infinite;
  }
}

@keyframes ghost-icon-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
</style>
