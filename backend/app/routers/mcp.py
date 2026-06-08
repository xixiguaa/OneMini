from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import get_current_user
from app.services.mcp.client_manager import get_mcp_manager, mcp_status

router = APIRouter(
    prefix="/mcp",
    tags=["mcp"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/status")
def mcp_status_api(_user_id: str = Depends(get_current_user)):
    settings = get_settings()
    return mcp_status(settings)


@router.get("/tools")
def mcp_tools_api(_user_id: str = Depends(get_current_user)):
    settings = get_settings()
    manager = get_mcp_manager()
    return {
        "enabled": settings.mcp_enabled,
        "connected": manager.enabled,
        "tools": manager.list_tools_payload(),
    }
