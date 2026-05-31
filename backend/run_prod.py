"""生产启动：多 worker，无热重载。

  UVICORN_WORKERS=4 python run_prod.py
"""
import os

import uvicorn

from app.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    workers = max(1, int(os.environ.get("UVICORN_WORKERS", "4")))
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        workers=workers,
        reload=False,
        timeout_keep_alive=30,
    )
