export type SharePlatform = 'qq' | 'wechat' | 'xiaohongshu' | 'douyin'

export async function copyShareLink(url: string): Promise<void> {
  await navigator.clipboard.writeText(url)
}

export function openQQShare(url: string, title: string) {
  const shareUrl = new URL('https://connect.qq.com/widget/shareqq/index.html')
  shareUrl.searchParams.set('url', url)
  shareUrl.searchParams.set('title', title)
  shareUrl.searchParams.set('desc', title)
  window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer,width=720,height=480')
}

export async function shareViaPlatform(
  platform: SharePlatform,
  url: string,
  title: string,
): Promise<string> {
  switch (platform) {
    case 'qq':
      openQQShare(url, title)
      return '已打开 QQ 分享'
    case 'wechat':
      await copyShareLink(url)
      return '链接已复制，请打开微信粘贴分享'
    case 'xiaohongshu':
      await copyShareLink(url)
      return '链接已复制，请在小红书 App 中分享'
    case 'douyin':
      await copyShareLink(url)
      return '链接已复制，请在抖音 App 中分享'
    default:
      return ''
  }
}
