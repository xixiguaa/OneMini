<script setup lang="ts">
import { Image, Video } from 'lucide-vue-next'
import { useWorksGallery } from '../composables/useWorksGallery'

const { works } = useWorksGallery()
</script>

<template>
  <section class="works-section">
    <div v-if="works.length" class="waterfall">
      <article v-for="item in works" :key="item.id" class="work-card">
        <a :href="item.url" target="_blank" rel="noopener" class="work-media">
          <img v-if="item.type === 'image'" :src="item.url" :alt="item.prompt" loading="lazy" />
          <div v-else class="video-cover">
            <Video :size="28" />
            <span>视频</span>
          </div>
        </a>
        <p v-if="item.prompt" class="work-caption">{{ item.prompt }}</p>
      </article>
    </div>

    <div v-else class="empty">
      <Image :size="32" />
      <p>暂无作品</p>
      <span>在上方输入创意并生成，图片与视频会出现在这里</span>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/variables.scss' as *;

.works-section {
  padding: 0;
}

.waterfall {
  column-count: 4;
  column-gap: 12px;

  @media (max-width: 1100px) {
    column-count: 3;
  }
  @media (max-width: 768px) {
    column-count: 2;
  }
  @media (max-width: 480px) {
    column-count: 1;
  }
}

.work-card {
  break-inside: avoid;
  margin-bottom: 12px;
  border-radius: $radius-sm;
  overflow: hidden;
  background: $bg-card;
  border: 1px solid $glass-border;
  box-shadow: $shadow-sm;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-md;
  }
}

.work-media {
  display: block;
  width: 100%;
  background: $bg-input;

  img {
    width: 100%;
    display: block;
    vertical-align: middle;
  }
}

.video-cover {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: $accent;
  background: linear-gradient(145deg, $accent-light, rgba(255, 255, 255, 0.6));
  font-size: 12px;
}

.work-caption {
  padding: 8px 10px;
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: $text-muted;
  text-align: center;
  gap: 8px;

  svg {
    color: $accent;
    opacity: 0.5;
  }

  p {
    font-size: 15px;
    font-weight: 500;
    color: $text-secondary;
  }

  span {
    font-size: 12px;
    max-width: 280px;
  }
}
</style>
