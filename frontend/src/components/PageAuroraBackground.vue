<template>
  <div class="page-aurora" aria-hidden="true">
    <div class="page-aurora__mesh" />
    <div class="page-aurora__blob page-aurora__blob--purple" />
    <div class="page-aurora__blob page-aurora__blob--pink" />
    <div class="page-aurora__blob page-aurora__blob--blue" />
    <div class="page-aurora__blob page-aurora__blob--lavender" />
    <div class="page-aurora__grain" />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/cosmic-glass.scss' as cosmic;

.page-aurora {
  @include cosmic.aurora-mesh-panel;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.page-aurora__mesh {
  position: absolute;
  inset: 0;
  background: var(--chat-mesh-overlay);
  opacity: 0.92;
}

.page-aurora__grain {
  position: absolute;
  inset: 0;
  opacity: 0.025;
  background-image: var(--glass-noise-image);
  background-size: 180px 180px;
  mix-blend-mode: soft-light;
}

.page-aurora__blob {
  position: absolute;
  border-radius: 50%;

  &--purple {
    @include cosmic.aurora-mesh-blob(
      min(62vw, 560px),
      min(56vh, 520px),
      $bottom: -18%,
      $left: -12%,
      $color: var(--chat-blob-purple),
      $animation: chat-aurora-drift-1 16s ease-in-out infinite,
      $blur: 110px
    );
  }

  &--pink {
    @include cosmic.aurora-mesh-blob(
      min(54vw, 500px),
      min(50vh, 460px),
      $top: -14%,
      $right: -6%,
      $color: var(--chat-blob-pink),
      $animation: chat-aurora-drift-2 18s ease-in-out infinite,
      $blur: 105px
    );
  }

  &--blue {
    @include cosmic.aurora-mesh-blob(
      min(46vw, 420px),
      min(44vh, 400px),
      $top: 42%,
      $left: 32%,
      $color: var(--chat-blob-blue),
      $animation: chat-aurora-drift-3 20s ease-in-out infinite,
      $blur: 95px
    );
  }

  &--lavender {
    @include cosmic.aurora-mesh-blob(
      min(38vw, 360px),
      min(36vh, 340px),
      $top: 8%,
      $left: 12%,
      $color: var(--chat-blob-lavender),
      $animation: chat-aurora-drift-4 22s ease-in-out infinite,
      $blur: 90px
    );
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-aurora__blob {
    animation: none !important;
  }
}
</style>
