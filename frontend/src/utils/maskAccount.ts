import type { AuthUser } from '../api/auth'

/** 侧栏底部展示用：邮箱/手机号脱敏 */
export function maskAccountLabel(user: AuthUser | null | undefined): string {
  if (!user) return '未登录'
  const email = user.email?.trim()
  if (email) {
    const [local, domain] = email.split('@')
    if (!domain) return email
    const head = local.slice(0, Math.min(2, local.length))
    const tail = local.length > 4 ? local.slice(-2) : local.slice(-1)
    return `${head}*****${tail}@${domain}`
  }
  const phone = user.phone?.replace(/\D/g, '') ?? ''
  if (phone.length >= 7) {
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`
  }
  return user.displayName || user.id.slice(0, 8)
}

export function accountAvatarInitial(user: AuthUser | null | undefined): string {
  if (!user) return '?'
  const src = user.email || user.phone || user.displayName || user.id
  return src.charAt(0).toUpperCase()
}
