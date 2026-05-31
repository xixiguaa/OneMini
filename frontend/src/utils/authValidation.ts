const PASSWORD_MIN = 8
const PASSWORD_MAX = 128
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const PHONE_RE = /^1[3-9]\d{9}$/
const LETTER_RE = /[a-zA-Z]/
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/

export function validatePassword(password: string): string | null {
  const pwd = password || ''
  if (!pwd.trim()) return '请输入密码'
  if (pwd.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`
  if (pwd.length > PASSWORD_MAX) return `密码不能超过 ${PASSWORD_MAX} 位`
  if (!LETTER_RE.test(pwd)) return '密码须包含字母'
  if (!SPECIAL_RE.test(pwd)) return '密码须包含特殊字符（如 !@#$%）'
  return null
}

export function validateRegisterEmail(email: string): string | null {
  const e = (email || '').trim()
  if (!e) return '请输入邮箱'
  if (!EMAIL_RE.test(e)) return '邮箱格式不正确'
  return null
}

export function normalizePhoneDigits(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) digits = digits.slice(2)
  return digits
}

export function validateRegisterPhone(phone: string): string | null {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return '请输入手机号'
  if (!PHONE_RE.test(digits)) return '手机号须为 11 位中国大陆号码'
  return null
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (password !== confirm) return '两次输入的密码不一致'
  return validatePassword(password)
}

/** 注册账号：含 @ 按邮箱，否则按手机号 */
export function validateRegisterIdentifier(identifier: string): string | null {
  const raw = (identifier || '').trim()
  if (!raw) return '请输入邮箱或手机号'
  if (raw.includes('@')) return validateRegisterEmail(raw)
  return validateRegisterPhone(raw)
}

export function parseRegisterPayload(identifier: string): { email?: string; phone?: string } {
  const raw = identifier.trim()
  if (raw.includes('@')) return { email: raw.toLowerCase() }
  return { phone: normalizePhoneDigits(raw) }
}
