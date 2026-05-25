<script setup lang="ts">
import { BRAND_LOGO, BRAND_NAME } from '../utils/modelLogo'

withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 64 },
)
</script>

<template>
  <img
    :src="BRAND_LOGO"
    :alt="BRAND_NAME"
    class="brand-logo"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped lang="scss">
.brand-logo {
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}
</style>
