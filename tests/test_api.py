"""Tests for the GameGobler API — settings, health, and library routes.

Uses FastAPI TestClient (sync) with a temporary library directory.
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from gamegobler import settings
from gamegobler.api.main import app


@pytest.fixture()
def _isolate_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Redirect settings to tmp so tests don't touch real config."""
    monkeypatch.setattr(settings, "SETTINGS_DIR", tmp_path / ".gamegobler")
    monkeypatch.setattr(settings, "SETTINGS_PATH", tmp_path / ".gamegobler" / "settings.json")


@pytest.fixture()
def library(tmp_path: Path) -> Path:
    """Create a small fake ROM library."""
    lib = tmp_path / "roms"
    # NES system
    nes = lib / "nes"
    nes.mkdir(parents=True)
    (nes / "Game A (USA).nes").write_bytes(b"\x00" * 64)
    (nes / "Game B (Europe) (En,Fr).nes").write_bytes(b"\x00" * 128)
    (nes / ".hidden").write_bytes(b"ignore")
    (nes / "readme.txt").write_bytes(b"not a rom")  # wrong extension
    # SNES system — empty
    (lib / "snes").mkdir()
    return lib


@pytest.fixture()
def client(_isolate_settings, library: Path) -> TestClient:
    """TestClient with settings pointing at the fake library."""
    settings.save({"library_path": str(library)})
    return TestClient(app)


# ── Health ──────────────────────────────────────────────────────────────────


class TestHealth:
    def test_health(self, client: TestClient):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── Settings endpoints ──────────────────────────────────────────────────────


class TestSettingsAPI:
    def test_get_settings(self, client: TestClient):
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert "schema_version" in data
        assert "library_path" in data

    def test_put_settings(self, client: TestClient):
        resp = client.put("/api/settings", json={"library_path": "/new/path"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["library_path"] == "/new/path"


# ── Library: systems ────────────────────────────────────────────────────────


class TestListSystems:
    def test_lists_systems(self, client: TestClient):
        resp = client.get("/api/library/systems")
        assert resp.status_code == 200
        systems = resp.json()
        names = [s["name"] for s in systems]
        assert "nes" in names
        assert "snes" in names

    def test_nes_game_count(self, client: TestClient):
        resp = client.get("/api/library/systems")
        nes = next(s for s in resp.json() if s["name"] == "nes")
        assert nes["game_count"] == 2  # .hidden and readme.txt excluded

    def test_snes_empty(self, client: TestClient):
        resp = client.get("/api/library/systems")
        snes = next(s for s in resp.json() if s["name"] == "snes")
        assert snes["game_count"] == 0

    def test_no_library_path(self, client: TestClient):
        settings.save({"library_path": "/nonexistent/path"})
        resp = client.get("/api/library/systems")
        assert resp.status_code == 200
        assert resp.json() == []


# ── Library: games ──────────────────────────────────────────────────────────


class TestListGames:
    def test_list_nes_games(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/games")
        assert resp.status_code == 200
        games = resp.json()
        names = [g["name"] for g in games]
        assert "Game A (USA).nes" in names
        assert "Game B (Europe) (En,Fr).nes" in names
        assert len(names) == 2

    def test_games_have_metadata(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/games")
        game_a = next(g for g in resp.json() if g["name"] == "Game A (USA).nes")
        assert game_a["meta"]["title"] == "Game A"
        assert game_a["meta"]["regions"] == ["USA"]
        assert game_a["size"] == 64

    def test_system_not_found(self, client: TestClient):
        resp = client.get("/api/library/systems/nonexistent/games")
        assert resp.status_code == 404

    def test_hidden_files_excluded(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/games")
        names = [g["name"] for g in resp.json()]
        assert ".hidden" not in names

    def test_non_rom_excluded(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/games")
        names = [g["name"] for g in resp.json()]
        assert "readme.txt" not in names


# ── Library: search ─────────────────────────────────────────────────────────


class TestSearch:
    def test_search_by_title(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "Game A"})
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["system"] == "nes"
        assert results[0]["meta"]["title"] == "Game A"

    def test_search_case_insensitive(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "game a"})
        assert len(resp.json()) == 1

    def test_search_too_short(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "x"})
        assert resp.json() == []

    def test_search_no_match(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "zzzzzzz"})
        assert resp.json() == []

    def test_search_matches_filename(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "Game B"})
        assert len(resp.json()) == 1

    def test_search_limit(self, client: TestClient):
        resp = client.get("/api/library/search", params={"q": "Game", "limit": 1})
        assert len(resp.json()) == 1


# ── Library: cover stats ───────────────────────────────────────────────────


class TestCoverStats:
    def test_no_covers(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/cover-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_games"] == 2
        assert data["with_cover"] == 0
        assert data["cover_dir"] is None

    def test_system_not_found(self, client: TestClient):
        resp = client.get("/api/library/systems/nonexistent/cover-stats")
        assert resp.status_code == 404

    def test_with_covers(self, client: TestClient, library: Path):
        # Add a cover
        cover_dir = library / "downloaded_media" / "nes" / "covers"
        cover_dir.mkdir(parents=True)
        (cover_dir / "Game A (USA).png").write_bytes(b"png_data")
        resp = client.get("/api/library/systems/nes/cover-stats")
        data = resp.json()
        assert data["with_cover"] == 1
        assert data["cover_dir"] is not None


# ── Library: cover image ───────────────────────────────────────────────────


class TestCoverImage:
    def test_no_cover_dir(self, client: TestClient):
        resp = client.get("/api/library/systems/nes/games/Game A (USA).nes/cover")
        assert resp.status_code == 404

    def test_serve_cover(self, client: TestClient, library: Path):
        cover_dir = library / "downloaded_media" / "nes" / "covers"
        cover_dir.mkdir(parents=True)
        (cover_dir / "Game A (USA).png").write_bytes(b"FAKE_PNG")
        resp = client.get("/api/library/systems/nes/games/Game A (USA).nes/cover")
        assert resp.status_code == 200
        assert resp.content == b"FAKE_PNG"

    def test_cover_not_found(self, client: TestClient, library: Path):
        cover_dir = library / "downloaded_media" / "nes" / "covers"
        cover_dir.mkdir(parents=True)
        (cover_dir / "other.png").write_bytes(b"x")  # need non-empty dir
        resp = client.get("/api/library/systems/nes/games/Game A (USA).nes/cover")
        assert resp.status_code == 404


# ── Library: library path ──────────────────────────────────────────────────


class TestLibraryPath:
    def test_get_path(self, client: TestClient, library: Path):
        resp = client.get("/api/library/path")
        assert resp.status_code == 200
        assert resp.json()["path"] == str(library)


# ── Library: scrape-supported ──────────────────────────────────────────────


class TestScrapeSupported:
    def test_returns_sorted_list(self, client: TestClient):
        resp = client.get("/api/library/systems/scrape-supported")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert data == sorted(data)
        assert "nes" in data
