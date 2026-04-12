"""FastAPI application for GameGobler Web UI."""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from gamegobler.api.routers import devices, library, sync

# Persistent settings file in user home directory
SETTINGS_DIR = Path.home() / ".gamegobler"
SETTINGS_PATH = SETTINGS_DIR / "settings.json"

app = FastAPI(
    title="GameGobler API",
    version="0.1.0",
    description="Web API for managing ROM libraries and Android device transfers",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix="/api/devices", tags=["devices"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])


def _load_settings() -> dict:
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH) as f:
            return json.load(f)
    return {}


def _save_settings(settings: dict) -> None:
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(settings, f, indent=2)


@app.get("/api/settings")
async def get_settings() -> dict:
    return _load_settings()


@app.put("/api/settings")
async def update_settings(settings: dict) -> dict:
    _save_settings(settings)
    return settings


def start() -> None:
    import uvicorn
    uvicorn.run("gamegobler.api.main:app", host="0.0.0.0", port=8000, reload=True)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
