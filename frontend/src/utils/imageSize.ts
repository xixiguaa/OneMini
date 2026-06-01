/** 图片分辨率档位与宽高比 → 像素尺寸（对齐 Seedream / 即梦 2K·4K 规格） */

const IMAGE_SIZE_2K: Record<string, { width: number; height: number }> = {
  '1:1': { width: 2048, height: 2048 },
  '4:3': { width: 2304, height: 1728 },
  '3:4': { width: 1728, height: 2304 },
  '16:9': { width: 2560, height: 1440 },
  '9:16': { width: 1440, height: 2560 },
  '3:2': { width: 2496, height: 1664 },
  '2:3': { width: 1664, height: 2496 },
  '21:9': { width: 3024, height: 1296 },
}

const IMAGE_SIZE_4K: Record<string, { width: number; height: number }> = {
  '1:1': { width: 4096, height: 4096 },
  '4:3': { width: 4608, height: 3456 },
  '3:4': { width: 3456, height: 4608 },
  '16:9': { width: 5120, height: 2880 },
  '9:16': { width: 2880, height: 5120 },
  '3:2': { width: 4992, height: 3328 },
  '2:3': { width: 3328, height: 4992 },
  '21:9': { width: 6048, height: 2592 },
}

const SIZE_MAPS: Record<string, Record<string, { width: number; height: number }>> = {
  '2k': IMAGE_SIZE_2K,
  '4k': IMAGE_SIZE_4K,
}

export function resolveImageDimensions(
  resolution: string,
  aspectRatio: string,
): { width: number; height: number } {
  const tier = SIZE_MAPS[resolution] ?? IMAGE_SIZE_2K
  const ratio = aspectRatio === 'smart' ? '1:1' : aspectRatio
  return tier[ratio] ?? tier['1:1']
}

export function formatImageSize(resolution: string, aspectRatio: string): string {
  const { width, height } = resolveImageDimensions(resolution, aspectRatio)
  return `${width}x${height}`
}

/** 锁定比例时，根据一边计算另一边（偶数对齐） */
export function syncLockedDimension(
  source: 'width' | 'height',
  value: number,
  aspectRatio: string,
): { width: number; height: number } {
  const parts = aspectRatio.split(':').map((n) => parseInt(n, 10))
  if (parts.length !== 2 || parts.some((n) => !n)) {
    return { width: value, height: value }
  }
  const [wR, hR] = parts
  const align = (n: number) => Math.max(64, Math.round(n / 2) * 2)
  if (source === 'width') {
    return { width: align(value), height: align((value * hR) / wR) }
  }
  return { width: align((value * wR) / hR), height: align(value) }
}

export function toApiImageSize(width: number, height: number): string {
  return `${width}x${height}`
}
