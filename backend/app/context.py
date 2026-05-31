"""请求级用户上下文（供 wiki_paths 等深层服务读取）。"""

from contextvars import ContextVar

current_user_id: ContextVar[str | None] = ContextVar("current_user_id", default=None)


def bind_user_context(user_id: str) -> str:
    """在 sync 端点线程内绑定用户（Depends 在主线程设置，不会传播到 run_in_threadpool）。"""
    current_user_id.set(user_id)
    return user_id
