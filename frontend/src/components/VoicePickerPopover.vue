<script setup lang="ts">
import { ChevronDown, ChevronLeft, Pause, Play, Plus, SlidersHorizontal, Star } from 'lucide-vue-next'
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

const props = withDefaults(
  defineProps<{
    open: boolean
    anchor: HTMLElement | null
    /** 顶部输入区向下展开；底部输入区向上展开 */
    placement?: 'above' | 'below'
  }>(),
  { placement: 'below' },
)

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
const settingsOpenVoiceId = ref<string | null>(null)
const settingsAnchorEl = ref<HTMLElement | null>(null)
const settingsPopperRef = ref<HTMLElement | null>(null)
const settingsPopperStyle = ref<Record<string, string>>({})

const filterKeys = Object.keys(VOICE_FILTERS) as VoiceFilterKey[]
const detailMode = computed(() => detailVoiceId.value !== null)
const detailVoice = computed(() =>
  DEFAULT_VOICES.find((v) => v.id === detailVoiceId.value) ?? null,
)
const settingsVoice = computed(() =>
  DEFAULT_VOICES.find((v) => v.id === settingsOpenVoiceId.value) ?? null,
)

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
    ...(props.placement === 'below'
      ? { top: `${r.bottom + gap}px` }
      : { bottom: `${window.innerHeight - r.top + gap}px` }),
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

function closeDetail() {
  detailVoiceId.value = null
  closeSettingsPopper()
}

function closeSettingsPopper() {
  settingsOpenVoiceId.value = null
  settingsAnchorEl.value = null
}

function formatSpeed(speed: number) {
  return Number.isInteger(speed) ? `${speed}x` : `${speed.toFixed(1)}x`
}

function updateSettingsPopperPosition() {
  const el = settingsAnchorEl.value
  if (!el) return

  const r = el.getBoundingClientRect()
  const gap = 8
  const width = Math.max(280, r.width)
  const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12))

  settingsPopperStyle.value = {
    position: 'fixed',
    zIndex: '10007',
    width: `${width}px`,
    left: `${left}px`,
    top: `${r.bottom + gap}px`,
  }
}

async function measureSettingsPopper() {
  await nextTick()
  updateSettingsPopperPosition()
  requestAnimationFrame(updateSettingsPopperPosition)
}

function toggleSettings(voice: VoiceItem, e: MouseEvent) {
  e.stopPropagation()
  if (settingsOpenVoiceId.value === voice.id) {
    closeSettingsPopper()
    return
  }
  if (settingsOpenVoiceId.value !== voice.id) {
    detailSpeed.value = 1
    detailEmotion.value = '中性'
  }
  settingsOpenVoiceId.value = voice.id
  if (detailMode.value) {
    detailVoiceId.value = voice.id
  }
  settingsAnchorEl.value = (e.currentTarget as HTMLElement).closest(
    '.voice-strip-card, .voice-item',
  ) as HTMLElement
  void measureSettingsPopper()
}

function onVoiceItemClick(voice: VoiceItem, e: MouseEvent) {
  const el = e.target as Element
  if (el.closest('.voice-item__play, .voice-item__star-wrap, .voice-item__settings, .voice-item__tag')) {
    return
  }
  selectVoice(voice)
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

function openDetail(voice: VoiceItem, e?: MouseEvent) {
  e?.stopPropagation()
  closeSettingsPopper()
  detailVoiceId.value = voice.id
  detailSpeed.value = 1
  detailEmotion.value = '中性'
}

function selectVoice(voice: VoiceItem) {
  selectedVoiceId.value = voice.id
  closeSettingsPopper()
  emit('select', voice)
  close()
}

function onStripSelect(voice: VoiceItem) {
  detailVoiceId.value = voice.id
  detailSpeed.value = 1
  detailEmotion.value = '中性'
  closeSettingsPopper()
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
  const target = e.target as Node

  if (settingsOpenVoiceId.value) {
    if (settingsPopperRef.value?.contains(target)) return
    if ((e.target as Element).closest?.('.voice-strip-card__settings, .voice-item__settings')) return
    closeSettingsPopper()
  }

  if (!props.open) return
  if (panelRef.value?.contains(target)) return
  if (props.anchor?.contains(target)) return
  close()
}

function onViewportChange() {
  if (props.open) updatePosition()
  if (settingsOpenVoiceId.value) updateSettingsPopperPosition()
}

watch(
  () => props.open,
  (open) => {
    if (open) void measureAndPosition()
    else {
      openFilter.value = null
      detailVoiceId.value = null
      closeSettingsPopper()
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
      class="voice-picker composer-popover create-composer-popover"
      :class="{ 'voice-picker--detail': detailMode }"
      :style="panelStyle"
      role="dialog"
      aria-label="选择音色"
      @click.stop
    >
      <!-- 多情感详情：横向音色条 + 底部调节面板 -->
      <template v-if="detailMode && detailVoice">
        <div class="voice-picker__detail-head">
          <button
            type="button"
            class="voice-picker__back"
            @click="closeDetail"
          >
            <ChevronLeft :size="16" />
            <span>返回列表</span>
          </button>
          <button
            type="button"
            class="voice-picker__apply"
            @click="selectVoice(detailVoice)"
          >
            使用音色
          </button>
        </div>

        <div class="voice-picker__strip-wrap">
          <div class="voice-picker__strip">
            <div
              v-for="voice in displayedVoices.filter((v) => v.multiEmotion)"
              :key="voice.id"
              role="button"
              tabindex="0"
              class="voice-strip-card"
              :class="{ active: detailVoiceId === voice.id }"
              @click="onStripSelect(voice)"
              @keydown.enter.prevent="onStripSelect(voice)"
            >
              <span
                class="voice-strip-card__play"
                @click="togglePlay(voice, $event)"
              >
                <Pause v-if="playingId === voice.id" :size="10" />
                <Play v-else :size="10" />
              </span>
              <span class="voice-strip-card__label">
                <span class="voice-strip-card__name">{{ voice.name }}</span>
                <span
                  class="voice-strip-card__star-wrap"
                  @mouseenter="starTipVoiceId = voice.id"
                  @mouseleave="starTipVoiceId = null"
                  @click="toggleFavorite(voice, $event)"
                >
                  <span v-if="starTipVoiceId === voice.id" class="voice-strip-card__star-tip">收藏</span>
                  <Star
                    :size="12"
                    :class="{ filled: favoriteIds.has(voice.id) }"
                    class="voice-strip-card__star"
                  />
                </span>
              </span>
              <span
                role="button"
                tabindex="0"
                class="voice-strip-card__settings"
                :class="{ active: settingsOpenVoiceId === voice.id }"
                aria-label="调节语速与情绪"
                @click="toggleSettings(voice, $event)"
                @keydown.enter.prevent="toggleSettings(voice, $event as unknown as MouseEvent)"
              >
                <SlidersHorizontal :size="12" />
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- 浏览列表 -->
      <template v-else>
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

        <div class="voice-picker__filter-slot">
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
        </div>

        <div class="voice-picker__body">
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

            <button
              v-for="voice in displayedVoices"
              :key="voice.id"
              type="button"
              class="voice-item"
              :class="{
                selected: selectedVoiceId === voice.id,
                'voice-item--multi': voice.multiEmotion,
              }"
              @click="onVoiceItemClick(voice, $event)"
            >
              <span
                class="voice-item__play"
                @click="togglePlay(voice, $event)"
              >
                <Pause v-if="playingId === voice.id" :size="10" />
                <Play v-else :size="10" />
              </span>
              <span class="voice-item__label">
                <span class="voice-item__name">{{ voice.name }}</span>
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
              </span>
              <span class="voice-item__end">
                <span
                  v-if="voice.tag"
                  class="voice-item__tag"
                  @click="voice.multiEmotion ? openDetail(voice, $event) : undefined"
                >{{ voice.tag }}</span>
                <span
                  v-if="voice.multiEmotion"
                  role="button"
                  tabindex="0"
                  class="voice-item__settings"
                  :class="{ active: settingsOpenVoiceId === voice.id }"
                  aria-label="调节语速与情绪"
                  @click="toggleSettings(voice, $event)"
                  @keydown.enter.prevent="toggleSettings(voice, $event as unknown as MouseEvent)"
                >
                  <SlidersHorizontal :size="12" />
                </span>
              </span>
            </button>
          </div>
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="open && settingsOpenVoiceId && settingsVoice"
      ref="settingsPopperRef"
      class="voice-settings-popper composer-popover create-composer-popover"
      :style="settingsPopperStyle"
      role="dialog"
      aria-label="音色调节"
      @click.stop
    >
      <div class="voice-detail-panel">
        <div class="voice-detail-panel__row">
          <span class="voice-detail-panel__label">说话速度</span>
          <div class="voice-detail-panel__speed">
            <input
              v-model.number="detailSpeed"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              class="glass-range voice-detail-panel__slider"
              :style="{ '--range-fill': `${((detailSpeed - 0.5) / 1.5) * 100}%` }"
            />
            <span class="voice-detail-panel__speed-val">{{ formatSpeed(detailSpeed) }}</span>
          </div>
        </div>
        <div class="voice-detail-panel__row">
          <span class="voice-detail-panel__label">情绪</span>
          <div class="voice-detail-panel__emotions">
            <button
              v-for="emo in VOICE_EMOTIONS"
              :key="emo"
              type="button"
              class="voice-detail-panel__emo"
              :class="{ active: detailEmotion === emo }"
              @click="detailEmotion = emo"
            >
              {{ emo }}
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
  padding: 14px 16px 16px;
  border-radius: var(--glass-radius-md, 20px);
  background: var(--composer-menu-bg);
  border: var(--glass-border-width, 0) solid var(--border-light);
  box-shadow: var(--glass-float-shadow, $shadow-md);
  color: var(--composer-menu-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &:not(.voice-picker--detail) {
    height: min(345px, calc(100vh - 120px));
  }

  &--detail {
    max-height: min(200px, calc(100vh - 120px));
    padding-bottom: 14px;
  }
}

.voice-picker__tabs {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.voice-picker__tab {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  transition: color 0.15s;

  &.active {
    color: var(--composer-menu-text);
  }

  &:hover:not(.active) {
    color: var(--text-secondary);
  }
}

.voice-picker__filter-slot {
  flex-shrink: 0;
  min-height: 34px;
  margin-bottom: 12px;
}

.voice-picker__filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.voice-picker__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
  color: var(--composer-menu-text);
  background: var(--input-muted-bg);
  border: 1px solid var(--input-muted-border);
  transition: background 0.15s, border-color 0.15s;

  &.open,
  &:hover {
    background: var(--composer-option-hover);
    border-color: color-mix(in srgb, var(--composer-border-focus) 35%, transparent);
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.voice-filter__chevron {
  flex-shrink: 0;
  opacity: 0.55;
  transition: transform 0.2s;

  .open & {
    transform: rotate(180deg);
  }
}

.voice-filter__menu {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 2;
  padding: 6px;
  border-radius: 10px;
  background: var(--composer-menu-bg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-md);
}

.voice-filter__option {
  display: block;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  text-align: left;
  color: var(--composer-menu-text);
  transition: background 0.12s;

  &:hover,
  &.active {
    background: var(--composer-option-hover);
  }
}

.voice-picker__empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-muted);
  font-size: 14px;
}

.voice-picker__empty-btn {
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--composer-menu-text);
  background: var(--btn-ghost-bg);
  border: 1px solid var(--btn-ghost-border);
  transition: background 0.15s;

  &:hover {
    background: var(--btn-ghost-hover-bg);
    color: var(--btn-ghost-hover-text);
  }
}

.voice-picker__grid-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin: 0 -2px;
  padding: 0 2px 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 999px;
  }
}

.voice-picker__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
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
  color: var(--composer-menu-text);
  background: var(--btn-ghost-bg);
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  text-align: left;

  &:hover,
  &.selected {
    background: var(--composer-option-hover);
    border-color: var(--border-light);
  }

  &--create {
    justify-content: flex-start;
    color: var(--text-secondary);
    border: 1px dashed var(--border-light);
    background: transparent;

    &:hover {
      background: var(--composer-picker-hover);
      border-color: color-mix(in srgb, var(--composer-border-focus) 40%, transparent);
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
  background: var(--composer-option-hover);
  flex-shrink: 0;
  color: var(--composer-menu-text);
}

.voice-item__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--composer-menu-text) 14%, transparent);
  color: var(--composer-menu-text);
  transition: background 0.12s;

  &:hover {
    background: color-mix(in srgb, var(--composer-menu-text) 22%, transparent);
  }
}

.voice-item__label {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.voice-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-item__end {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.voice-item__tag {
  flex-shrink: 0;
  max-width: 48px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 1.3;
  font-weight: 500;
  color: var(--accent-emphasis);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  overflow: hidden;
  white-space: nowrap;
  cursor: pointer;
  transition: max-width 0.15s ease, opacity 0.12s ease, padding 0.15s ease, margin 0.15s ease;
}

.voice-item__star-wrap,
.voice-item__settings {
  flex-shrink: 0;
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: width 0.15s ease, opacity 0.12s ease, color 0.12s;
}

.voice-item:hover .voice-item__star-wrap,
.voice-item__star-wrap:has(.filled) {
  width: 18px;
  opacity: 1;
  pointer-events: auto;
}

.voice-item:hover .voice-item__settings,
.voice-item__settings.active {
  width: 18px;
  opacity: 1;
  pointer-events: auto;
}

.voice-item--multi:hover .voice-item__tag {
  max-width: 0;
  opacity: 0;
  padding-left: 0;
  padding-right: 0;
  margin: 0;
  pointer-events: none;
}

.voice-item__star-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  color: var(--text-muted);

  &:hover {
    color: var(--composer-menu-text);
  }
}

.voice-item__star-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--composer-menu-text);
  background: var(--composer-menu-bg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
  z-index: 1;
}

.voice-item__star {
  &.filled {
    fill: $accent-gold;
    color: $accent-gold;
  }
}

.voice-item__settings {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;

  &:hover,
  &.active {
    color: var(--composer-menu-text);
    background: color-mix(in srgb, var(--composer-menu-text) 10%, transparent);
  }
}

/* 详情模式 */
.voice-picker__detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.voice-picker__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.15s;

  &:hover {
    color: var(--composer-menu-text);
  }
}

.voice-picker__apply {
  height: 30px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: $btn-primary-text;
  background: var(--btn-primary-gradient);
  box-shadow: var(--btn-primary-shadow);
  transition: filter 0.15s;

  &:hover {
    filter: brightness(1.06);
  }
}

.voice-picker__strip-wrap {
  flex-shrink: 0;
  margin: 0 -4px 10px;
  padding: 0 4px;
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.voice-picker__strip {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: min-content;
  padding-bottom: 2px;
}

.voice-strip-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--composer-menu-text);
  background: var(--btn-ghost-bg);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;

  &.active {
    background: var(--composer-option-hover);
    border-color: color-mix(in srgb, var(--composer-border-focus) 45%, transparent);
  }

  &:hover:not(.active) {
    background: var(--composer-picker-hover);
  }
}

.voice-strip-card__play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--composer-menu-text) 14%, transparent);
  color: var(--composer-menu-text);
}

.voice-strip-card__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 112px;
}

.voice-strip-card__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-strip-card__settings {
  margin-left: auto;
}

.voice-strip-card__star-wrap,
.voice-strip-card__settings {
  flex-shrink: 0;
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition: width 0.15s ease, opacity 0.12s ease, color 0.12s;
}

.voice-strip-card:hover .voice-strip-card__star-wrap,
.voice-strip-card__star-wrap:has(.filled) {
  width: 18px;
  opacity: 1;
  pointer-events: auto;
}

.voice-strip-card:hover .voice-strip-card__settings,
.voice-strip-card__settings.active {
  width: 18px;
  opacity: 1;
  pointer-events: auto;
}

.voice-strip-card__star-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  color: var(--text-muted);

  &:hover {
    color: var(--composer-menu-text);
  }
}

.voice-strip-card__star-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--composer-menu-text);
  background: var(--composer-menu-bg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  pointer-events: none;
}

.voice-strip-card__star {
  &.filled {
    fill: $accent-gold;
    color: $accent-gold;
  }
}

.voice-strip-card__settings {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.12s, background 0.12s;

  &:hover,
  &.active {
    color: var(--composer-menu-text);
    background: color-mix(in srgb, var(--composer-menu-text) 10%, transparent);
  }
}

.voice-settings-popper {
  box-sizing: border-box;
  padding: 0;
  border-radius: var(--glass-radius-md, 14px);
  color: var(--composer-menu-text);
  pointer-events: auto;
}

.voice-detail-panel {
  padding: 14px;
  border-radius: 12px;
  background: var(--input-muted-bg);
  border: 1px solid var(--input-muted-border);
}

.voice-detail-panel__row + .voice-detail-panel__row {
  margin-top: 14px;
}

.voice-detail-panel__label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-label);
}

.voice-detail-panel__speed {
  display: flex;
  align-items: center;
  gap: 12px;
}

.voice-detail-panel__slider {
  flex: 1;
}

.voice-detail-panel__speed-val {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 28px;
}

.voice-detail-panel__emotions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.voice-detail-panel__emo {
  height: 32px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--composer-menu-text);
  background: var(--btn-ghost-bg);
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;

  &:hover {
    background: var(--composer-picker-hover);
  }

  &.active {
    background: var(--composer-option-hover);
    border-color: color-mix(in srgb, var(--composer-border-focus) 40%, transparent);
  }
}
</style>

<style lang="scss">
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.voice-picker.create-composer-popover,
.voice-settings-popper.create-composer-popover {
  @include cosmic.cosmic-glass-frost(var(--glass-radius-md, 20px));
  background: var(--composer-menu-bg, var(--glass-fill-gradient));
  box-shadow: var(--glass-float-shadow, $shadow-md);
}
</style>
