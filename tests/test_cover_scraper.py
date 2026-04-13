"""Tests for gamegobler.cover_scraper — libretro thumbnail scraping."""

from pathlib import Path

import httpx
import pytest
import respx

from gamegobler.cover_scraper import (
    SYSTEM_MAP,
    cover_url,
    libretro_thumb_name,
    scrape_covers,
)


# ── Pure helpers ────────────────────────────────────────────────────────────


class TestLibretroThumbName:
    def test_plain_name(self):
        assert libretro_thumb_name("Super Mario Bros.") == "Super Mario Bros."

    def test_unsafe_chars_replaced(self):
        assert libretro_thumb_name('Game: The "Quest" & More') == "Game_ The _Quest_ _ More"

    def test_slashes_and_backslashes(self):
        assert libretro_thumb_name("A/B\\C") == "A_B_C"

    def test_pipe_and_angle_brackets(self):
        assert libretro_thumb_name("X|Y<Z>") == "X_Y_Z_"


class TestCoverUrl:
    def test_format(self):
        url = cover_url("Nintendo_-_Game_Boy", "Tetris (World)")
        assert url == (
            "https://raw.githubusercontent.com/libretro-thumbnails/"
            "Nintendo_-_Game_Boy/master/Named_Boxarts/Tetris (World).png"
        )

    def test_unsafe_chars_in_stem(self):
        url = cover_url("Repo", 'Game: "X"')
        assert "_" in url  # colons and quotes get translated


# ── scrape_covers async generator ───────────────────────────────────────────


class TestScrapCovers:
    async def test_unknown_system_yields_error(self, tmp_path: Path):
        events = []
        async for ev in scrape_covers("not_a_system", ["g"], tmp_path):
            events.append(ev)
        assert len(events) == 1
        assert events[0]["status"] == "error"
        assert "No libretro-thumbnails mapping" in events[0]["message"]

    async def test_empty_game_list(self, tmp_path: Path):
        events = []
        async for ev in scrape_covers("nes", [], tmp_path):
            events.append(ev)
        assert events == []

    @respx.mock
    async def test_successful_download(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Cool Game (USA)"
        safe = libretro_thumb_name(stem)
        url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
        respx.get(url).respond(200, content=b"\x89PNG_fake")

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path):
            events.append(ev)
        assert len(events) == 1
        assert events[0]["status"] == "ok"
        assert (tmp_path / f"{safe}.png").read_bytes() == b"\x89PNG_fake"

    @respx.mock
    async def test_404_response(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Missing Game (USA)"
        safe = libretro_thumb_name(stem)
        url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
        respx.get(url).respond(404)

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path):
            events.append(ev)
        assert events[0]["status"] == "404"

    @respx.mock
    async def test_http_error(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Err (USA)"
        safe = libretro_thumb_name(stem)
        url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
        respx.get(url).respond(500)

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path):
            events.append(ev)
        assert events[0]["status"] == "error"
        assert "HTTP 500" in events[0]["message"]

    @respx.mock
    async def test_skip_existing(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Exists (USA)"
        safe = libretro_thumb_name(stem)
        # Pre-create the file
        (tmp_path / f"{safe}.png").write_bytes(b"old")

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path, skip_existing=True):
            events.append(ev)
        assert events[0]["status"] == "skip"

    @respx.mock
    async def test_no_skip_when_disabled(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Exists (USA)"
        safe = libretro_thumb_name(stem)
        url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
        respx.get(url).respond(200, content=b"new_data")
        # Pre-create the file
        (tmp_path / f"{safe}.png").write_bytes(b"old")

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path, skip_existing=False):
            events.append(ev)
        assert events[0]["status"] == "ok"
        assert (tmp_path / f"{safe}.png").read_bytes() == b"new_data"

    @respx.mock
    async def test_network_exception(self, tmp_path: Path):
        repo = SYSTEM_MAP["nes"]
        stem = "Timeout (USA)"
        safe = libretro_thumb_name(stem)
        url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
        respx.get(url).side_effect = httpx.ConnectTimeout("timed out")

        events = []
        async for ev in scrape_covers("nes", [stem], tmp_path):
            events.append(ev)
        assert events[0]["status"] == "error"
        assert "timed out" in events[0]["message"]

    @respx.mock
    async def test_index_and_total_fields(self, tmp_path: Path):
        repo = SYSTEM_MAP["gb"]
        stems = ["A (USA)", "B (USA)"]
        for stem in stems:
            safe = libretro_thumb_name(stem)
            url = f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe}.png"
            respx.get(url).respond(200, content=b"img")

        events = []
        async for ev in scrape_covers("gb", stems, tmp_path):
            events.append(ev)
        assert len(events) == 2
        totals = {ev["total"] for ev in events}
        assert totals == {2}
        indices = {ev["current"] for ev in events}
        assert indices == {1, 2}
