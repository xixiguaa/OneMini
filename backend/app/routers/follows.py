"""用户关注。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user
from app.services import follows_store

router = APIRouter(prefix="/users", tags=["follows"])


@router.get("/{user_id}/follow-stats")
def get_follow_stats(user_id: str, viewer_id: str = Depends(get_current_user)):
    try:
        return follows_store.get_follow_stats(user_id, viewer_id=viewer_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{user_id}/follow")
def follow_user(user_id: str, follower_id: str = Depends(get_current_user)):
    try:
        return follows_store.follow(follower_id, user_id)
    except ValueError as exc:
        msg = str(exc)
        if "不能关注自己" in msg:
            raise HTTPException(400, msg) from exc
        if "不存在" in msg:
            raise HTTPException(404, msg) from exc
        raise HTTPException(400, msg) from exc


@router.delete("/{user_id}/follow")
def unfollow_user(user_id: str, follower_id: str = Depends(get_current_user)):
    try:
        return follows_store.unfollow(follower_id, user_id)
    except ValueError as exc:
        msg = str(exc)
        if "不能取消关注自己" in msg:
            raise HTTPException(400, msg) from exc
        raise HTTPException(400, msg) from exc
