<script setup lang="ts">
import { Lock, Pencil, Share2, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useGalleryLikes } from '../composables/useGalleryLikes'
import { usePublicGallery } from '../composables/usePublicGallery'
import { useAgentStore } from '../stores/agent'
import { useAuthStore } from '../stores/auth'
import {
  profileAvatarForUser,
  profileBioForUser,
  profileDisplayNameForUser,
  useCreatorProfileStore,
} from '../stores/creatorProfile'
import { useToastStore } from '../stores/toast'
import WorksWaterfall from './WorksWaterfall.vue'

type ProfileTab = 'published' | 'liked'

const BIO_MAX = 200

const agent = useAgentStore()
const auth = useAuthStore()
const creatorProfile = useCreatorProfileStore()
const toast = useToastStore()
const { likeCount } = useGalleryLikes()
const { galleryItems: publicItems, hydrate: hydratePublicGallery } = usePublicGallery()

const activeTab = ref<ProfileTab>('published')
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

const worksOwnerId = computed(() =>
  activeTab.value === 'published' || !isOwnProfile.value ? profileTargetId.value : undefined,
)
const worksLikedOnly = computed(() => isOwnProfile.value && activeTab.value === 'liked')

const worksEmptyHint = computed(() => {
  if (worksLikedOnly.value) return '还没有赞过的作品'
  if (isOwnProfile.value) return '还没有发布作品，去创作页发布吧'
  return '还没有发布作品'
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
  toast.show({ message: '关注功能即将上线', kind: 'info' })
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

watch(bioDialogOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  void hydratePublicGallery(true)
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
  <div class="user-profile" :class="{ 'user-profile--visitor': !isOwnProfile }">
    <aside class="user-profile-aside">
      <div class="user-profile-head">
        <span class="user-profile-avatar" aria-hidden="true">
          <img v-if="avatar.avatarUrl" :src="avatar.avatarUrl" alt="" />
          <span v-else class="user-profile-avatar-fallback">{{ avatar.initial }}</span>
        </span>
        <div class="user-profile-head-meta">
          <h1 class="user-profile-name">{{ displayName }}</h1>
          <div class="user-profile-stats">
            <p class="user-profile-stats-row">
              <span><strong>0</strong> 粉丝</span>
              <span class="user-profile-stats-sep" aria-hidden="true">|</span>
              <span><strong>0</strong> 关注</span>
            </p>
            <p v-if="!isOwnProfile" class="user-profile-stats-row">
              <span><strong>{{ publishedCount }}</strong> 总使用量</span>
              <span class="user-profile-stats-sep" aria-hidden="true">|</span>
              <span><strong>{{ receivedLikes }}</strong> 获赞</span>
            </p>
          </div>
        </div>
      </div>

      <div v-if="!isOwnProfile" class="user-profile-actions">
        <button type="button" class="user-profile-follow" @click="onFollow">+ 关注</button>
        <button type="button" class="user-profile-share user-profile-share--inline" @click="shareProfile">
          <Share2 :size="16" />
          分享主页
        </button>
      </div>
      <button v-else type="button" class="user-profile-share" @click="shareProfile">
        <Share2 :size="16" />
        分享主页
      </button>

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
      <p v-else-if="bioText" class="user-profile-bio-readonly">{{ bioText }}</p>
    </aside>

    <div class="user-profile-main">
      <nav v-if="isOwnProfile" class="user-profile-tabs" aria-label="主页分类">
        <button
          type="button"
          class="user-profile-tab"
          :class="{ active: activeTab === 'published' }"
          @click="activeTab = 'published'"
        >
          已发布
        </button>
        <button
          type="button"
          class="user-profile-tab"
          :class="{ active: activeTab === 'liked' }"
          @click="activeTab = 'liked'"
        >
          赞过
          <Lock :size="12" class="user-profile-tab-lock" aria-hidden="true" />
        </button>
      </nav>
      <div v-else class="user-profile-section-label">已发布</div>

      <p v-if="isOwnProfile && activeTab === 'liked'" class="user-profile-privacy">
        你赞过的内容仅对自己可见
      </p>

      <div class="user-profile-content">
        <WorksWaterfall
          v-if="profileTargetId"
          source="public"
          media-type="all"
          :owner-id="worksOwnerId"
          :liked-only="worksLikedOnly"
          :empty-hint="worksEmptyHint"
          end-hint="没有更多了"
          :compact="!isOwnProfile"
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
@use '../styles/variables.scss' as *;
@use '../styles/cosmic-glass.scss' as cosmic;

.user-profile {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 40px;
  padding: 28px 0 40px 36px;
  overflow: hidden;
  box-sizing: border-box;

  &--visitor {
    gap: 32px;
    padding: 24px 0 36px 32px;
  }
}

.user-profile-aside {
  flex-shrink: 0;
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  .user-profile--visitor & {
    width: 280px;
    gap: 14px;
  }
}

.user-profile-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;

  .user-profile--visitor & {
    gap: 16px;
  }
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

  .user-profile--visitor & {
    width: 72px;
    height: 72px;
  }

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

  .user-profile--visitor & {
    font-size: 28px;
  }
}

.user-profile-head-meta {
  min-width: 0;
  padding-top: 4px;
}

.user-profile-name {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: $text-primary;
  word-break: break-word;

  .user-profile--visitor & {
    font-size: 20px;
    margin-bottom: 10px;
  }
}

.user-profile-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-profile-stats-row {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-muted;

  strong {
    color: $text-secondary;
    font-weight: 600;
  }
}

.user-profile-stats-sep {
  opacity: 0.45;
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
  color: $bg-page;
  background: $text-primary;
  border: none;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.9;
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
  color: $text-primary;
  background: $bg-input;
  border: 1px solid $glass-border;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: $accent-light;
    border-color: color-mix(in srgb, $accent 35%, $glass-border);
  }

  &--inline {
    flex: 1;
    width: auto;
    min-width: 0;
  }
}

.user-profile-bio-readonly {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
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

.user-profile-section-label {
  flex-shrink: 0;
  margin: 0 48px 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.user-profile-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  margin: 0 48px 16px 0;
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

.user-profile-privacy {
  flex-shrink: 0;
  margin: 0 48px 16px 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  color: $text-secondary;
  background: $bg-input;
  border: 1px solid $glass-border;
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

  .user-profile-aside,
  .user-profile--visitor .user-profile-aside {
    width: 100%;
  }

  .user-profile-tabs,
  .user-profile-section-label,
  .user-profile-privacy {
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
