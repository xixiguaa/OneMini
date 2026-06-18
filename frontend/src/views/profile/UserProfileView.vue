<script setup lang="ts">
import { Image, Lock, Pencil, Share2, Video, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGalleryLikes } from '../../composables/useGalleryLikes'
import { usePublicGallery } from '../../composables/usePublicGallery'
import { useUserFollow } from '../../composables/useUserFollow'
import { useAgentStore } from '../../stores/agent'
import { useAuthStore } from '../../stores/auth'
import {
  profileAvatarForUser,
  profileBioForUser,
  profileDisplayNameForUser,
  useCreatorProfileStore,
} from '../../stores/creatorProfile'
import { useToastStore } from '../../stores/toast'
import WorksWaterfall from '../../components/WorksWaterfall.vue'

type ProfileTab = 'published' | 'liked'
type PublishedMediaTab = 'image' | 'video'

const BIO_MAX = 200

const publishedMediaTabs = [
  { id: 'image' as const, label: '图片', icon: Image },
  { id: 'video' as const, label: '短片', icon: Video },
]

const agent = useAgentStore()
const auth = useAuthStore()
const creatorProfile = useCreatorProfileStore()
const toast = useToastStore()
const { likeCount } = useGalleryLikes()
const { galleryItems: publicItems, hydrate: hydratePublicGallery, hydrated } = usePublicGallery()

const PROFILE_WORKS_MIN_SKELETON_MS = 420
const worksListLoading = ref(true)
let worksLoadSeq = 0

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function loadProfileWorks(force = false) {
  const seq = ++worksLoadSeq
  worksListLoading.value = true
  const minWait = delay(PROFILE_WORKS_MIN_SKELETON_MS)
  await Promise.all([hydratePublicGallery(force || !hydrated.value), minWait])
  if (seq !== worksLoadSeq) return
  worksListLoading.value = false
}

const activeTab = ref<ProfileTab>('published')
const publishedMediaTab = ref<PublishedMediaTab>('image')
const bioDialogOpen = ref(false)
const bioDraft = ref('')
const bioTextareaRef = ref<HTMLTextAreaElement | null>(null)

const profileTargetId = computed(() => agent.profileUserId ?? auth.user?.id ?? '')
const isOwnProfile = computed(
  () => !agent.profileUserId || agent.profileUserId === auth.user?.id,
)

const displayName = computed(() =>
  profileDisplayNameForUser(
    profileTargetId.value,
    auth.user?.id,
    creatorProfile.prefs,
    auth.user,
  ),
)

const avatar = computed(() =>
  profileAvatarForUser(profileTargetId.value, auth.user?.id, creatorProfile.prefs, auth.user),
)

const bioText = computed(() =>
  profileBioForUser(profileTargetId.value, auth.user?.id, creatorProfile.prefs),
)

const bioCharCount = computed(() => bioDraft.value.length)
const canSaveBio = computed(() => bioDraft.value.trim() !== bioText.value)

const userPublishedItems = computed(() =>
  publicItems.value.filter(
    (item) => item.publishedBy === profileTargetId.value && item.status === 'DONE',
  ),
)

const publishedCount = computed(() => userPublishedItems.value.length)
const receivedLikes = computed(() =>
  userPublishedItems.value.reduce((sum, item) => sum + likeCount(item.id), 0),
)

const {
  canFollow,
  isFollowing,
  followerCount,
  followingCount,
  toggling: followToggling,
  loadStats: loadFollowStats,
  toggleFollow,
} = useUserFollow(() => profileTargetId.value || undefined)

const worksOwnerId = computed(() =>
  activeTab.value === 'published' || !isOwnProfile.value ? profileTargetId.value : undefined,
)
const worksLikedOnly = computed(() => isOwnProfile.value && activeTab.value === 'liked')

const worksMediaType = computed(() => (worksLikedOnly.value ? 'all' : publishedMediaTab.value))

const worksEmptyHint = computed(() => {
  if (worksLikedOnly.value) return '还没有赞过的作品'
  const mediaLabel = publishedMediaTab.value === 'video' ? '短片' : '图片'
  if (isOwnProfile.value) return `还没有发布${mediaLabel}，去创作页发布吧`
  return `还没有发布${mediaLabel}`
})

function openBioDialog() {
  if (!isOwnProfile.value) return
  bioDraft.value = creatorProfile.prefs.bio
  bioDialogOpen.value = true
  nextTick(() => bioTextareaRef.value?.focus())
}

function closeBioDialog() {
  bioDialogOpen.value = false
}

function saveBio() {
  if (!canSaveBio.value) return
  creatorProfile.setBio(bioDraft.value.trim())
  if (auth.user?.id) creatorProfile.syncPublicProfile(auth.user.id)
  bioDialogOpen.value = false
  toast.showSuccess('简介已保存')
}

function onBioKeydown(e: KeyboardEvent) {
  if (!bioDialogOpen.value) return
  if (e.key === 'Escape') closeBioDialog()
}

function onFollow() {
  if (!canFollow.value || followToggling.value) return
  void (async () => {
    try {
      const wasFollowing = isFollowing.value
      await toggleFollow()
      toast.showSuccess(wasFollowing ? '已取消关注' : '关注成功')
    } catch (err: unknown) {
      toast.showError(err instanceof Error ? err.message : '操作失败')
    }
  })()
}

async function shareProfile() {
  const userId = profileTargetId.value
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'profile')
  if (userId && !isOwnProfile.value) url.searchParams.set('user', userId)
  else url.searchParams.delete('user')
  try {
    await navigator.clipboard.writeText(url.toString())
    toast.showSuccess('主页链接已复制')
  } catch {
    toast.showError('复制失败')
  }
}

watch(isOwnProfile, (own) => {
  if (!own) activeTab.value = 'published'
})

watch(
  profileTargetId,
  (id) => {
    if (id) {
      void loadFollowStats(true)
      void loadProfileWorks(true)
    }
  },
  { immediate: true },
)

watch(bioDialogOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  if (auth.user?.id && isOwnProfile.value) {
    creatorProfile.syncPublicProfile(auth.user.id)
  }
  window.addEventListener('keydown', onBioKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onBioKeydown)
  if (bioDialogOpen.value) document.body.style.overflow = ''
})
</script>

<template>
  <div class="user-profile">
    <aside class="user-profile-aside">
      <div class="user-profile-head">
        <div class="user-profile-head-top">
          <span class="user-profile-avatar" aria-hidden="true">
            <img v-if="avatar.avatarUrl" :src="avatar.avatarUrl" alt="" />
            <span v-else class="user-profile-avatar-fallback">{{ avatar.initial }}</span>
          </span>
          <h1 class="user-profile-name">{{ displayName }}</h1>
        </div>
        <div class="user-profile-stats">
          <p class="user-profile-stats-row">
            <span class="user-profile-stat">
              <strong>{{ followerCount }}</strong>
              <span class="user-profile-stat-label">粉丝</span>
            </span>
            <span class="user-profile-stats-sep" aria-hidden="true">|</span>
            <span class="user-profile-stat">
              <strong>{{ followingCount }}</strong>
              <span class="user-profile-stat-label">关注</span>
            </span>
          </p>
          <p class="user-profile-stats-row">
            <span class="user-profile-stat">
              <strong>{{ publishedCount }}</strong>
              <span class="user-profile-stat-label">总使用量</span>
            </span>
            <span class="user-profile-stats-sep" aria-hidden="true">|</span>
            <span class="user-profile-stat">
              <strong>{{ receivedLikes }}</strong>
              <span class="user-profile-stat-label">获赞</span>
            </span>
          </p>
        </div>
      </div>

      <div class="user-profile-actions">
        <button
          v-if="canFollow"
          type="button"
          class="user-profile-follow"
          :class="{ 'user-profile-follow--active': isFollowing }"
          :disabled="followToggling"
          @click="onFollow"
        >
          {{ isFollowing ? '已关注' : '+ 关注' }}
        </button>
        <button
          type="button"
          class="user-profile-share"
          :class="{ 'user-profile-share--inline': canFollow }"
          @click="shareProfile"
        >
          <Share2 :size="16" />
          分享主页
        </button>
      </div>

      <div
        v-if="isOwnProfile"
        class="user-profile-bio"
        :class="{ 'has-bio': !!bioText }"
        role="button"
        tabindex="0"
        @click="openBioDialog"
        @keydown.enter.prevent="openBioDialog"
      >
        <span v-if="bioText" class="user-profile-bio-text">{{ bioText }}</span>
        <span v-else class="user-profile-bio-placeholder">添加个人简介</span>
        <span class="user-profile-bio-edit-icon" aria-hidden="true">
          <Pencil :size="14" />
        </span>
      </div>
      <div v-else-if="bioText" class="user-profile-bio user-profile-bio--readonly">
        <span class="user-profile-bio-text">{{ bioText }}</span>
      </div>
    </aside>

    <div class="user-profile-main">
      <nav class="user-profile-tabs" aria-label="主页分类">
        <button
          type="button"
          class="user-profile-tab"
          :class="{ active: isOwnProfile ? activeTab === 'published' : true }"
          @click="isOwnProfile && (activeTab = 'published')"
        >
          已发布
        </button>
        <div v-if="isOwnProfile" class="user-profile-tab-wrap">
          <button
            type="button"
            class="user-profile-tab"
            :class="{ active: activeTab === 'liked' }"
            @click="activeTab = 'liked'"
          >
            赞过
            <Lock :size="12" class="user-profile-tab-lock" aria-hidden="true" />
          </button>
          <span class="user-profile-liked-tip" role="tooltip">你赞过的内容仅对自己可见</span>
        </div>
      </nav>

      <div v-if="!worksLikedOnly" class="user-profile-subtabs">
        <div class="user-profile-subtabs-inner">
          <button
            v-for="tab in publishedMediaTabs"
            :key="tab.id"
            type="button"
            class="user-profile-subtab"
            :class="{ active: publishedMediaTab === tab.id }"
            @click="publishedMediaTab = tab.id"
          >
            <component :is="tab.icon" :size="12" />
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="user-profile-content">
        <WorksWaterfall
          v-if="profileTargetId"
          source="public"
          :media-type="worksMediaType"
          :owner-id="worksOwnerId"
          :liked-only="worksLikedOnly"
          :loading="worksListLoading"
          :empty-hint="worksEmptyHint"
          end-hint="没有更多啦～"
        />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="bio-dialog-fade">
      <div
        v-if="bioDialogOpen"
        class="bio-dialog-overlay"
        role="presentation"
        @click.self="closeBioDialog"
      >
        <div class="bio-dialog" role="dialog" aria-modal="true" aria-labelledby="bio-dialog-title">
          <header class="bio-dialog-head">
            <h2 id="bio-dialog-title" class="bio-dialog-title">修改简介</h2>
            <button type="button" class="bio-dialog-close" aria-label="关闭" @click="closeBioDialog">
              <X :size="18" />
            </button>
          </header>

          <div class="bio-dialog-body">
            <div class="bio-dialog-field">
              <textarea
                ref="bioTextareaRef"
                v-model="bioDraft"
                class="bio-dialog-textarea"
                placeholder="请填写你的简介"
                :maxlength="BIO_MAX"
                rows="6"
              />
              <span class="bio-dialog-counter">{{ bioCharCount }}/{{ BIO_MAX }}</span>
            </div>
          </div>

          <footer class="bio-dialog-foot">
            <button type="button" class="bio-dialog-btn ghost" @click="closeBioDialog">取消</button>
            <button
              type="button"
              class="bio-dialog-btn primary"
              :disabled="!canSaveBio"
              @click="saveBio"
            >
              保存
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../../styles/variables.scss' as *;
@use '../../styles/cosmic-glass.scss' as cosmic;

.user-profile {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 40px;
  padding: 28px 0 40px 36px;
  overflow: hidden;
  box-sizing: border-box;
}

.user-profile-aside {
  flex-shrink: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.user-profile-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-profile-head-top {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.user-profile-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $accent-light;
  border: 1px solid $glass-border;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.user-profile-avatar-fallback {
  font-size: 24px;
  font-weight: 700;
  color: $accent-emphasis;
}

.user-profile-name {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 700;
  color: $text-primary;
  line-height: 1.3;
  word-break: break-word;
}

.user-profile-stats {
  display: flex;
  flex-direction: column;
  margin-top: 18px;
  gap: 4px;
}

.user-profile-stats-row {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
}

.user-profile-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;

  strong {
    color: $text-primary;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}

.user-profile-stat-label {
  color: $text-muted;
}

.user-profile-stats-sep {
  color: $text-muted;
  opacity: 0.45;
  user-select: none;
}

.user-profile-actions {
  display: flex;
  gap: 10px;
}

.user-profile-follow {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid color-mix(in srgb, $border-light 70%, #fff);
  box-shadow: $shadow-sm;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    color 0.15s ease;

  &:hover:not(:disabled) {
    background: #fff;
    border-color: color-mix(in srgb, $accent 22%, $border-light);
    box-shadow: $shadow-md;
  }

  &:disabled {
    opacity: 0.65;
    cursor: wait;
  }

  &--active {
    color: $text-secondary;
    background: color-mix(in srgb, var(--bg-input) 88%, transparent);
    border: 1px solid $border-light;
    box-shadow: none;

    &:hover:not(:disabled) {
      background: $accent-light;
      border-color: color-mix(in srgb, $accent 28%, $border-light);
      color: $text-primary;
    }
  }
}

.user-profile-share {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: $text-secondary;
  background: color-mix(in srgb, var(--bg-input) 72%, transparent);
  border: 1px solid color-mix(in srgb, $border-light 80%, transparent);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    color: $text-primary;
    background: color-mix(in srgb, var(--bg-elevated) 80%, $accent-light);
    border-color: color-mix(in srgb, $accent 28%, $border-light);
  }

  &--inline {
    flex: 1;
    width: auto;
    min-width: 0;
  }
}

.user-profile-bio--readonly {
  cursor: default;
}

.user-profile-bio {
  max-width: 100%;
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;

  &:hover .user-profile-bio-edit-icon,
  &:focus-within .user-profile-bio-edit-icon {
    opacity: 1;
  }

  &:not(.has-bio) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.user-profile-bio-text {
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-profile-bio-placeholder {
  color: $text-muted;
}

.user-profile-bio-edit-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-left: 4px;
  vertical-align: top;
  border-radius: 6px;
  background: $bg-input;
  border: 1px solid $glass-border;
  color: $text-secondary;
  opacity: 0;
  transition: opacity 0.15s ease;

  .has-bio & {
    margin-top: 1px;
  }
}

.user-profile-bio:hover .user-profile-bio-text {
  color: $text-primary;
}

.user-profile-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.user-profile-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  margin: 0 48px 10px 0;
}

.user-profile-subtabs {
  flex-shrink: 0;
  margin: 0 48px 14px 0;
}

.user-profile-subtabs-inner {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba($text-muted, 0.06);
  border: 1px solid $border-light;
}

.user-profile-subtab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 12px;
  color: $text-muted;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover:not(.active) {
    color: $text-primary;
    background: color-mix(in srgb, $accent 10%, transparent);
  }

  &.active {
    background: var(--bg-card);
    color: $text-primary;
    font-weight: 600;
    box-shadow: $shadow-sm;
  }
}

.user-profile-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: $text-muted;
  background: transparent;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    color: $text-primary;
    background: $accent-light;
  }

  &.active {
    color: $text-primary;
    background: $bg-input;
  }
}

.user-profile-tab-lock {
  opacity: 0.5;
}

.user-profile-tab-wrap {
  position: relative;

  &:hover .user-profile-liked-tip,
  &:focus-within .user-profile-liked-tip {
    opacity: 1;
    visibility: visible;
    transform: translate(0, -50%);
  }
}

.user-profile-liked-tip {
  position: absolute;
  top: 50%;
  left: calc(100% + 10px);
  z-index: 4;
  width: max-content;
  max-width: 260px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $glass-border;
  box-shadow: $shadow-sm;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transform: translate(-6px, -50%);
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease;
}

.user-profile-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;

  :deep(.works-section) {
    padding-right: 48px;
    box-sizing: border-box;
  }
}

@media (max-width: 900px) {
  .user-profile {
    flex-direction: column;
    gap: 24px;
    padding: 20px 16px 32px;
    overflow-y: auto;
  }

  .user-profile-aside {
    width: 100%;
  }

  .user-profile-tabs {
    margin-right: 0;
  }

  .user-profile-subtabs {
    margin-right: 0;
  }

  .user-profile-content :deep(.works-section) {
    padding-right: 0;
  }
}

.bio-dialog-overlay {
  @include cosmic.cosmic-modal-overlay(10060);
}

.bio-dialog {
  @include cosmic.cosmic-modal-panel-wide(480px);
  padding: 0;
  overflow: hidden;
}

.bio-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid $glass-border;
}

.bio-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.bio-dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: $text-muted;

  &:hover {
    background: $accent-light;
    color: $text-primary;
  }
}

.bio-dialog-body {
  padding: 18px 20px;
}

.bio-dialog-field {
  position: relative;
}

.bio-dialog-textarea {
  width: 100%;
  min-height: 160px;
  padding: 14px 16px 36px;
  border-radius: 10px;
  border: 1px solid $glass-border;
  background: $bg-input;
  color: $text-primary;
  font-size: 14px;
  line-height: 1.55;
  resize: none;
  box-sizing: border-box;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    outline: none;
    border-color: $accent;
  }
}

.bio-dialog-counter {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 12px;
  color: $text-muted;
  pointer-events: none;
}

.bio-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid $glass-border;
}

.bio-dialog-btn {
  min-width: 72px;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;

  &.ghost {
    color: $text-primary;
    background: $bg-input;
    border: 1px solid $glass-border;

    &:hover {
      background: $accent-light;
    }
  }

  &.primary {
    color: #fff;
    background: $accent;

    &:hover:not(:disabled) {
      background: $accent-hover;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}

@include cosmic.cosmic-modal-fade-transition('bio-dialog-fade', '.bio-dialog');
</style>
