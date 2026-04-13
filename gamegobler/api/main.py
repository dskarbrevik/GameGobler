"""FastAPI application for GameGobler Web UI."""

import os
import sys
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from gamegobler import __version__, settings
from gamegobler.api.routers import devices, library, sync

app = FastAPI(
    title="GameGobler API",
    version=__version__,
    description="Web API for managing ROM libraries and device transfers",
)

# CORS: configurable via GAMEGOBLER_CORS_ORIGINS env var (comma-separated).
# Defaults to common local dev origins.
_default_origins = "http://localhost:5173,http://localhost:8000,http://127.0.0.1:5173,http://127.0.0.1:8000"
_origins = os.environ.get("GAMEGOBLER_CORS_ORIGINS", _default_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    """Return a generic 500 for unhandled errors (no stack traces in response)."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])


_ALLOWED_SETTINGS_KEYS = {"library_path", "unzip_on_transfer", "registered_devices"}


@app.get("/api/settings")
async def get_settings() -> dict:
    return settings.load()


@app.put("/api/settings")
async def update_settings(payload: dict) -> dict:
    unknown = set(payload.keys()) - _ALLOWED_SETTINGS_KEYS - {"version"}
    if unknown:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=422,
            detail=f"Unknown settings keys: {', '.join(sorted(unknown))}",
        )
    current = settings.load()
    current.update(payload)
    settings.save(current)
    return current


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/version")
async def version() -> dict:
    """Return current version and check for updates via GitHub Releases."""
    import httpx

    result: dict = {
        "version": __version__,
        "latest": None,
        "update_available": False,
        "release_url": None,
    }
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                "https://api.github.com/repos/dskar/GameGobler/releases/latest",
                headers={"Accept": "application/vnd.github+json"},
            )
        if resp.status_code == 200:
            data = resp.json()
            tag: str = data.get("tag_name", "")
            latest = tag.lstrip("v")
            result["latest"] = latest
            result["release_url"] = data.get("html_url")
            result["update_available"] = latest != __version__
    except Exception:
        pass  # Network errors are non-fatal
    return result


# ─── Serve built frontend (SPA) ───────────────────────────────────────────
# When `web/dist/` exists (production build), serve it as static files with
# a catch-all fallback to index.html for client-side routing.

# When frozen by PyInstaller, bundled data lives under sys._MEIPASS.
# In development, look relative to the repo root.
_BASE_DIR = Path(
    getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent.parent)
)
_DIST_DIR = _BASE_DIR / "web" / "dist"


def _mount_frontend() -> None:
    """Mount the built frontend if the dist directory exists."""
    if not _DIST_DIR.is_dir():
        return

    # Serve static assets (JS, CSS, images) under /assets/
    assets_dir = _DIST_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # Catch-all: any non-API GET returns index.html (SPA fallback)
    @app.get("/{full_path:path}")
    async def _spa_fallback(request: Request, full_path: str):
        # Try to serve a real file from dist first (favicon.svg, etc.)
        file_path = _DIST_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_DIST_DIR / "index.html")


_mount_frontend()


def start() -> None:
    import uvicorn

    # Bind to loopback only by default for security.
    # Override with GAMEGOBLER_HOST / GAMEGOBLER_PORT env vars.
    host = os.environ.get("GAMEGOBLER_HOST", "127.0.0.1")
    port = int(os.environ.get("GAMEGOBLER_PORT", "8000"))

    frozen = getattr(sys, "frozen", False)
    # Disable reload when frozen (PyInstaller) or when frontend is bundled
    reload = not frozen and not _DIST_DIR.is_dir()

    if frozen:
        # When running as a PyInstaller binary, import the app directly
        uvicorn.run(app, host=host, port=port)
    else:
        uvicorn.run("gamegobler.api.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    start()
