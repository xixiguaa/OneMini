const STORAGE_KEY = 'onemini-user-id'

/** 登录后的服务端用户 ID（数据分区键） */
export function getClientUserId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    if (id) return id
  } catch {
    /* ignore */
  }
  return 'default'
}

export function setClientUserId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function clearClientUserId() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
