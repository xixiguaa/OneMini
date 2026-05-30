/** 根据视频分辨率档位（短边像素）与宽高比计算输出尺寸 */
export function resolveVideoDimensions(
  resolution: string,
  aspectRatio: string,
): { width: number; height: number } {
  const heightPx: Record<string, number> = {
    '480': 480,
    '720': 720,
    '1080': 1080,
  }
  const base = heightPx[resolution] ?? 720
  const ratioId = aspectRatio === 'smart' ? '16:9' : aspectRatio
  const parts = ratioId.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 2 || parts.some((n) => !n)) {
    return { width: 1280, height: 720 }
  }
  const [wR, hR] = parts
  const align = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  if (wR >= hR) {
    const height = base
    const width = align((height * wR) / hR)
    return { width, height }
  }
  const width = base
  const height = align((width * hR) / wR)
  return { width, height }
}

export function formatVideoSize(resolution: string, aspectRatio: string): string {
  const { width, height } = resolveVideoDimensions(resolution, aspectRatio)
  return `${width}x${height}`
}
