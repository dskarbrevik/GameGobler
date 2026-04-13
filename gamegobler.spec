# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for GameGobler single-binary build.

Usage:
    cd /path/to/GameGobler
    # Build frontend first:
    cd web && npm ci && npx vite build && cd ..
    # Then package:
    uv run pyinstaller gamegobler.spec
"""

import os
from pathlib import Path

block_cipher = None

ROOT = Path(SPECPATH)
DIST_DIR = ROOT / "web" / "dist"

if not DIST_DIR.is_dir():
    raise FileNotFoundError(
        f"Frontend build not found at {DIST_DIR}. "
        "Run 'cd web && npm ci && npx vite build' first."
    )

a = Analysis(
    [str(ROOT / "gamegobler" / "api" / "main.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        # Bundle the built frontend
        (str(DIST_DIR), os.path.join("web", "dist")),
        # Bundle the platform modules (needed at runtime)
        (str(ROOT / "gamegobler" / "platform"), os.path.join("gamegobler", "platform")),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "gamegobler.platform.linux",
        "gamegobler.platform.macos",
        "gamegobler.platform.windows",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="GameGobler",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
