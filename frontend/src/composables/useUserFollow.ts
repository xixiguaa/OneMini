import { computed, ref } from 'vue'
import {
  fetchFollowStats,
  followUserApi,
  unfollowUserApi,
  type FollowStats,
} from '../api/follows'
import { useAuthStore } from '../stores/auth'
import { formatUserError } from '../utils/formatUserError'

const statsByUserId = ref<Record<string, FollowStats>>({})
const loadingIds = ref(new Set<string>())
const togglingIds = ref(new Set<string>())

function setStats(userId: string, stats: FollowStats) {
  statsByUserId.value = { ...statsByUserId.value, [userId]: stats }
}

export function useUserFollow(targetUserId: () => string | undefined) {
  const auth = useAuthStore()

  const userId = computed(() => (targetUserId() || '').trim())

  const isSelf = computed(
    () => !!userId.value && !!auth.user?.id && userId.value === auth.user.id,
  )

  const stats = computed(() => (userId.value ? statsByUserId.value[userId.value] : undefined))

  const followerCount = computed(() => stats.value?.followerCount ?? 0)
  const followingCount = computed(() => stats.value?.followingCount ?? 0)
  const isFollowing = computed(() => stats.value?.isFollowing ?? false)

  const loading = computed(() => (userId.value ? loadingIds.value.has(userId.value) : false))
  const toggling = computed(() => (userId.value ? togglingIds.value.has(userId.value) : false))

  const canFollow = computed(() => !!userId.value && !isSelf.value)

  async function loadStats(force = false) {
    const id = userId.value
    if (!id) return
    if (!force && statsByUserId.value[id]) return
    if (loadingIds.value.has(id)) return

    loadingIds.value = new Set([...loadingIds.value, id])
    try {
      const next = await fetchFollowStats(id)
      setStats(id, next)
    } catch {
      if (!statsByUserId.value[id]) {
        setStats(id, {
          userId: id,
          followerCount: 0,
          followingCount: 0,
          isFollowing: false,
        })
      }
    } finally {
      const next = new Set(loadingIds.value)
      next.delete(id)
      loadingIds.value = next
    }
  }

  async function follow() {
    const id = userId.value
    if (!id || isSelf.value || toggling.value) return false
    togglingIds.value = new Set([...togglingIds.value, id])
    try {
      const next = await followUserApi(id)
      setStats(id, next)
      return true
    } catch (err: unknown) {
      throw new Error(formatUserError(err, '关注失败'))
    } finally {
      const next = new Set(togglingIds.value)
      next.delete(id)
      togglingIds.value = next
    }
  }

  async function unfollow() {
    const id = userId.value
    if (!id || isSelf.value || toggling.value) return false
    togglingIds.value = new Set([...togglingIds.value, id])
    try {
      const next = await unfollowUserApi(id)
      setStats(id, next)
      return true
    } catch (err: unknown) {
      throw new Error(formatUserError(err, '取消关注失败'))
    } finally {
      const next = new Set(togglingIds.value)
      next.delete(id)
      togglingIds.value = next
    }
  }

  async function toggleFollow() {
    if (isFollowing.value) return unfollow()
    return follow()
  }

  return {
    userId,
    isSelf,
    canFollow,
    followerCount,
    followingCount,
    isFollowing,
    loading,
    toggling,
    loadStats,
    follow,
    unfollow,
    toggleFollow,
  }
}
