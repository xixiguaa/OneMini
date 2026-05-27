const STORAGE_KEY = 'onemini-user-id'

/** 匿名用户 ID（仅用于服务端密钥分区，不存储 API Key） */
export function getClientUserId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(STORAGE_KEY, id)
    }
    return id
  } catch {
    return 'default'
  }
}
