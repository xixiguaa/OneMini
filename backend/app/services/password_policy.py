"""注册密码强度（与前端 authValidation 保持一致）。"""

from __future__ import annotations

import re

PASSWORD_MIN = 8
PASSWORD_MAX = 128
_LETTER_RE = re.compile(r"[A-Za-z]")
_SPECIAL_RE = re.compile(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?`~]")


def validate_password(password: str) -> None:
    pwd = password or ""
    if not pwd.strip():
        raise ValueError("请输入密码")
    if len(pwd) < PASSWORD_MIN:
        raise ValueError(f"密码至少 {PASSWORD_MIN} 位")
    if len(pwd) > PASSWORD_MAX:
        raise ValueError(f"密码不能超过 {PASSWORD_MAX} 位")
    if not _LETTER_RE.search(pwd):
        raise ValueError("密码须包含字母")
    if not _SPECIAL_RE.search(pwd):
        raise ValueError("密码须包含特殊字符（如 !@#$%）")
