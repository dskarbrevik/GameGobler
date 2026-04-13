"""Tests for gamegobler.settings — centralized settings I/O."""

import json
from pathlib import Path

import pytest

from gamegobler import settings


@pytest.fixture()
def settings_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Redirect settings I/O to a temporary directory."""
    settings_path = tmp_path / "settings.json"
    monkeypatch.setattr(settings, "SETTINGS_DIR", tmp_path)
    monkeypatch.setattr(settings, "SETTINGS_PATH", settings_path)
    return tmp_path


# ── load / save round-trip ──────────────────────────────────────────────────


class TestLoadSave:
    def test_load_creates_defaults_when_missing(self, settings_dir: Path):
        data = settings.load()
        assert data["schema_version"] == 1
        assert data["registered_devices"] == []
        assert data["library_path"] == ""
        assert data["unzip_on_transfer"] is False

    def test_save_then_load_round_trip(self, settings_dir: Path):
        settings.save({"library_path": "/roms", "custom_key": 42})
        data = settings.load()
        assert data["library_path"] == "/roms"
        assert data["custom_key"] == 42
        assert data["schema_version"] == 1

    def test_save_creates_directory(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        nested = tmp_path / "deep" / "dir"
        monkeypatch.setattr(settings, "SETTINGS_DIR", nested)
        monkeypatch.setattr(settings, "SETTINGS_PATH", nested / "settings.json")
        settings.save({"library_path": "/x"})
        assert (nested / "settings.json").exists()

    def test_save_writes_valid_json(self, settings_dir: Path):
        settings.save({"library_path": "/foo"})
        raw = (settings_dir / "settings.json").read_text()
        parsed = json.loads(raw)
        assert parsed["library_path"] == "/foo"


# ── migration ───────────────────────────────────────────────────────────────


class TestMigration:
    def test_v0_to_v1(self, settings_dir: Path):
        # Write a v0 file (no schema_version)
        (settings_dir / "settings.json").write_text(json.dumps({"library_path": "/old"}))
        data = settings.load()
        assert data["schema_version"] == 1
        assert data["library_path"] == "/old"
        assert "registered_devices" in data

    def test_already_v1_not_modified(self, settings_dir: Path):
        v1 = {
            "schema_version": 1,
            "registered_devices": [{"path": "/mnt/sd"}],
            "library_path": "/roms",
            "unzip_on_transfer": True,
        }
        (settings_dir / "settings.json").write_text(json.dumps(v1))
        data = settings.load()
        assert data == v1

    def test_migration_is_idempotent(self, settings_dir: Path):
        settings.save({})
        first = settings.load()
        settings.save(first)
        second = settings.load()
        assert first == second


# ── get / put helpers ───────────────────────────────────────────────────────


class TestGetPut:
    def test_get_returns_default_when_missing(self, settings_dir: Path):
        assert settings.get("nonexistent", "fallback") == "fallback"

    def test_get_returns_value(self, settings_dir: Path):
        settings.save({"library_path": "/roms"})
        assert settings.get("library_path") == "/roms"

    def test_put_sets_value(self, settings_dir: Path):
        settings.put("library_path", "/new")
        assert settings.get("library_path") == "/new"

    def test_put_preserves_other_keys(self, settings_dir: Path):
        settings.save({"library_path": "/a", "custom": True})
        settings.put("library_path", "/b")
        assert settings.get("custom") is True


# ── get_registered_devices / get_library_path ───────────────────────────────


class TestHelpers:
    def test_registered_devices_empty_by_default(self, settings_dir: Path):
        assert settings.get_registered_devices() == []

    def test_registered_devices_returns_list(self, settings_dir: Path):
        settings.save({"registered_devices": [{"path": "/x"}]})
        devs = settings.get_registered_devices()
        assert len(devs) == 1
        assert devs[0]["path"] == "/x"

    def test_library_path_fallback(self, settings_dir: Path):
        path = settings.get_library_path()
        # Falls back to <project_root>/downloads/roms
        assert str(path).endswith("downloads/roms")

    def test_library_path_configured(self, settings_dir: Path):
        settings.save({"library_path": "/my/roms"})
        assert settings.get_library_path() == Path("/my/roms")
