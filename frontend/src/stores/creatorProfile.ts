import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { AuthUser } from '../api/auth'
import { accountAvatarInitial, maskAccountLabel } from '../utils/maskAccount'

const STORAGE_KEY = 'onemini-creator-profile'
const PUBLIC_PROFILES_KEY = 'onemini-creator-profiles-by-user'

export interface CreatorProfilePrefs {
  /** 发现页 / 创意视频卡片上展示的名称 */
  nickname: string
  /** data URL 或远程图片地址 */
  avatarUrl: string
  /** 个人主页简介 */
  bio: string
}

export type PublicCreatorProfile = CreatorProfilePrefs

const EMPTY: CreatorProfilePrefs = { nickname: '', avatarUrl: '', bio: '' }

function loadPrefs(): CreatorProfilePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<CreatorProfilePrefs>
    return {
      nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
    }
  } catch {
    return { ...EMPTY }
  }
}

function loadPublicProfiles(): Record<string, PublicCreatorProfile> {
  try {
    const raw = localStorage.getItem(PUBLIC_PROFILES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Partial<PublicCreatorProfile>>
    const out: Record<string, PublicCreatorProfile> = {}
    for (const [userId, profile] of Object.entries(parsed)) {
      if (!userId || !profile || typeof profile !== 'object') continue
      out[userId] = {
        nickname: typeof profile.nickname === 'string' ? profile.nickname : '',
        avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : '',
        bio: typeof profile.bio === 'string' ? profile.bio : '',
      }
    }
    return out
  } catch {
    return {}
  }
}

function savePublicProfiles(map: Record<string, PublicCreatorProfile>) {
  try {
    localStorage.setItem(PUBLIC_PROFILES_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

function shortUserLabel(userId: string): string {
  const short = userId.replace(/-/g, '').slice(0, 8)
  return short ? `用户 ${short}` : '创作者'
}

function initialFromUserId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 1).toUpperCase() || '?'
}

export function creatorDisplayName(
  user: AuthUser | null | undefined,
  prefs: CreatorProfilePrefs,
): string {
  const custom = prefs.nickname.trim()
  if (custom) return custom
  return maskAccountLabel(user)
}

export function creatorAvatarInitial(
  user: AuthUser | null | undefined,
  prefs: CreatorProfilePrefs,
): string {
  const custom = prefs.nickname.trim()
  if (custom) return custom.slice(0, 1).toUpperCase() || '?'
  return accountAvatarInitial(user)
}

export function publicProfileForUser(userId: string): PublicCreatorProfile | null {
  return loadPublicProfiles()[userId] ?? null
}

export function profileDisplayNameForUser(
  userId: string,
  currentUserId: string | undefined,
  currentPrefs: CreatorProfilePrefs,
  authUser: AuthUser | null | undefined,
): string {
  if (currentUserId && userId === currentUserId) {
    return creatorDisplayName(authUser, currentPrefs)
  }
  const publicProfile = publicProfileForUser(userId)
  if (publicProfile?.nickname.trim()) return publicProfile.nickname.trim()
  return shortUserLabel(userId)
}

export function profileAvatarForUser(
  userId: string,
  currentUserId: string | undefined,
  currentPrefs: CreatorProfilePrefs,
  authUser: AuthUser | null | undefined,
): { avatarUrl: string; initial: string } {
  if (currentUserId && userId === currentUserId) {
    const avatarUrl = currentPrefs.avatarUrl.trim()
    return {
      avatarUrl,
      initial: creatorAvatarInitial(authUser, currentPrefs),
    }
  }
  const publicProfile = publicProfileForUser(userId)
  if (publicProfile?.avatarUrl.trim()) {
    const nickname = publicProfile.nickname.trim()
    return {
      avatarUrl: publicProfile.avatarUrl.trim(),
      initial: nickname ? nickname.slice(0, 1).toUpperCase() : initialFromUserId(userId),
    }
  }
  if (publicProfile?.nickname.trim()) {
    return { avatarUrl: '', initial: publicProfile.nickname.trim().slice(0, 1).toUpperCase() }
  }
  return { avatarUrl: '', initial: initialFromUserId(userId) }
}

export function profileBioForUser(
  userId: string,
  currentUserId: string | undefined,
  currentPrefs: CreatorProfilePrefs,
): string {
  if (currentUserId && userId === currentUserId) return currentPrefs.bio.trim()
  return publicProfileForUser(userId)?.bio.trim() ?? ''
}

export function authorLabelForItem(
  publishedBy: string | undefined,
  currentUserId: string | undefined,
  prefs: CreatorProfilePrefs,
  user: AuthUser | null | undefined,
): string {
  if (publishedBy && currentUserId && publishedBy === currentUserId) {
    return creatorDisplayName(user, prefs)
  }
  if (publishedBy) {
    return profileDisplayNameForUser(publishedBy, currentUserId, prefs, user)
  }
  return creatorDisplayName(user, prefs)
}

export function authorAvatarForItem(
  publishedBy: string | undefined,
  currentUserId: string | undefined,
  prefs: CreatorProfilePrefs,
  user: AuthUser | null | undefined,
): { avatarUrl: string; initial: string } {
  if (publishedBy && currentUserId && publishedBy === currentUserId) {
    return profileAvatarForUser(publishedBy, currentUserId, prefs, user)
  }
  if (publishedBy) {
    return profileAvatarForUser(publishedBy, currentUserId, prefs, user)
  }
  return { avatarUrl: '', initial: creatorAvatarInitial(user, prefs) }
}

export const useCreatorProfileStore = defineStore('creatorProfile', () => {
  const prefs = ref<CreatorProfilePrefs>(loadPrefs())

  watch(
    prefs,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
      } catch {
        /* quota */
      }
    },
    { deep: true },
  )

  function syncPublicProfile(userId: string) {
    if (!userId) return
    const map = loadPublicProfiles()
    map[userId] = { ...prefs.value }
    savePublicProfiles(map)
  }

  function setNickname(nickname: string) {
    prefs.value = { ...prefs.value, nickname }
  }

  function setAvatarUrl(avatarUrl: string) {
    prefs.value = { ...prefs.value, avatarUrl }
  }

  function clearAvatar() {
    prefs.value = { ...prefs.value, avatarUrl: '' }
  }

  function setBio(bio: string) {
    prefs.value = { ...prefs.value, bio }
  }

  const hasCustomAvatar = computed(() => Boolean(prefs.value.avatarUrl.trim()))

  return {
    prefs,
    setNickname,
    setAvatarUrl,
    clearAvatar,
    setBio,
    syncPublicProfile,
    hasCustomAvatar,
  }
})
