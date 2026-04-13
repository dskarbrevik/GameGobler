"""Centralized settings management for GameGobler.

All settings I/O goes through this module. Settings are stored in
``~/.gamegobler/settings.json`` with a ``schema_version`` field for
forward-compatible migrations.
"""

import json
import os
import stat
from pathlib import Path
from typing import Any

SETTINGS_DIR = Path.home() / ".gamegobler"
SETTINGS_PATH = SETTINGS_DIR / "settings.json"

# Bump when the shape of the settings dict changes.
CURRENT_SCHEMA_VERSION = 1


def _migrate(data: dict) -> dict:
    """Migrate settings from older schema versions to the current one."""
    version = data.get("schema_version", 0)

    if version < 1:
        # v0 → v1: add schema_version, normalise registered_devices
        data.setdefault("registered_devices", [])
        data.setdefault("library_path", "")
        data.setdefault("unzip_on_transfer", False)
        data["schema_version"] = 1

    return data


def load() -> dict[str, Any]:
    """Load settings from disk, applying migrations if needed."""
    if not SETTINGS_PATH.exists():
        return _migrate({})
    with open(SETTINGS_PATH) as f:
        data = json.load(f)
    return _migrate(data)


def save(data: dict[str, Any]) -> None:
    """Persist settings to disk with restrictive permissions."""
    data = _migrate(data)
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)
    # Restrict to owner-only read/write
    try:
        os.chmod(SETTINGS_PATH, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass  # Best-effort on Windows


def get(key: str, default: Any = None) -> Any:
    """Read a single setting."""
    return load().get(key, default)


def put(key: str, value: Any) -> None:
    """Write a single setting."""
    data = load()
    data[key] = value
    save(data)


def get_registered_devices() -> list[dict]:
    """Shortcut for the registered_devices list."""
    return load().get("registered_devices", [])


def get_library_path() -> Path:
    """Return the configured library path, falling back to a default."""
    raw = load().get("library_path", "")
    if raw:
        return Path(raw)
    # Fallback: <project_root>/downloads/roms
    return Path(__file__).resolve().parent.parent / "downloads" / "roms"
