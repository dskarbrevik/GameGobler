"""ROM library management API routes."""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from gamegobler.api.models import GameFile, SearchResult, SystemInfo
from gamegobler.cover_scraper import SYSTEM_MAP, scrape_covers
from gamegobler.rom_parser import parse_rom_filename

router = APIRouter()

# Default library path - can be overridden via settings
SETTINGS_PATH = Path.home() / ".gamegobler" / "settings.json"

# Known ROM / game file extensions (lowercase, with dot)
ROM_EXTENSIONS: set[str] = {
    # Cartridge ROMs
    ".nes", ".unf", ".unif", ".fds",  # NES / Famicom
    ".sfc", ".smc", ".fig", ".swc",  # SNES
    ".z64", ".n64", ".v64",  # N64
    ".gb", ".gbc",  # Game Boy / Color
    ".gba",  # Game Boy Advance
    ".nds", ".dsi",  # Nintendo DS
    ".3ds", ".cia", ".cxi", ".app",  # Nintendo 3DS
    ".nsp", ".xci",  # Nintendo Switch
    ".wud", ".wux", ".wua", ".rpx",  # Wii U
    ".wbfs", ".iso", ".ciso", ".wia", ".rvz", ".gcz", ".gcm",  # Wii / GameCube
    ".sms", ".gg",  # Sega Master System / Game Gear
    ".md", ".gen", ".bin", ".smd",  # Sega Genesis / Mega Drive
    ".32x",  # Sega 32X
    ".cue", ".chd", ".pbp", ".mds", ".mdf", ".ccd",  # Disc-based (multi-system)
    ".gdi",  # Dreamcast
    ".pce", ".sgx",  # TurboGrafx-16 / PC Engine
    ".a26",  # Atari 2600
    ".a52",  # Atari 5200
    ".a78",  # Atari 7800
    ".lnx",  # Atari Lynx
    ".j64", ".jag",  # Atari Jaguar
    ".col",  # ColecoVision
    ".int",  # Intellivision
    ".vec",  # Vectrex
    ".ws", ".wsc",  # WonderSwan / Color
    ".ngp", ".ngc",  # Neo Geo Pocket / Color
    ".psx",  # PlayStation
    ".vpk",  # PS Vita
    ".xbe", ".xiso",  # Xbox
    # Compressed archives containing ROMs
    ".zip", ".7z", ".rar", ".gz",
    # Disk images
    ".dsk", ".d64", ".d71", ".d81", ".tap", ".t64", ".prg", ".crt",  # C64/Amiga
    ".adf", ".adz", ".ipf", ".hdf",  # Amiga
    ".rom", ".mx1", ".mx2",  # MSX
    ".cas", ".wav",  # Cassette-based
    # Standalone / ports
    ".sh", ".desktop",  # Linux scripts / shortcuts for ports
}


def _is_game_file(path: Path) -> bool:
    """Check if a file looks like a game ROM."""
    if path.name.startswith(".") or path.suffix == ".partial":
        return False
    return path.suffix.lower() in ROM_EXTENSIONS


def _get_library_path() -> Path:
    """Get the configured library base path."""
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH) as f:
            settings = json.load(f)
            if "library_path" in settings:
                return Path(settings["library_path"])
    # Default to downloads/roms in the project
    return Path(__file__).resolve().parent.parent.parent.parent / "downloads" / "roms"


@router.get("/search")
async def search_games(q: str, limit: int = 200) -> list[SearchResult]:
    """Search games across all systems by title."""
    if len(q) < 2:
        return []
    library_path = _get_library_path()
    if not library_path.exists():
        return []

    query = q.lower()
    results: list[SearchResult] = []
    for system_dir in sorted(library_path.iterdir()):
        if not system_dir.is_dir() or system_dir.name.startswith("."):
            continue
        for f in sorted(system_dir.iterdir()):
            if not f.is_file() or not _is_game_file(f):
                continue
            meta = parse_rom_filename(f.name)
            title = meta.title if meta else f.name
            if query in title.lower() or query in f.name.lower():
                results.append(
                    SearchResult(
                        name=f.name,
                        size=f.stat().st_size,
                        has_cover=False,
                        meta=meta,
                        system=system_dir.name,
                    )
                )
                if len(results) >= limit:
                    return results
    return results


@router.get("/systems")
async def list_systems() -> list[SystemInfo]:
    """List all systems in the ROM library."""
    library_path = _get_library_path()

    if not library_path.exists():
        return []

    systems: list[SystemInfo] = []
    for system_dir in sorted(library_path.iterdir()):
        if not system_dir.is_dir() or system_dir.name.startswith("."):
            continue

        game_count = 0
        total_size = 0
        for f in system_dir.iterdir():
            if f.is_file() and _is_game_file(f):
                game_count += 1
                total_size += f.stat().st_size

        systems.append(
            SystemInfo(
                name=system_dir.name,
                path=str(system_dir),
                game_count=game_count,
                total_size=total_size,
            )
        )

    return systems


@router.get("/systems/{system_name}/games")
async def list_games(system_name: str) -> list[GameFile]:
    """List all games for a specific system."""
    library_path = _get_library_path()
    system_dir = library_path / system_name

    if not system_dir.exists():
        raise HTTPException(status_code=404, detail=f"System '{system_name}' not found")

    cover_dir = _find_cover_dir(_get_library_path(), system_name)
    games: list[GameFile] = []
    for f in sorted(system_dir.iterdir()):
        if f.is_file() and _is_game_file(f):
            has_cover = _has_cover(f.stem, cover_dir) if cover_dir else False
            meta = parse_rom_filename(f.name)
            games.append(GameFile(name=f.name, size=f.stat().st_size, has_cover=has_cover, meta=meta))

    return games


# ─── Cover art helpers ─────────────────────────────────

_COVER_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}

# Paths relative to library root where ES-DE / scrapers store covers
_COVER_SEARCH_PATHS = [
    "downloaded_media/{system}/covers",
    "downloaded_media/{system}/boxFront",
    "media/{system}/covers",
    "media/{system}/boxFront",
    "images/{system}",
]


def _find_cover_dir(library_path: Path, system_name: str) -> Path | None:
    """Find the first existing cover art directory for a system."""
    for pattern in _COVER_SEARCH_PATHS:
        candidate = library_path / pattern.format(system=system_name)
        if candidate.is_dir() and any(candidate.iterdir()):
            return candidate
    return None


def _has_cover(game_stem: str, cover_dir: Path) -> bool:
    """Check if a cover image exists for a game (by stem name match)."""
    for ext in _COVER_IMAGE_EXTS:
        if (cover_dir / f"{game_stem}{ext}").exists():
            return True
    return False


def _resolve_cover(game_stem: str, cover_dir: Path) -> Path | None:
    """Return the path to a cover image if it exists."""
    for ext in _COVER_IMAGE_EXTS:
        p = cover_dir / f"{game_stem}{ext}"
        if p.exists():
            return p
    return None


@router.get("/systems/{system_name}/games/{game_name}/cover")
async def get_game_cover(system_name: str, game_name: str):
    """Serve the cover art image for a game, if available."""
    library_path = _get_library_path()
    cover_dir = _find_cover_dir(library_path, system_name)
    if not cover_dir:
        raise HTTPException(status_code=404, detail="No cover art directory found")

    # Strip extension to get stem
    game_stem = Path(game_name).stem
    cover_path = _resolve_cover(game_stem, cover_dir)
    if not cover_path:
        raise HTTPException(status_code=404, detail="Cover art not found")

    # Security: ensure resolved path is within the library
    try:
        cover_path.resolve().relative_to(library_path.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(cover_path)


@router.get("/systems/{system_name}/cover-stats")
async def get_cover_stats(system_name: str) -> dict:
    """Get cover art statistics for a system."""
    library_path = _get_library_path()
    system_dir = library_path / system_name
    if not system_dir.exists():
        raise HTTPException(status_code=404, detail=f"System '{system_name}' not found")

    cover_dir = _find_cover_dir(library_path, system_name)
    total = 0
    with_cover = 0
    for f in system_dir.iterdir():
        if f.is_file() and _is_game_file(f):
            total += 1
            if cover_dir and _has_cover(f.stem, cover_dir):
                with_cover += 1

    return {
        "system": system_name,
        "total_games": total,
        "with_cover": with_cover,
        "cover_dir": str(cover_dir) if cover_dir else None,
    }


@router.get("/path")
async def get_library_path() -> dict:
    """Get the current library path."""
    return {"path": str(_get_library_path())}


@router.post("/systems/{system_name}/scrape-covers")
async def scrape_system_covers(system_name: str):
    """Stream cover art downloads for a system via SSE."""
    library_path = _get_library_path()
    system_dir = library_path / system_name
    if not system_dir.exists():
        raise HTTPException(status_code=404, detail=f"System '{system_name}' not found")
    if system_name not in SYSTEM_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"No libretro-thumbnails mapping for '{system_name}'",
        )

    game_stems = [
        f.stem
        for f in sorted(system_dir.iterdir())
        if f.is_file() and _is_game_file(f)
    ]
    if not game_stems:
        raise HTTPException(status_code=400, detail="No games in this system")

    cover_dir = library_path / "downloaded_media" / system_name / "covers"

    async def _event_stream():
        ok = skip = missing = errors = 0
        async for event in scrape_covers(system_name, game_stems, cover_dir):
            status = event["status"]
            if status == "ok":
                ok += 1
            elif status == "skip":
                skip += 1
            elif status == "404":
                missing += 1
            else:
                errors += 1
            event["downloaded"] = ok
            event["skipped"] = skip
            event["not_found"] = missing
            event["errors"] = errors
            yield f"data: {json.dumps(event)}\n\n"
        yield f"data: {json.dumps({'status': 'done', 'downloaded': ok, 'skipped': skip, 'not_found': missing, 'errors': errors, 'total': len(game_stems)})}\n\n"

    return StreamingResponse(_event_stream(), media_type="text/event-stream")


@router.get("/systems/scrape-supported")
async def list_scrape_supported() -> list[str]:
    """Return the list of system names that have libretro-thumbnails mappings."""
    return sorted(SYSTEM_MAP.keys())
