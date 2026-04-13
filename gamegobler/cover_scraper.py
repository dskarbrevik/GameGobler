"""Download box art from libretro-thumbnails for ROM collections."""

import asyncio
import logging
from pathlib import Path
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)

_THUMB_BASE = "https://raw.githubusercontent.com/libretro-thumbnails"

# Map local system directory names → libretro-thumbnails repo names.
# Only systems with a known mapping can be scraped.
SYSTEM_MAP: dict[str, str] = {
    "3do": "The_3DO_Company_-_3DO",
    "amiga": "Commodore_-_Amiga",
    "amigacd32": "Commodore_-_Amiga_CD32",
    "amstradcpc": "Amstrad_-_CPC",
    "apple2": "Apple_-_Apple_II",
    "arcade": "MAME",
    "atari2600": "Atari_-_2600",
    "atari5200": "Atari_-_5200",
    "atari7800": "Atari_-_7800",
    "atarijaguar": "Atari_-_Jaguar",
    "atarilynx": "Atari_-_Lynx",
    "atarist": "Atari_-_ST",
    "c64": "Commodore_-_64",
    "colecovision": "Coleco_-_ColecoVision",
    "dreamcast": "Sega_-_Dreamcast",
    "gb": "Nintendo_-_Game_Boy",
    "gba": "Nintendo_-_Game_Boy_Advance",
    "gbc": "Nintendo_-_Game_Boy_Color",
    "gc": "Nintendo_-_GameCube",
    "gamegear": "Sega_-_Game_Gear",
    "genesis": "Sega_-_Mega_Drive_-_Genesis",
    "intellivision": "Mattel_-_Intellivision",
    "mastersystem": "Sega_-_Master_System_-_Mark_III",
    "megadrive": "Sega_-_Mega_Drive_-_Genesis",
    "msx": "Microsoft_-_MSX",
    "msx2": "Microsoft_-_MSX2",
    "n3ds": "Nintendo_-_Nintendo_3DS",
    "n64": "Nintendo_-_Nintendo_64",
    "nds": "Nintendo_-_Nintendo_DS",
    "nes": "Nintendo_-_Nintendo_Entertainment_System",
    "ngp": "SNK_-_Neo_Geo_Pocket",
    "ngpc": "SNK_-_Neo_Geo_Pocket_Color",
    "pce": "NEC_-_PC_Engine_-_TurboGrafx_16",
    "pcfx": "NEC_-_PC-FX",
    "ps2": "Sony_-_PlayStation_2",
    "psp": "Sony_-_PlayStation_Portable",
    "psx": "Sony_-_PlayStation",
    "saturn": "Sega_-_Saturn",
    "sega32x": "Sega_-_32X",
    "segacd": "Sega_-_Mega-CD_-_Sega_CD",
    "snes": "Nintendo_-_Super_Nintendo_Entertainment_System",
    "vectrex": "GCE_-_Vectrex",
    "virtualboy": "Nintendo_-_Virtual_Boy",
    "wii": "Nintendo_-_Wii",
    "wiiu": "Nintendo_-_Wii_U",
    "wonderswan": "Bandai_-_WonderSwan",
    "wonderswancolor": "Bandai_-_WonderSwan_Color",
}

# Characters that libretro-thumbnails replaces with underscore in filenames.
_UNSAFE_CHARS = str.maketrans(
    {
        "&": "_",
        "*": "_",
        "/": "_",
        ":": "_",
        "`": "_",
        "<": "_",
        ">": "_",
        "?": "_",
        "\\": "_",
        "|": "_",
        '"': "_",
    }
)


def libretro_thumb_name(game_stem: str) -> str:
    """Convert a No-Intro game stem to the libretro-thumbnails filename."""
    return game_stem.translate(_UNSAFE_CHARS)


def cover_url(repo_name: str, game_stem: str) -> str:
    """Build the raw GitHub URL for a game's box art."""
    safe_name = libretro_thumb_name(game_stem)
    return f"{_THUMB_BASE}/{repo_name}/master/Named_Boxarts/{safe_name}.png"


async def scrape_covers(
    system_name: str,
    game_stems: list[str],
    output_dir: Path,
    *,
    concurrency: int = 6,
    skip_existing: bool = True,
) -> AsyncIterator[dict]:
    """Download covers for a list of games, yielding progress events.

    Each yielded dict has keys:
        game:     game stem being processed
        status:   "ok" | "skip" | "404" | "error"
        current:  index (1-based)
        total:    total games to process
    """
    repo_name = SYSTEM_MAP.get(system_name)
    if not repo_name:
        yield {
            "game": "",
            "status": "error",
            "current": 0,
            "total": 0,
            "message": f"No libretro-thumbnails mapping for '{system_name}'",
        }
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    total = len(game_stems)
    semaphore = asyncio.Semaphore(concurrency)

    async def _download_one(client: httpx.AsyncClient, idx: int, stem: str) -> dict:
        dest = output_dir / f"{libretro_thumb_name(stem)}.png"
        if skip_existing and dest.exists():
            return {"game": stem, "status": "skip", "current": idx, "total": total}

        url = cover_url(repo_name, stem)
        async with semaphore:
            try:
                resp = await client.get(url, follow_redirects=True)
                if resp.status_code == 200:
                    dest.write_bytes(resp.content)
                    return {
                        "game": stem,
                        "status": "ok",
                        "current": idx,
                        "total": total,
                    }
                elif resp.status_code == 404:
                    return {
                        "game": stem,
                        "status": "404",
                        "current": idx,
                        "total": total,
                    }
                else:
                    return {
                        "game": stem,
                        "status": "error",
                        "current": idx,
                        "total": total,
                        "message": f"HTTP {resp.status_code}",
                    }
            except httpx.HTTPError as exc:
                return {
                    "game": stem,
                    "status": "error",
                    "current": idx,
                    "total": total,
                    "message": str(exc),
                }

    async with httpx.AsyncClient(timeout=15) as client:
        tasks = [
            asyncio.ensure_future(_download_one(client, i + 1, stem))
            for i, stem in enumerate(game_stems)
        ]
        for coro in asyncio.as_completed(tasks):
            result = await coro
            yield result
