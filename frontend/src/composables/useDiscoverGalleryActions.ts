import { computed, inject, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { createStudioOpenFloatingComposerKey } from './createStudioScroll'
import type { GalleryItem } from './useWorksGallery'
import { useGalleryLikes } from './useGalleryLikes'
import { useAuthStore } from '../stores/auth'
import {
  authorAvatarForItem,
  authorLabelForItem,
  useCreatorProfileStore,
} from '../stores/creatorProfile'
import { useAgentStore } from '../stores/agent'
import { useToastStore } from '../stores/toast'
import { formatUserError } from '../utils/formatUserError'

export function useDiscoverGalleryActions(itemSource: MaybeRefOrGetter<GalleryItem | null>) {
  const auth = useAuthStore()
  const agent = useAgentStore()
  const toast = useToastStore()
  const creatorProfile = useCreatorProfileStore()
  const { isLiked, likeCount, toggleLike } = useGalleryLikes()
  const openFloatingComposer = inject(createStudioOpenFloatingComposerKey, undefined)

  const refLoading = ref(false)

  const item = computed(() => toValue(itemSource))

  const authorName = computed(() => {
    const it = item.value
    if (!it) return ''
    return authorLabelForItem(it.publishedBy, auth.user?.id, creatorProfile.prefs, auth.user)
  })

  const authorAvatar = computed(() => {
    const it = item.value
    if (!it) return { avatarUrl: '', initial: '?' }
    return authorAvatarForItem(it.publishedBy, auth.user?.id, creatorProfile.prefs, auth.user)
  })

  const liked = computed(() => {
    const id = item.value?.id
    return id ? isLiked(id) : false
  })

  const likes = computed(() => {
    const id = item.value?.id
    return id ? likeCount(id) : 0
  })

  const canUseReference = computed(() => {
    const it = item.value
    return !!it && it.type === 'image' && it.status === 'DONE' && !!it.url
  })

  async function onMakeSameStyle() {
    const it = item.value
    if (!it) return
    const prompt = it.prompt.trim()
    if (!prompt) {
      toast.showError('该作品暂无提示词')
      return
    }
    const mode = it.type === 'video' ? 'video' : 'image'
    const referenceImageUrl = it.type === 'image' && it.url ? it.url : undefined
    if (openFloatingComposer) {
      try {
        await openFloatingComposer({ prompt, mode, referenceImageUrl })
      } catch (err: unknown) {
        toast.showError(formatUserError(err, '参考图加载失败'))
      }
      return
    }
    try {
      await agent.beginGalleryRemix({ mode, prompt, imageUrl: referenceImageUrl })
      agent.setCurrentView('create')
    } catch (err: unknown) {
      toast.showError(formatUserError(err, '参考图加载失败'))
    }
  }

  async function onUseReference() {
    const it = item.value
    if (!it?.url || !canUseReference.value || refLoading.value) return
    refLoading.value = true
    try {
      const prompt = it.prompt.trim()
      if (openFloatingComposer) {
        await openFloatingComposer({
          prompt,
          mode: 'image',
          referenceImageUrl: it.url,
          referenceImageName: '智能参考.jpg',
        })
      } else {
        await agent.beginGalleryRemix({
          mode: 'image',
          prompt,
          imageUrl: it.url,
          imageName: '智能参考.jpg',
        })
        agent.setCurrentView('create')
      }
      toast.showSuccess('已设为参考图')
    } catch (err: unknown) {
      toast.showError(formatUserError(err, '参考图加载失败'))
    } finally {
      refLoading.value = false
    }
  }

  function onToggleLike() {
    const id = item.value?.id
    if (id) toggleLike(id)
  }

  function openAuthorProfile() {
    const publishedBy = item.value?.publishedBy
    if (!publishedBy) return
    agent.openUserProfile(publishedBy)
  }

  return {
    refLoading,
    authorName,
    authorAvatar,
    liked,
    likes,
    canUseReference,
    onMakeSameStyle,
    onUseReference,
    onToggleLike,
    openAuthorProfile,
  }
}
