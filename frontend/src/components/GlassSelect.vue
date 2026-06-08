<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'

export interface GlassSelectOption {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: GlassSelectOption[]
    placeholder?: string
    disabled?: boolean
    menuAlign?: 'left' | 'right'
    ariaLabel?: string
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    menuAlign: 'left',
    ariaLabel: '选择项',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() => props.options.find((o) => o.value === props.modelValue))

const displayLabel = computed(() => selectedOption.value?.label ?? props.placeholder)

const isPlaceholder = computed(() => !selectedOption.value)

function toggle(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  open.value = !open.value
}

function select(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  if (!rootRef.value?.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div
    ref="rootRef"
    class="glass-select"
    :class="{ 'glass-select--open': open, 'glass-select--disabled': disabled }"
  >
    <button
      type="button"
      class="glass-select__trigger"
      :class="{ open, placeholder: isPlaceholder }"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-haspopup="true"
      :aria-label="ariaLabel"
      @click="toggle"
    >
      <slot name="trigger-prefix" :option="selectedOption" />
      <span class="glass-select__label">{{ displayLabel }}</span>
      <ChevronDown :size="14" class="glass-select__chevron" :class="{ open }" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="glass-select__menu"
      :class="`glass-select__menu--${menuAlign}`"
      role="listbox"
      :aria-label="ariaLabel"
    >
      <button
        v-for="opt in options"
        :key="opt.value || '__empty__'"
        type="button"
        class="glass-select__option"
        :class="{ active: modelValue === opt.value }"
        role="option"
        :aria-selected="modelValue === opt.value"
        :disabled="opt.disabled"
        @click="select(opt.value)"
      >
        <slot name="option" :option="opt" :active="modelValue === opt.value">
          <span class="glass-select__option-label">{{ opt.label }}</span>
        </slot>
        <Check
          v-if="modelValue === opt.value"
          :size="14"
          class="glass-select__check"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.glass-select {
  position: relative;
  width: 100%;
}

.glass-select__trigger {
  @include cosmic.cosmic-glass-select-trigger;

  &.placeholder .glass-select__label {
    color: $text-muted;
  }
}

.glass-select__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.glass-select__chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  color: $text-muted;
  pointer-events: none;
  transition: transform 0.15s ease;

  &.open {
    transform: translateY(-50%) rotate(180deg);
  }
}

.glass-select__menu {
  @include cosmic.cosmic-glass-dropdown-menu;
  top: calc(100% + 6px);
  left: 0;

  &--right {
    left: auto;
    right: 0;
  }
}

.glass-select__option {
  @include cosmic.cosmic-glass-dropdown-option;

  .glass-select__check {
    margin-left: auto;
    flex-shrink: 0;
    color: $accent;
  }
}

.glass-select__option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
