<script setup lang="ts">
import { ChevronDown, Pause, Play, Plus, SlidersHorizontal, Star } from 'lucide-vue-next'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import {
  DEFAULT_VOICES,
  VOICE_EMOTIONS,
  VOICE_FILTERS,
  VOICE_TABS,
  type VoiceEmotion,
  type VoiceFilterKey,
  type VoiceItem,
  type VoiceTab,
} from '../config/voicePicker'
import { useToastStore } from '../stores/toast'

const props = defineProps<{
  open: boolean
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [voice: VoiceItem]
}>()

const toast = useToastStore()
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const activeTab = ref<VoiceTab>('all')
const openFilter = ref<VoiceFilterKey | null>(null)
const filterSelections = ref<Record<VoiceFilterKey, string>>({
  gender: 'all',
  age: 'all',
  language: 'all',
  trait: 'all',
})
const selectedVoiceId = ref<string | null>(null)
const detailVoiceId = ref<string | null>(null)
const favoriteIds = ref<Set<string>>(new Set())
const myVoiceIds = ref<Set<string>>(new Set())
const playingId = ref<string | null>(null)
const detailSpeed = ref(1)
const detailEmotion = ref<VoiceEmotion>('中性')
const starTipVoiceId = ref<string | null>(null)

const filterKeys = Object.keys(VOICE_FILTERS) as VoiceFilterKey[]

const displayedVoices = computed(() => {
  if (activeTab.value === 'mine') {
    return DEFAULT_VOICES.filter((v) => myVoiceIds.value.has(v.id))
  }
  if (activeTab.value === 'favorite') {
    return DEFAULT_VOICES.filter((v) => favoriteIds.value.has(v.id))
  }
  return DEFAULT_VOICES
})

function filterLabel(key: VoiceFilterKey) {
  const def = VOICE_FILTERS[key]
  const selected = filterSelections.value[key]
  if (selected === 'all') return def.label
  const opt = def.options.find((o) => o.id === selected)
  return opt?.label ?? def.label
}

function updatePosition() {
  const anchor = props.anchor
  if (!anchor) return

  const r = anchor.getBoundingClientRect()
  const gap = 10
  const width = Math.min(r.width, 720, window.innerWidth - 24)
  const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))

  panelStyle.value = {
    position: 'fixed',
    zIndex: '10006',
    width: `${width}px`,
    left: `${left}px`,
    bottom: `${window.innerHeight - r.top + gap}px`,
  }
}

async function measureAndPosition() {
  await nextTick()
  updatePosition()
  requestAnimationFrame(updatePosition)
}

function close() {
  emit('update:open', false)
  openFilter.value = null
  detailVoiceId.value = null
}

function toggleFilter(key: VoiceFilterKey, e: MouseEvent) {
  e.stopPropagation()
  openFilter.value = openFilter.value === key ? null : key
}

function pickFilter(key: VoiceFilterKey, optionId: string) {
  filterSelections.value[key] = optionId
  openFilter.value = null
}

function togglePlay(voice: VoiceItem, e: MouseEvent) {
  e.stopPropagation()
  playingId.value = playingId.value === voice.id ? null : voice.id
}

function toggleFavorite(voice: VoiceItem, e: MouseEvent) {
  e.stopPropagation()
  const next = new Set(favoriteIds.value)
  if (next.has(voice.id)) next.delete(voice.id)
  else next.add(voice.id)
  favoriteIds.value = next
}

function openDetail(voice: VoiceItem, e: MouseEvent) {
  e.stopPropagation()
  detailVoiceId.value = detailVoiceId.value === voice.id ? null : voice.id
  detailSpeed.value = 1
  detailEmotion.value = '中性'
}

function selectVoice(voice: VoiceItem) {
  selectedVoiceId.value = voice.id
  emit('select', voice)
  close()
}

function onCreateVoice() {
  toast.show({ message: '创建音色即将推出', kind: 'info' })
}

function goFavoriteTab() {
  activeTab.value = 'all'
}

function onBackdropClick() {
  close()
}

function onDocumentClick(e: MouseEvent) {
  if (!props.open) return
  const target = e.target as Node
  if (panelRef.value?.contains(target)) return
  if (props.anchor?.contains(target)) return
  close()
}

function onViewportChange() {
  if (props.open) updatePosition()
}

watch(
  () => props.open,
  (open) => {
    if (open) void measureAndPosition()
    else {
      openFilter.value = null
      detailVoiceId.value = null
    }
  },
)

watch(
  () => props.anchor,
  () => {
    if (props.open) void measureAndPosition()
  },
)

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick, true)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="voice-picker-backdrop"
      aria-hidden="true"
      @click="onBackdropClick"
    />
    <div
      v-if="open"
      ref="panelRef"
      class="voice-picker"
      :style="panelStyle"
      role="dialog"
      aria-label="选择音色"
      @click.stop
    >
      <div class="voice-picker__tabs">
        <button
          v-for="tab in VOICE_TABS"
          :key="tab.id"
          type="button"
          class="voice-picker__tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTab === 'all'" class="voice-picker__filters">
        <div
          v-for="key in filterKeys"
          :key="key"
          class="voice-filter"
        >
          <button
            type="button"
            class="voice-filter__trigger"
            :class="{ open: openFilter === key }"
            @click="toggleFilter(key, $event)"
          >
            <span>{{ filterLabel(key) }}</span>
            <ChevronDown :size="12" class="voice-filter__chevron" />
          </button>
          <div v-if="openFilter === key" class="voice-filter__menu">
            <button
              v-for="opt in VOICE_FILTERS[key].options"
              :key="opt.id"
              type="button"
              class="voice-filter__option"
              :class="{ active: filterSelections[key] === opt.id }"
              @click="pickFilter(key, opt.id)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'mine' && myVoiceIds.size === 0" class="voice-picker__empty">
        <p>你还没有创建过音色</p>
        <button type="button" class="voice-picker__empty-btn" @click="onCreateVoice">
          创建音色
        </button>
      </div>

      <div
        v-else-if="activeTab === 'favorite' && favoriteIds.size === 0"
        class="voice-picker__empty"
      >
        <p>你还没有收藏过音色</p>
        <button type="button" class="voice-picker__empty-btn" @click="goFavoriteTab">
          去收藏
        </button>
      </div>

      <div v-else class="voice-picker__grid-wrap">
        <div class="voice-picker__grid">
          <button
            v-if="activeTab === 'all'"
            type="button"
            class="voice-item voice-item--create"
            @click="onCreateVoice"
          >
            <span class="voice-item__create-icon">
              <Plus :size="14" />
            </span>
            <span>创建音色</span>
          </button>

          <div
            v-for="voice in displayedVoices"
            :key="voice.id"
            class="voice-item-wrap"
          >
            <div
              v-if="detailVoiceId === voice.id"
              class="voice-detail"
            >
              <div class="voice-detail__row">
                <span class="voice-detail__label">说话速度</span>
                <div class="voice-detail__speed">
                  <input
                    v-model.number="detailSpeed"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    class="voice-detail__slider"
                  />
                  <span class="voice-detail__speed-val">{{ detailSpeed.toFixed(1) }}x</span>
                </div>
              </div>
              <div class="voice-detail__row">
                <span class="voice-detail__label">情绪</span>
                <div class="voice-detail__emotions">
                  <button
                    v-for="emo in VOICE_EMOTIONS"
                    :key="emo"
                    type="button"
                    class="voice-detail__emo"
                    :class="{ active: detailEmotion === emo }"
                    @click="detailEmotion = emo"
                  >
                    {{ emo }}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="voice-item"
              :class="{ selected: selectedVoiceId === voice.id }"
              @click="selectVoice(voice)"
            >
              <span
                class="voice-item__play"
                @click="togglePlay(voice, $event)"
              >
                <Pause v-if="playingId === voice.id" :size="10" />
                <Play v-else :size="10" />
              </span>
              <span class="voice-item__name">{{ voice.name }}</span>
              <span
                v-if="voice.tag"
                class="voice-item__tag"
              >{{ voice.tag }}</span>
              <span
                class="voice-item__star-wrap"
                @mouseenter="starTipVoiceId = voice.id"
                @mouseleave="starTipVoiceId = null"
                @click="toggleFavorite(voice, $event)"
              >
                <span v-if="starTipVoiceId === voice.id" class="voice-item__star-tip">收藏</span>
                <Star
                  :size="12"
                  :class="{ filled: favoriteIds.has(voice.id) }"
                  class="voice-item__star"
                />
              </span>
              <span
                v-if="voice.multiEmotion"
                class="voice-item__settings"
                @click="openDetail(voice, $event)"
              >
                <SlidersHorizontal :size="12" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.voice-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10005;
  background: transparent;
}

.voice-picker {
  box-sizing: border-box;
  padding: 16px 18px 18px;
  border-radius: 16px;
  background: var(--voice-picker-bg, rgba(28, 28, 32, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(20px);
  max-height: min(420px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.voice-picker__tabs {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.voice-picker__tab {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
  transition: color 0.15s;

  &.active {
    color: #fff;
  }

  &:hover:not(.active) {
    color: rgba(255, 255, 255, 0.72);
  }
}

.voice-picker__filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.voice-filter {
  position: relative;
  min-width: 0;
}

.voice-filter__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background 0.15s, border-color 0.15s;

  &.open,
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.voice-filter__chevron {
  flex-shrink: 0;
  opacity: 0.6;
  transition: transform 0.2s;

  .open & {
    transform: rotate(180deg);
  }
}

.voice-filter__menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 6px;
  border-radius: 10px;
  background: rgba(22, 22, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.voice-filter__option {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  color: rgba(255, 255, 255, 0.92);
  transition: background 0.12s;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.1);
  }
}

.voice-picker__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 200px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 14px;
}

.voice-picker__empty-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

.voice-picker__grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -4px;
  padding: 0 4px 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 999px;
  }
}

.voice-picker__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.voice-item-wrap {
  position: relative;
  min-width: 0;
}

.voice-detail {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 3;
  padding: 14px;
  border-radius: 12px;
  background: rgba(22, 22, 26, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}

.voice-detail__row + .voice-detail__row {
  margin-top: 12px;
}

.voice-detail__label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.voice-detail__speed {
  display: flex;
  align-items: center;
  gap: 10px;
}

.voice-detail__slider {
  flex: 1;
  height: 4px;
  accent-color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}

.voice-detail__speed-val {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  font-variant-numeric: tabular-nums;
  min-width: 28px;
}

.voice-detail__emotions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.voice-detail__emo {
  height: 30px;
  border-radius: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.08);
  transition: background 0.12s;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.16);
  }
}

.voice-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  text-align: left;

  &:hover,
  &.selected {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.08);
  }

  &--create {
    justify-content: flex-start;
    color: rgba(255, 255, 255, 0.72);
    border: 1px dashed rgba(255, 255, 255, 0.14);
    background: transparent;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.22);
    }
  }
}

.voice-item__create-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.voice-item__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transition: background 0.12s;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.voice-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-item__tag {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.2;
  color: $accent-cyan;
  background: color-mix(in srgb, $accent-cyan 14%, transparent);
}

.voice-item__star-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.45);
  transition: color 0.12s;

  &:hover {
    color: rgba(255, 255, 255, 0.85);
  }
}

.voice-item__star-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 6px 6px 6px 6px;
  font-size: 11px;
  white-space: nowrap;
  color: #fff;
  background: rgba(18, 18, 22, 0.96);
  pointer-events: none;

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: rgba(18, 18, 22, 0.96);
  }
}

.voice-item__star {
  &.filled {
    fill: rgba(255, 200, 80, 0.85);
    color: rgba(255, 200, 80, 0.85);
  }
}

.voice-item__settings {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.45);
  transition: color 0.12s;

  &:hover {
    color: rgba(255, 255, 255, 0.85);
  }
}

html[data-theme='light'] {
  .voice-picker {
    background: rgba(255, 255, 255, 0.96);
    border-color: $border-light;
    box-shadow: $shadow-md;
  }

  .voice-picker__tab {
    color: $text-muted;

    &.active {
      color: $text-primary;
    }
  }

  .voice-filter__trigger {
    color: $text-primary;
    background: rgba(0, 0, 0, 0.04);
    border-color: $border-light;
  }

  .voice-filter__menu,
  .voice-detail {
    background: var(--bg-card);
    border-color: $border-light;
  }

  .voice-filter__option,
  .voice-item {
    color: $text-primary;
  }

  .voice-item {
    background: rgba(0, 0, 0, 0.03);

    &:hover,
    &.selected {
      background: $accent-light;
    }
  }

  .voice-picker__empty {
    color: $text-muted;
  }
}
</style>
