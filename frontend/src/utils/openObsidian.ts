/** Obsidian 官方下载页（新标签页打开） */
export const OBSIDIAN_DOWNLOAD_URL = 'https://obsidian.md/download'

/** 构建 Obsidian URI：用本地绝对路径打开仓库或笔记 */
export function buildObsidianOpenUri(absolutePath: string): string {
  return `obsidian://open?path=${encodeURIComponent(absolutePath)}`
}

/**
 * 根据 wiki 根目录与当前选中节点，解析要在 Obsidian 中打开的路径。
 * - 已选 wiki 页：打开对应 .md
 * - 已选 raw：打开 raw 文件
 * - 否则：打开 llm-wiki 根目录（Vault）
 */
export function resolveObsidianTargetPath(
  wikiRoot: string,
  selectedId: string | null,
  nodeFilePath?: string | null,
): string {
  const root = wikiRoot.replace(/\/$/, '')
  if (!selectedId) return root

  const relFromContent = nodeFilePath?.replace(/^\//, '').trim()
  if (relFromContent) {
    return `${root}/${relFromContent}`
  }

  const id = selectedId.replace(/^\//, '')
  if (id.startsWith('raw/')) {
    return `${root}/${id}`
  }
  if (id.startsWith('wiki/')) {
    const rel = id.endsWith('.md') ? id : `${id}.md`
    return `${root}/${rel}`
  }
  return root
}

/**
 * 尝试唤起 Obsidian 自定义协议。
 * 浏览器无法可靠检测是否已安装，通过 blur / 页面隐藏启发式判断；
 * 超时则视为未安装或用户未授权协议。
 */
export function tryOpenObsidianVault(
  absolutePath: string,
  timeoutMs = 1800,
): Promise<boolean> {
  const uri = buildObsidianOpenUri(absolutePath)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      window.removeEventListener('blur', onActivate)
      window.removeEventListener('pagehide', onActivate)
      document.removeEventListener('visibilitychange', onVisibility)
      resolve(ok)
    }

    const onActivate = () => finish(true)
    const onVisibility = () => {
      if (document.hidden) finish(true)
    }

    window.addEventListener('blur', onActivate, { once: true })
    window.addEventListener('pagehide', onActivate, { once: true })
    document.addEventListener('visibilitychange', onVisibility)

    const timer = window.setTimeout(() => finish(false), timeoutMs)

    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.src = uri
    document.body.appendChild(iframe)
    window.setTimeout(() => iframe.remove(), 4000)

    const link = document.createElement('a')
    link.href = uri
    link.style.display = 'none'
    link.setAttribute('aria-hidden', 'true')
    document.body.appendChild(link)
    link.click()
    link.remove()
  })
}
